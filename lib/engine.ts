import { spells, type Spell } from "@/data/spells";
import { enemies, ROOM_PLAN, type EnemyDef, type Intent } from "@/data/enemies";
import { relics, type Relic } from "@/data/relics";
import type { Vocab } from "@/data/vocab";
import { BACKFIRE_BELOW } from "./scoring";

/* ---------- seeded RNG ---------- */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];

/* ---------- run state ---------- */
export type Enemy = EnemyDef & { hpNow: number; step: number; charged: boolean };

export type Run = {
  seed: number;
  room: number;
  hp: number;
  maxHp: number;
  shield: number;              // absorbs incoming damage, decays each enemy turn
  hand: string[];
  relics: string[];
  enemy: Enemy;
  echoUsed: boolean;
  cursed: boolean;             // next incantation drawn one level harder
  resonance: number;           // 0..3 consecutive good casts; 3 = next cast crits
  grudges: string[];           // vocab ids that beat you this run
  recent: string[];            // last drawn vocab ids, avoid repeats
  wordsSeen: string[];
  stats: { casts: number; perfect: number; backfires: number; damage: number; scoreSum: number };
  phase: "battle" | "reward" | "dead" | "won";
  rewards?: Reward[];
};

export type Reward = { kind: "spell"; spell: Spell } | { kind: "relic"; relic: Relic } | { kind: "heal"; amount: number };

export const nextIntent = (e: Enemy): Intent => e.pattern[e.step % e.pattern.length];

function spawn(r: () => number, room: number): Enemy {
  const kind = ROOM_PLAN[room];
  const def = pick(r, enemies.filter((e) => e.kind === kind));
  const scale = 1 + room * 0.04;
  return { ...def, hp: Math.round(def.hp * scale), hpNow: Math.round(def.hp * scale), attack: Math.round(def.attack * scale), step: 0, charged: false };
}

export function newRun(seed = Date.now() % 100000): Run {
  const r = rng(seed);
  const attacks = spells.filter((s) => s.tier === 1 && s.kind === "attack");
  const utility = spells.filter((s) => s.tier === 1 && s.kind !== "attack");
  const hand: string[] = [];
  while (hand.length < 2) { const s = pick(r, attacks); if (!hand.includes(s.id)) hand.push(s.id); }
  hand.push(pick(r, utility).id);
  return {
    seed, room: 0, hp: 70, maxHp: 70, shield: 0, hand, relics: [],
    enemy: spawn(r, 0), echoUsed: false, cursed: false, resonance: 0, grudges: [], recent: [], wordsSeen: [],
    stats: { casts: 0, perfect: 0, backfires: 0, damage: 0, scoreSum: 0 },
    phase: "battle",
  };
}

export const relicsOf = (run: Run) => run.relics.map((id) => relics.find((x) => x.id === id)!);
const sum = (run: Run, k: keyof Relic) => relicsOf(run).reduce((a, x) => a + (Number(x[k]) || 0), 0);

/* ---------- drawing the incantation ---------- */
export function drawPhrase(run: Run, spell: Spell, lexicon: Vocab[], rand = Math.random): Vocab {
  const level = Math.min(3, spell.tier + (run.cursed ? 1 : 0)) as 1 | 2 | 3;
  let pool = lexicon.filter((v) => v.level === level && spell.themes.includes(v.theme) && !run.recent.includes(v.id));
  if (pool.length < 3) pool = lexicon.filter((v) => v.level === level && !run.recent.includes(v.id));
  if (!pool.length) pool = lexicon.filter((v) => v.level === level);
  const grudgePool = pool.filter((v) => run.grudges.includes(v.id));
  if (grudgePool.length && rand() < 0.4) return grudgePool[Math.floor(rand() * grudgePool.length)];
  return pool[Math.floor(rand() * pool.length)];
}

/* ---------- casting ---------- */
export type CastResult = {
  score: number; backfire: boolean; crit: boolean; resonant: boolean;
  weak: boolean; resist: boolean; underTier: boolean;
  damage: number; echoDamage: number; selfDamage: number; healed: number; shielded: number;
  intent: Intent; enemyHit: number; blocked: number; enemyHealed: number;
  killed: boolean; wordMastered: boolean; grudge: boolean;
};

export function cast(run: Run, spell: Spell, word: Vocab, rawScore: number, ms: number, wordMastered: boolean, rand = Math.random): { run: Run; result: CastResult } {
  const r = structuredClone(run);
  const score = Math.min(1, rawScore + sum(r, "scoreBonus"));
  const backfire = score < BACKFIRE_BELOW;
  const weak = r.enemy.weak === spell.element;
  const resist = r.enemy.resist === spell.element;
  const underTier = !!r.enemy.minTier && spell.tier < r.enemy.minTier;
  const resonant = r.resonance >= 3;

  r.recent = [...r.recent.slice(-5), word.id];
  if (!r.wordsSeen.includes(word.id)) r.wordsSeen.push(word.id);
  r.cursed = false;

  let damage = 0, echoDamage = 0, selfDamage = 0, healed = 0, shielded = 0, crit = false;
  let grudge = false;

  if (backfire) {
    selfDamage = 6; r.hp = Math.max(0, r.hp - selfDamage);
    r.stats.backfires++; r.resonance = 0;
    if (!r.grudges.includes(word.id)) r.grudges.push(word.id); grudge = true;
  } else {
    const mult = 0.5 + score;
    const critChance = (score >= 0.85 && ms < 2500 ? 0.3 : 0.05) + sum(r, "critBonus");
    crit = resonant || rand() < critChance;
    const masteryMult = wordMastered ? 1.15 : 1;
    if (spell.kind === "attack" || spell.kind === "drain") {
      damage = Math.round(spell.power * mult * (weak ? 2 : 1) * (resist ? 0.5 : 1) * (underTier ? 0.5 : 1) * masteryMult * (crit ? 1.5 : 1));
      if (relicsOf(r).some((x) => x.echo) && !r.echoUsed) { echoDamage = Math.round(damage * 0.5); r.echoUsed = true; }
      const total = damage + echoDamage;
      r.enemy.hpNow = Math.max(0, r.enemy.hpNow - total);
      r.stats.damage += total;
      const ls = sum(r, "lifesteal") + (spell.kind === "drain" ? 0.5 : 0);
      if (ls) { healed = Math.round(total * ls); r.hp = Math.min(r.maxHp, r.hp + healed); }
    } else if (spell.kind === "shield") {
      shielded = Math.round(spell.power * mult * (crit ? 1.5 : 1) * masteryMult);
      r.shield += shielded;
    } else if (spell.kind === "heal") {
      healed = Math.round(spell.power * mult * (crit ? 1.5 : 1) * masteryMult);
      r.hp = Math.min(r.maxHp, r.hp + healed);
    }
    if (score >= 0.9) r.stats.perfect++;
    if (score < 0.7 && !r.grudges.includes(word.id)) { r.grudges.push(word.id); grudge = true; }
    if (score >= 0.7) r.grudges = r.grudges.filter((g) => g !== word.id);
    r.resonance = resonant ? 0 : score >= 0.8 ? r.resonance + 1 : 0;
  }
  r.stats.casts++; r.stats.scoreSum += score;

  /* enemy turn */
  const killed = r.enemy.hpNow <= 0;
  const intent = nextIntent(r.enemy);
  let enemyHit = 0, blocked = 0, enemyHealed = 0;
  if (!killed && r.hp > 0) {
    if (intent === "attack") {
      const raw = r.enemy.attack * (r.enemy.charged ? 2 : 1); r.enemy.charged = false;
      const afterRelic = Math.max(0, raw - sum(r, "block"));
      blocked = Math.min(r.shield, afterRelic); r.shield -= blocked;
      enemyHit = afterRelic - blocked; r.hp = Math.max(0, r.hp - enemyHit);
    } else if (intent === "charge") r.enemy.charged = true;
    else if (intent === "curse") r.cursed = true;
    else if (intent === "heal") { enemyHealed = Math.round(r.enemy.hp * 0.12); r.enemy.hpNow = Math.min(r.enemy.hp, r.enemy.hpNow + enemyHealed); }
    r.enemy.step++;
    r.shield = Math.floor(r.shield * 0.5); // shields fade
  }

  if (r.hp <= 0) r.phase = "dead";
  else if (killed) { if (r.room >= ROOM_PLAN.length - 1) r.phase = "won"; else { r.phase = "reward"; r.rewards = rollRewards(r); } }

  return { run: r, result: { score, backfire, crit, resonant, weak, resist, underTier, damage, echoDamage, selfDamage, healed, shielded, intent, enemyHit, blocked, enemyHealed, killed, wordMastered, grudge } };
}

/* ---------- rewards ---------- */
function rollRewards(run: Run): Reward[] {
  const r = rng(run.seed * 31 + run.room * 7);
  const next = run.room + 1;
  const maxTier = (next >= 5 ? 3 : next >= 2 ? 2 : 1) as 1 | 2 | 3;
  const spellPool = spells.filter((s) => !run.hand.includes(s.id) && s.tier === maxTier);
  const relicPool = relics.filter((x) => !run.relics.includes(x.id));
  const out: Reward[] = [];
  if (spellPool.length) out.push({ kind: "spell", spell: pick(r, spellPool) });
  if (relicPool.length) out.push({ kind: "relic", relic: pick(r, relicPool) });
  if (spellPool.length > 1) { let s = pick(r, spellPool); let t = 0; while (out.some((o) => o.kind === "spell" && o.spell.id === s.id) && t++ < 10) s = pick(r, spellPool); out.push({ kind: "spell", spell: s }); }
  else out.push({ kind: "heal", amount: Math.round(run.maxHp * 0.3) });
  if (run.hp < run.maxHp * 0.5) out[out.length - 1] = { kind: "heal", amount: Math.round(run.maxHp * 0.35) };
  return out.slice(0, 3);
}

export function takeReward(run: Run, reward: Reward): Run {
  const r = structuredClone(run);
  if (reward.kind === "spell") r.hand.push(reward.spell.id);
  if (reward.kind === "relic") { r.relics.push(reward.relic.id); if (reward.relic.maxHp) { r.maxHp += reward.relic.maxHp; r.hp += reward.relic.maxHp; } }
  if (reward.kind === "heal") r.hp = Math.min(r.maxHp, r.hp + reward.amount);
  r.room++;
  r.enemy = spawn(rng(r.seed + r.room * 101), r.room);
  r.echoUsed = false; r.shield = 0; r.cursed = false;
  r.phase = "battle"; r.rewards = undefined;
  return r;
}

export const elementVs = (e: Spell["element"], enemy: Enemy) => enemy.weak === e ? "weak" : enemy.resist === e ? "resist" : "neutral";
