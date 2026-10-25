/**
 * The whole game, pure: no DOM, no fetch, no React. Randomness comes from the run seed
 * (sub-seeded from run state so nothing has to be stored); the only injected randomness
 * is the `rand` parameter used for crits and phrase draws. Every public function returns
 * a new Run (structuredClone) and never mutates its input. See docs/DESIGN.md §1–§8, §11.
 */
import { spells, spellById, spellName, spellDesc, upgradedPower, isDamageKind, STACK_STATUSES, STATUS_LABEL, RARITY_WEIGHT, type Spell, type Element, type Status, type StatusId, type StatusApply } from "@/data/spells";
import { enemyById, type EnemyDef, type Intent } from "@/data/enemies";
import { relics, relicById, type Relic } from "@/data/relics";
import { eventById, type EventEffect } from "@/data/events";
import type { Vocab } from "@/data/vocab";
import { generateMap, FLOORS, isCombat, type MapNode, type NodeKind } from "./map";
import { BACKFIRE_BELOW } from "./scoring";

export type { Status, StatusId, StatusApply, Element, Spell } from "@/data/spells";
export type { MapNode, NodeKind } from "./map";
export type { Intent, EnemyDef } from "@/data/enemies";
export type { Relic } from "@/data/relics";
export { FLOORS } from "./map";

/* ---------- constants (balance knobs) ---------- */
export const HAND_SIZE = 4;
export const BASE_BREATH = 3;
export const START_HP = 70;
export const START_INK = 30;
export const GRUDGE_BELOW = 0.7;
export const RESONANCE_AT = 3;
/** Mutable so lib/sim.ts can sweep it; the game never changes it. Enemy hp/attack × (1 + floor × floorScale). */
export const BALANCE = { floorScale: 0.05 };
export const REST_HEAL = 0.3;
export const CARD_PRICE: Record<1 | 2 | 3, number> = { 1: 35, 2: 55, 3: 80 };
export const RELIC_PRICE = 110;
export const REMOVE_PRICE = 45;
export const UPGRADE_PRICE = 35;
export const LOG_LINES = 20;

/* ---------- seeded RNG ---------- */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}
const pick = <T,>(r: () => number, arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
function shuffle<T>(r: () => number, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weightedPick<T>(r: () => number, items: readonly T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x < 0) return items[i]; }
  return items[items.length - 1];
}
/** Sub-seed from run state: reproducible without storing an RNG in the run. */
const subSeed = (run: Run, salt: number) => ((run.seed * 7919 + run.floor * 104729 + run.turn * 977 + run.stats.casts * 31 + run.deck.length * 131 + salt * 15485863) >>> 0) || 1;

/* ---------- types ---------- */
export type Phase = "map" | "battle" | "reward" | "rest" | "event" | "merchant" | "dead" | "won";
export type ReactionId = "wildfire" | "steam" | "storm" | "eclipse" | "dusk";
export type Card = { uid: string; spell: string; up: boolean };     // uid unique within a run
export type Enemy = EnemyDef & { hpNow: number; step: number; charged: boolean; statuses: Status[] };
export type ShopCard = { spell: Spell; price: number; sold: boolean };
export type ShopRelic = { relic: Relic; price: number; sold: boolean };
export type Shop = { cards: ShopCard[]; relics: ShopRelic[]; removePrice: number; upgradePrice: number };
export type Rewards = { cards: Spell[]; relics: Relic[]; ink: number; cardTaken: boolean; relicTaken: boolean };
export type EventState = { id: string; stage: "choose" | "pick" | "done"; pending?: "remove" | "upgrade"; outcome?: string };
export type RunStats = { casts: number; perfect: number; backfires: number; damage: number; scoreSum: number; turns: number; inkEarned: number; maxChain: number; reactions: number; elites: number };

export type Run = {
  seed: number; floor: number; map: MapNode[][]; path: number[];
  hp: number; maxHp: number; shield: number; ink: number;
  deck: Card[]; draw: string[]; hand: string[]; discard: string[];
  breath: number; maxBreath: number; redrawsLeft: number; turn: number;
  relics: string[]; statuses: Status[];
  enemy: Enemy | null; echoUsed: boolean; cursed: boolean; resonance: number;
  lastElement: Element | null; chain: number;
  grudges: string[]; recent: string[]; wordsSeen: string[];
  battleScores: number[];                      // for ink
  stats: RunStats;
  phase: Phase;
  rewards?: Rewards;
  event?: EventState;
  shop?: Shop;
  log: string[];                               // last 20 human-readable lines, newest last
  perfectUsed: boolean;                        // perfectBreath relic already refunded this turn
};

export type CastResult = {
  score: number; backfire: boolean; crit: boolean; resonant: boolean;
  weak: boolean; resist: boolean; underTier: boolean; exposed: boolean;
  chain: number;                 // consecutive same-element casts including this one (1 = none, 0 = backfire)
  reaction: ReactionId | null;
  damage: number; echoDamage: number; armorAbsorbed: number; selfDamage: number; healed: number; shielded: number;
  applied: { status: StatusId; stacks: number; turns: number; target: "enemy" | "self" }[];
  gained: { breath?: number };
  killed: boolean; wordMastered: boolean; grudge: boolean;
  breathLeft: number;
};

export type TurnResult = {
  intent: Intent; staggered: boolean; hits: number; enemyHit: number; blocked: number; armorAbsorbed: number;
  enemyHealed: number; burnDamage: number; armorGained: number; cursed: boolean; silenced: boolean;
  thorns: number; regen: number; killed: boolean; dead: boolean;
};

export type CastPreview = {
  affordable: boolean; silenced: boolean; weak: boolean; resist: boolean; underTier: boolean;
  chain: number; reaction: ReactionId | null; mult: number;   // mult = everything except score, crit and mastery
};

/* ---------- reactions ---------- */
export const REACTIONS: Record<string, ReactionId> = { "wind>fire": "wildfire", "fire>water": "steam", "water>wind": "storm", "shadow>light": "eclipse", "light>shadow": "dusk" };
export const reactionFor = (prev: Element | null, cur: Element): ReactionId | null => (prev && prev !== cur ? REACTIONS[`${prev}>${cur}`] ?? null : null);
export const REACTION_TEXT: Record<ReactionId, string> = {
  wildfire: "Wildfire: burn doubled, +25% damage", steam: "Steam: +50% damage, clears burn", storm: "Storm: also staggers",
  eclipse: "Eclipse: guaranteed crit", dusk: "Dusk: drains all damage dealt",
};

/* ---------- statuses ---------- */
export const statusOf = (list: Status[], id: StatusId) => list.find((s) => s.id === id);
export const stacksOf = (list: Status[], id: StatusId) => statusOf(list, id)?.stacks ?? 0;
export const hasStatus = (list: Status[], id: StatusId) => !!statusOf(list, id);
/** Stack statuses add stacks (turns = max); duration statuses add turns. Mutates `list`. */
function addStatus(list: Status[], id: StatusId, stacks: number, turns: number) {
  const cur = statusOf(list, id);
  if (!cur) { list.push({ id, stacks, turns }); return; }
  if (STACK_STATUSES.has(id)) { cur.stacks += stacks; cur.turns = Math.max(cur.turns, turns); }
  else if (id === "focus") { cur.stacks = 1; cur.turns = 99; }
  else { cur.turns += turns; }
}
const dropStatus = (list: Status[], id: StatusId) => list.filter((s) => s.id !== id);
/** turns −1 (99 = this battle, never expires); armor halves. Removes anything at 0. */
function tickStatuses(list: Status[], keepArmor = 0): Status[] {
  return list
    .map((s) => s.id === "armor" ? { ...s, stacks: Math.floor((s.stacks - keepArmor) / 2) + keepArmor } : s.turns >= 99 ? s : { ...s, turns: s.turns - 1 })
    .filter((s) => (s.id === "armor" || s.id === "stagger" ? s.stacks > 0 : s.turns > 0));
}
const fmtApplied = (a: { status: StatusId; stacks: number; turns: number }) => `${STATUS_LABEL[a.status]} ${STACK_STATUSES.has(a.status) || a.status === "focus" ? a.stacks : a.turns}`;

/* ---------- small helpers ---------- */
export const relicsOf = (run: Run) => run.relics.map((id) => relicById(id)).filter(Boolean);
const sum = (run: Run, k: keyof Relic) => relicsOf(run).reduce((a, x) => a + (typeof x[k] === "number" ? (x[k] as number) : 0), 0);
const has = (run: Run, k: keyof Relic) => relicsOf(run).some((x) => !!x[k]);
export const resonanceAt = (run: Run) => relicsOf(run).reduce((m, x) => Math.min(m, x.resonanceAt ?? m), RESONANCE_AT);
export const handSizeOf = (run: Run) => HAND_SIZE + sum(run, "handSize");
export const nextIntent = (e: Enemy): Intent => e.pattern[e.step % e.pattern.length];
export const elementVs = (e: Element, enemy: Enemy) => (enemy.weak === e ? "weak" : enemy.resist === e ? "resist" : "neutral");
export const cardOf = (run: Run, uid: string) => run.deck.find((c) => c.uid === uid);
export const spellOfCard = (card: Card) => spellById(card.spell);
export const effectivePower = (card: Card) => (card.up ? upgradedPower(spellOfCard(card).power) : spellOfCard(card).power);
export const cardName = (card: Card, lang: string) => spellName(spellOfCard(card), lang) + (card.up ? "+" : "");
export const cardDesc = (card: Card) => spellDesc(spellOfCard(card), card.up);
export const handCards = (run: Run) => run.hand.map((uid) => cardOf(run, uid)!).filter(Boolean).map((card) => ({ card, spell: spellOfCard(card) }));
export const currentNode = (run: Run): MapNode | undefined => run.map[run.floor]?.[run.path[run.floor]];
/** Damage the enemy's next action would deal before block, armor and shield (0 for non-attacks). */
export function intentDamage(e: Enemy): number {
  const i = nextIntent(e), base = e.attack * (e.charged ? 2 : 1) * (hasStatus(e.statuses, "weak") ? 0.75 : 1);
  return i === "attack" ? Math.round(base) : i === "double" ? 2 * Math.round(base * 0.6) : 0;
}
function log(r: Run, line: string) { r.log.push(line); if (r.log.length > LOG_LINES) r.log.splice(0, r.log.length - LOG_LINES); }
const nextUid = (r: Run) => `c${r.deck.reduce((m, c) => Math.max(m, parseInt(c.uid.slice(1), 10) || 0), 0) + 1}`;
function addCard(r: Run, spell: Spell): Card { const c = { uid: nextUid(r), spell: spell.id, up: false }; r.deck.push(c); return c; }
function addRelic(r: Run, id: string) {
  const x = relicById(id); r.relics.push(id);
  if (x.maxHp) { r.maxHp += x.maxHp; r.hp += x.maxHp; }
  if (x.breath) r.maxBreath += x.breath;
}

/* ---------- new run ---------- */
export function newRun(seed = Date.now() % 100000): Run {
  const r = rng(seed);
  const map = generateMap(r);
  // three tier-1 attacks of three different elements, seeded
  const attacks = shuffle(r, spells.filter((s) => s.tier === 1 && s.cost === 1 && isDamageKind(s.kind)));
  const starters: Spell[] = [];
  for (const s of attacks) if (starters.length < 3 && !starters.some((x) => x.element === s.element)) starters.push(s);
  const hex = pick(r, spells.filter((s) => s.tier === 1 && s.kind === "hex"));
  const deck: Card[] = [...starters, spellById("escudo"), spellById("aliento"), spellById("susurro"), hex].map((s, i) => ({ uid: `c${i + 1}`, spell: s.id, up: false }));
  return {
    seed, floor: 0, map, path: [],
    hp: START_HP, maxHp: START_HP, shield: 0, ink: START_INK,
    deck, draw: [], hand: [], discard: [],
    breath: BASE_BREATH, maxBreath: BASE_BREATH, redrawsLeft: 1, turn: 0,
    relics: [], statuses: [],
    enemy: null, echoUsed: false, cursed: false, resonance: 0,
    lastElement: null, chain: 0,
    grudges: [], recent: [], wordsSeen: [], battleScores: [],
    stats: { casts: 0, perfect: 0, backfires: 0, damage: 0, scoreSum: 0, turns: 0, inkEarned: 0, maxChain: 0, reactions: 0, elites: 0 },
    phase: "map", log: ["The grimoire opens."], perfectUsed: false,
  };
}

/* ---------- map flow ---------- */
export function chooseNode(run: Run, idx: number): Run {
  if (run.phase !== "map") throw new Error("chooseNode: not on the map");
  const node = run.map[run.floor]?.[idx];
  if (!node) throw new Error(`chooseNode: no door ${idx} on floor ${run.floor}`);
  const r = structuredClone(run);
  r.path[r.floor] = idx;
  if (isCombat(node.kind)) return startBattle(r, node.enemyId);
  if (node.kind === "rest") { r.phase = "rest"; log(r, "A quiet room with a fire."); }
  else if (node.kind === "event") { r.phase = "event"; r.event = { id: node.eventId!, stage: "choose" }; log(r, `${eventById(node.eventId!).title}.`); }
  else { r.phase = "merchant"; r.shop = rollShop(r); log(r, "A merchant unrolls her wares."); }
  return r;
}

function advanceInPlace(r: Run) {
  r.rewards = undefined; r.event = undefined; r.shop = undefined; r.enemy = null;
  r.floor += 1;
  r.phase = r.floor >= FLOORS ? "won" : "map";
}
/** Leave the current node: floor + 1, back to the map (or "won" past the last floor). */
export function advance(run: Run): Run { const r = structuredClone(run); advanceInPlace(r); return r; }

/* ---------- battle ---------- */
export function spawnEnemy(id: string, floor: number): Enemy {
  const def = enemyById(id);
  if (!def) throw new Error(`spawnEnemy: unknown enemy ${id}`);
  const s = 1 + floor * BALANCE.floorScale;
  const hp = Math.round(def.hp * s);
  return { ...def, hp, hpNow: hp, attack: Math.round(def.attack * s), step: 0, charged: false, statuses: [] };
}

function drawCards(r: Run, n: number) {
  for (let i = 0; i < n; i++) {
    if (!r.draw.length) {
      if (!r.discard.length) break;
      r.draw = shuffle(rng(subSeed(r, 11 + i)), r.discard); r.discard = [];
    }
    r.hand.push(r.draw.pop()!);
  }
}
function newTurn(r: Run) {
  r.breath = r.maxBreath; r.redrawsLeft = 1 + sum(r, "redraws"); r.perfectUsed = false;
  if (has(r, "turnFocus")) addStatus(r.statuses, "focus", 1, 99);
  drawCards(r, handSizeOf(r));
}

/** Enter a battle against the current node's enemy (or `enemyId`). Shuffles the deck, draws a hand, breath = max. */
export function startBattle(run: Run, enemyId?: string): Run {
  const r = structuredClone(run);
  const id = enemyId ?? currentNode(r)?.enemyId;
  if (!id) throw new Error("startBattle: no enemy here");
  r.enemy = spawnEnemy(id, r.floor);
  r.shield = 0; r.statuses = []; r.echoUsed = false; r.cursed = false; r.lastElement = null; r.chain = 0; r.battleScores = [];
  const armor = sum(r, "startArmor"); if (armor) addStatus(r.statuses, "armor", armor, 99);
  r.turn = 1;
  r.draw = shuffle(rng(subSeed(r, 3)), r.deck.map((c) => c.uid)); r.hand = []; r.discard = [];
  newTurn(r);
  r.phase = "battle";
  log(r, `${r.enemy.name} blocks the way.`);
  return r;
}

/** Why a card cannot be cast right now, or null when it can. */
export function castBlocker(run: Run, uid: string): string | null {
  if (run.phase !== "battle" || !run.enemy) return "not in battle";
  if (!run.hand.includes(uid)) return "card not in hand";
  const card = cardOf(run, uid); if (!card) return "unknown card";
  const spell = spellOfCard(card);
  if (spell.cost > run.breath) return "not enough breath";
  if (spell.tier === 3 && hasStatus(run.statuses, "silence")) return "silenced";
  return null;
}
export const canAct = (run: Run) => run.phase === "battle" && run.hand.some((uid) => !castBlocker(run, uid));

/** What a cast of `spell` would get right now, apart from score, crit and mastery. */
export function previewCast(run: Run, spell: Spell): CastPreview {
  const e = run.enemy;
  const weak = !!e && e.weak === spell.element, resist = !!e && e.resist === spell.element;
  const underTier = !!e?.minTier && spell.tier < e.minTier;
  const chain = run.lastElement === spell.element ? run.chain + 1 : 1;
  const reaction = reactionFor(run.lastElement, spell.element);
  const chainMult = 1 + (0.15 + sum(run, "chainBonus")) * Math.min(chain - 1, 3);
  const reactionMult = reaction === "wildfire" ? 1.25 : reaction === "steam" ? 1.5 : 1;
  const mult = isDamageKind(spell.kind)
    ? chainMult * reactionMult * (weak ? 2 : 1) * (resist ? 0.5 : 1) * (underTier ? 0.5 : 1) * (e && hasStatus(e.statuses, "exposed") ? 1.5 : 1)
    : chainMult;
  return { affordable: run.phase === "battle" && spell.cost <= run.breath, silenced: spell.tier === 3 && hasStatus(run.statuses, "silence"), weak, resist, underTier, chain, reaction, mult };
}

/** Spend a free phrase redraw. Returns the run unchanged when none are left. */
export function useRedraw(run: Run): Run {
  if (run.redrawsLeft <= 0) return run;
  const r = structuredClone(run); r.redrawsLeft -= 1; return r;
}

/* ---------- drawing the incantation ---------- */
/** Level = spell tier (+1 if cursed) or an explicit `{ level }` for trials; themed when a spell; skips the last 5; 40% grudge redraw. */
export function drawPhrase(run: Run, spellOrLevel: Spell | { level: 1 | 2 | 3 }, lexicon: Vocab[], rand = Math.random): Vocab {
  const spell = "tier" in spellOrLevel ? spellOrLevel : null;
  const level = Math.min(3, spell ? spell.tier + (run.cursed ? 1 : 0) : (spellOrLevel as { level: 1 | 2 | 3 }).level) as 1 | 2 | 3;
  let pool = lexicon.filter((v) => v.level === level && (!spell || spell.themes.includes(v.theme)) && !run.recent.includes(v.id));
  if (pool.length < 3) pool = lexicon.filter((v) => v.level === level && !run.recent.includes(v.id));
  if (!pool.length) pool = lexicon.filter((v) => v.level === level);
  if (!pool.length) pool = lexicon;
  const grudgePool = pool.filter((v) => run.grudges.includes(v.id));
  if (grudgePool.length && rand() < 0.4) return pick(rand, grudgePool);
  return pick(rand, pool);
}

/* ---------- casting ---------- */
/**
 * Cast the card `uid` from the hand. Throws when the card is not castable
 * (check `castBlocker`/`previewCast`/`canAct` first). Order of operations: docs/DESIGN.md §1.
 */
export function castCard(run: Run, uid: string, word: Vocab, rawScore: number, ms: number, wordMastered: boolean, rand = Math.random): { run: Run; result: CastResult } {
  const why = castBlocker(run, uid);
  if (why) throw new Error(`castCard: ${why}`);
  const r = structuredClone(run);
  const e = r.enemy!;
  const card = cardOf(r, uid)!, spell = spellOfCard(card);
  const dmgKind = isDamageKind(spell.kind);

  // 1. score (focus is consumed either way)
  const focus = hasStatus(r.statuses, "focus");
  if (focus) r.statuses = dropStatus(r.statuses, "focus");
  const score = Math.min(1, rawScore + sum(r, "scoreBonus") + (focus ? 0.1 : 0));
  const backfire = score < BACKFIRE_BELOW;

  r.recent = [...r.recent.slice(-4), word.id];
  if (!r.wordsSeen.includes(word.id)) r.wordsSeen.push(word.id);
  r.cursed = false;

  const weak = e.weak === spell.element, resist = e.resist === spell.element, underTier = !!e.minTier && spell.tier < e.minTier;
  const exposed = hasStatus(e.statuses, "exposed");
  const resonant = r.resonance >= resonanceAt(r);
  let chain = r.lastElement === spell.element ? r.chain + 1 : 1;
  let reaction = reactionFor(r.lastElement, spell.element);
  let crit = false, damage = 0, echoDamage = 0, armorAbsorbed = 0, selfDamage = 0, healed = 0, shielded = 0, grudge = false;
  const applied: CastResult["applied"] = [];
  const gained: CastResult["gained"] = {};
  const name = spell.name;

  if (backfire) {
    // 2. nothing lands; it hurts
    selfDamage = 2 + 2 * spell.tier; r.hp = Math.max(0, r.hp - selfDamage);
    r.stats.backfires++; r.resonance = 0;
    if (!r.grudges.includes(word.id)) r.grudges.push(word.id); grudge = true;
    r.lastElement = null; r.chain = 0; chain = 0; reaction = null;
    log(r, `${name} fizzles and burns you for ${selfDamage}.`);
  } else {
    // 3–4. multipliers and crit
    const power = effectivePower(card) + (dmgKind ? stacksOf(r.statuses, "strength") : 0);
    const chainMult = 1 + (0.15 + sum(r, "chainBonus")) * Math.min(chain - 1, 3);
    const reactionMult = reaction === "wildfire" ? 1.25 : reaction === "steam" ? 1.5 : 1;
    const critChance = (score >= 0.85 && ms < 2500 ? 0.3 : 0.05) + sum(r, "critBonus");
    crit = resonant || reaction === "eclipse" || rand() < critChance;
    const base = (0.5 + score) * (wordMastered ? 1.15 : 1) * (crit ? 1.5 : 1) * chainMult;
    // 5. kind effects
    if (dmgKind) {
      const mult = base * (weak ? 2 : 1) * (resist ? 0.5 : 1) * (underTier ? 0.5 : 1) * (exposed ? 1.5 : 1) * reactionMult;
      damage = Math.round(power * mult);
      if (has(r, "echo") && !r.echoUsed) { echoDamage = Math.round(damage * 0.5); r.echoUsed = true; }
      const armor = statusOf(e.statuses, "armor");
      if (armor) {
        const a = Math.min(armor.stacks, damage); armor.stacks -= a; damage -= a;
        const b = Math.min(armor.stacks, echoDamage); armor.stacks -= b; echoDamage -= b;
        armorAbsorbed = a + b; if (armor.stacks <= 0) e.statuses = dropStatus(e.statuses, "armor");
      }
      const total = damage + echoDamage;
      e.hpNow = Math.max(0, e.hpNow - total); r.stats.damage += total;
      let ls = sum(r, "lifesteal") + (spell.kind === "drain" ? spell.drain ?? 0.5 : 0);
      if (reaction === "dusk") ls = Math.max(ls, 1);
      ls = Math.min(1, ls);
      if (ls > 0 && total > 0) { healed = Math.min(Math.round(total * ls), r.maxHp - r.hp); r.hp += healed; }
    } else if (spell.kind === "shield") { shielded = Math.round(power * base); r.shield += shielded; }
    else if (spell.kind === "heal") { healed = Math.min(Math.round(power * base), r.maxHp - r.hp); r.hp += healed; }
    if (spell.gain?.breath) { r.breath += spell.gain.breath; gained.breath = spell.gain.breath; }
    // statuses: steam clears burn first, then this cast's statuses, then storm's stagger
    if (reaction === "steam") e.statuses = dropStatus(e.statuses, "burn");
    (spell.applies ?? []).forEach((a: StatusApply, i: number) => {
      let stacks = a.stacks, turns = a.turns;
      if (card.up && i === 0) { if (STACK_STATUSES.has(a.status)) stacks += 1; else turns += 1; }
      if (a.status === "burn") { stacks += sum(r, "burnBonus"); if (reaction === "wildfire") stacks *= 2; }
      addStatus(a.target === "enemy" ? e.statuses : r.statuses, a.status, stacks, turns);
      if (a.status === "chill" && a.target === "enemy") e.charged = false;
      applied.push({ status: a.status, stacks, turns, target: a.target });
    });
    if (reaction === "storm") { addStatus(e.statuses, "stagger", 1, 99); applied.push({ status: "stagger", stacks: 1, turns: 99, target: "enemy" }); }
    // 6. bookkeeping
    if (score >= 0.9) r.stats.perfect++;
    if (score < GRUDGE_BELOW && !r.grudges.includes(word.id)) { r.grudges.push(word.id); grudge = true; }
    if (score >= GRUDGE_BELOW) r.grudges = r.grudges.filter((g) => g !== word.id);
    r.resonance = resonant ? 0 : score >= 0.8 ? r.resonance + 1 : 0;
    r.lastElement = spell.element; r.chain = chain; r.stats.maxChain = Math.max(r.stats.maxChain, chain);
    if (reaction) r.stats.reactions++;
    const tail = applied.map(fmtApplied).join(", ");
    const effect = dmgKind ? `lands for ${damage}${echoDamage ? ` and echoes for ${echoDamage}` : ""}${armorAbsorbed ? ` (${armorAbsorbed} absorbed by armor)` : ""}${healed ? `, draining ${healed}` : ""}`
      : spell.kind === "shield" ? `raises ${shielded} shield` : spell.kind === "heal" ? `mends ${healed}` : gained.breath ? `gives ${gained.breath} breath` : "takes hold";
    log(r, `${name}${card.up ? "+" : ""} ${effect}${crit ? ", critical" : ""}${reaction ? ` — ${reaction}` : ""}.${tail ? ` ${tail}.` : ""}`);
  }
  r.stats.casts++; r.stats.scoreSum += score; r.battleScores.push(score);

  // 7. breath and the card
  r.breath -= spell.cost;
  if (!backfire && score >= 0.95 && has(r, "perfectBreath") && !r.perfectUsed && spell.cost > 0) { r.breath += 1; r.perfectUsed = true; gained.breath = (gained.breath ?? 0) + 1; }
  r.hand = r.hand.filter((u) => u !== uid); r.discard.push(uid);

  const killed = e.hpNow <= 0;
  if (r.hp <= 0) { r.phase = "dead"; log(r, "Your own words undo you."); }
  else if (killed) finishBattle(r);

  return { run: r, result: { score, backfire, crit, resonant, weak, resist, underTier, exposed, chain, reaction, damage, echoDamage, armorAbsorbed, selfDamage, healed, shielded, applied, gained, killed, wordMastered, grudge, breathLeft: r.breath } };
}

/* ---------- enemy phase ---------- */
/** End the player turn: discard, enemy acts, statuses tick, new hand. `rand` is reserved (enemy actions are deterministic). */
export function endTurn(run: Run, rand: () => number = Math.random): { run: Run; result: TurnResult } {
  void rand;
  if (run.phase !== "battle" || !run.enemy) throw new Error("endTurn: not in battle");
  const r = structuredClone(run);
  const e = r.enemy!;
  const res: TurnResult = { intent: nextIntent(e), staggered: false, hits: 0, enemyHit: 0, blocked: 0, armorAbsorbed: 0, enemyHealed: 0, burnDamage: 0, armorGained: 0, cursed: false, silenced: false, thorns: 0, regen: 0, killed: false, dead: false };
  r.discard.push(...r.hand); r.hand = [];
  r.stats.turns++;

  // burn
  const burn = stacksOf(e.statuses, "burn");
  if (burn) { res.burnDamage = Math.min(burn, e.hpNow); e.hpNow -= res.burnDamage; r.stats.damage += res.burnDamage; log(r, `${e.name} burns for ${res.burnDamage}.`); }
  if (e.hpNow <= 0) { res.killed = true; finishBattle(r); return { run: r, result: res }; }

  // action
  const stagger = statusOf(e.statuses, "stagger");
  if (stagger) {
    res.staggered = true; stagger.stacks -= 1; if (stagger.stacks <= 0) e.statuses = dropStatus(e.statuses, "stagger");
    log(r, `${e.name} staggers and does nothing.`);
  } else {
    const weakMult = hasStatus(e.statuses, "weak") ? 0.75 : 1;
    const hit = (raw: number) => {
      let d = Math.max(0, raw - sum(r, "block"));
      const armor = statusOf(r.statuses, "armor");
      if (armor) { const a = Math.min(armor.stacks, d); armor.stacks -= a; d -= a; res.armorAbsorbed += a; if (armor.stacks <= 0) r.statuses = dropStatus(r.statuses, "armor"); }
      const b = Math.min(r.shield, d); r.shield -= b; res.blocked += b; d -= b;
      r.hp = Math.max(0, r.hp - d); res.enemyHit += d; res.hits++;
    };
    switch (res.intent) {
      case "attack": { const raw = Math.round(e.attack * (e.charged ? 2 : 1) * weakMult); hit(raw); e.charged = false; log(r, `${e.name} strikes for ${raw}${res.blocked ? `, ${res.blocked} shielded` : ""}${res.armorAbsorbed ? `, ${res.armorAbsorbed} on armor` : ""}; you lose ${res.enemyHit}.`); break; }
      case "double": { const each = Math.round(e.attack * 0.6 * (e.charged ? 2 : 1) * weakMult); hit(each); hit(each); e.charged = false; log(r, `${e.name} strikes twice for ${each}${res.blocked ? `, ${res.blocked} shielded` : ""}${res.armorAbsorbed ? `, ${res.armorAbsorbed} on armor` : ""}; you lose ${res.enemyHit}.`); break; }
      case "charge": if (hasStatus(e.statuses, "chill")) log(r, `${e.name} tries to gather power, but the chill holds it.`); else { e.charged = true; log(r, `${e.name} gathers power.`); } break;
      case "curse": r.cursed = true; res.cursed = true; log(r, `${e.name} curses your next words.`); break;
      case "silence": addStatus(r.statuses, "silence", 1, 2); res.silenced = true; log(r, `${e.name} silences you: no tier-3 spells next turn.`); break;
      case "heal": res.enemyHealed = Math.min(Math.round(e.hp * 0.12), e.hp - e.hpNow); e.hpNow += res.enemyHealed; log(r, `${e.name} mends ${res.enemyHealed}.`); break;
      case "block": res.armorGained = Math.round(e.attack * 1.5); addStatus(e.statuses, "armor", res.armorGained, 99); log(r, `${e.name} hardens: ${res.armorGained} armor.`); break;
    }
    if (res.hits > 0 && sum(r, "thorns") > 0) { res.thorns = sum(r, "thorns"); e.hpNow = Math.max(0, e.hpNow - res.thorns); r.stats.damage += res.thorns; log(r, `Your thorns cut it for ${res.thorns}.`); }
  }
  e.step++;
  e.statuses = tickStatuses(e.statuses, res.armorGained);   // armor gained this phase does not halve yet
  if (e.hpNow <= 0) { res.killed = true; finishBattle(r); return { run: r, result: res }; }

  // player side
  r.shield = Math.floor(r.shield / 2);
  res.regen = Math.min(stacksOf(r.statuses, "regen"), r.maxHp - r.hp);
  if (res.regen > 0) { r.hp += res.regen; log(r, `You regenerate ${res.regen}.`); }
  r.statuses = tickStatuses(r.statuses);
  if (r.hp <= 0) { res.dead = true; r.phase = "dead"; log(r, "You fall."); return { run: r, result: res }; }

  // new turn
  r.turn++;
  newTurn(r);
  return { run: r, result: res };
}

/* ---------- winning, rewards ---------- */
function tierWeights(floor: number): [number, number, number] {
  if (floor <= 1) return [0.7, 0.3, 0];
  if (floor <= 4) return [0.2, 0.65, 0.15];
  return [0, 0.5, 0.5];
}
function rollCards(r: () => number, floor: number, n: number): Spell[] {
  const w = tierWeights(floor), out: Spell[] = []; let tier2 = 0;
  for (let i = 0; i < n * 10 && out.length < n; i++) {
    let tier = weightedPick(r, [1, 2, 3], w);
    if (floor <= 1 && tier === 2 && tier2 >= 1) tier = 1;
    const pool = spells.filter((s) => s.tier === tier && !out.includes(s));
    if (!pool.length) continue;
    const s = weightedPick(r, pool, pool.map((x) => RARITY_WEIGHT[x.rarity]));
    out.push(s); if (s.tier === 2) tier2++;
  }
  return out;
}
const rollRelics = (r: () => number, run: Run, n: number) => shuffle(r, relics.filter((x) => !run.relics.includes(x.id))).slice(0, n);

function finishBattle(r: Run) {
  const e = r.enemy!;
  const avg = r.battleScores.length ? r.battleScores.reduce((a, b) => a + b, 0) / r.battleScores.length : 0;
  const ink = Math.round(e.ink * (0.75 + 0.5 * avg) * (1 + sum(r, "inkBonus")));
  r.ink += ink; r.stats.inkEarned += ink;
  r.statuses = []; r.shield = 0; r.hand = []; r.draw = []; r.discard = []; r.cursed = false;
  if (e.kind === "elite" || e.kind === "boss") r.stats.elites++;
  log(r, `${e.name} falls.${ink ? ` +${ink} ink.` : ""}`);
  if (e.kind === "final" || currentNode(r)?.kind === "final") { r.phase = "won"; return; }
  const rr = rng(subSeed(r, 7));
  const withRelics = e.kind === "elite" || e.kind === "boss";
  r.rewards = { cards: rollCards(rr, r.floor, 3), relics: withRelics ? rollRelics(rr, r, 3) : [], ink, cardTaken: false, relicTaken: false };
  r.phase = "reward";
}
/** Resolve the battle as won (ink, rewards, phase). Normally called by the engine when the enemy dies. */
export function winBattle(run: Run): Run { const r = structuredClone(run); finishBattle(r); return r; }

/** Which reward choice is still open: "card", then "relic" (if any were offered), else null. */
export const pendingReward = (run: Run): "card" | "relic" | null =>
  !run.rewards ? null : !run.rewards.cardTaken ? "card" : run.rewards.relics.length && !run.rewards.relicTaken ? "relic" : null;
function settleRewards(r: Run) { if (!pendingReward(r)) advanceInPlace(r); }

/** Take reward card `idx` (null = skip). Advances to the map when nothing else is pending. */
export function takeCard(run: Run, idx: number | null): Run {
  if (run.phase !== "reward" || !run.rewards) throw new Error("takeCard: no rewards");
  const r = structuredClone(run);
  if (idx !== null) { const s = r.rewards!.cards[idx]; if (!s) throw new Error("takeCard: bad index"); addCard(r, s); log(r, `Learned ${s.name}.`); }
  r.rewards!.cardTaken = true;
  settleRewards(r); return r;
}
/** Take reward relic `idx` (null = skip). Advances to the map when nothing else is pending. */
export function takeRelic(run: Run, idx: number | null): Run {
  if (run.phase !== "reward" || !run.rewards) throw new Error("takeRelic: no rewards");
  const r = structuredClone(run);
  if (idx !== null) { const x = r.rewards!.relics[idx]; if (!x) throw new Error("takeRelic: bad index"); addRelic(r, x.id); log(r, `Took ${x.name}.`); }
  r.rewards!.relicTaken = true;
  settleRewards(r); return r;
}

/* ---------- rest ---------- */
/** Heal 30% max HP, upgrade a card ("study"), or remove one ("forget"); then advance. */
export function rest(run: Run, choice: "heal" | "study" | "forget", cardUid?: string): Run {
  if (run.phase !== "rest") throw new Error("rest: not resting");
  const r = structuredClone(run);
  if (choice === "heal") { const n = Math.min(Math.round(r.maxHp * REST_HEAL), r.maxHp - r.hp); r.hp += n; log(r, `You rest and recover ${n}.`); }
  else {
    const c = cardUid ? cardOf(r, cardUid) : undefined;
    if (!c) throw new Error("rest: choose a card");
    if (choice === "study") { if (c.up) throw new Error("rest: already upgraded"); c.up = true; log(r, `You study ${spellOfCard(c).name}: it is now ${spellOfCard(c).name}+.`); }
    else { if (r.deck.length <= 1) throw new Error("rest: cannot forget your last card"); r.deck = r.deck.filter((x) => x.uid !== c.uid); log(r, `You forget ${spellOfCard(c).name}.`); }
  }
  advanceInPlace(r); return r;
}

/* ---------- events ---------- */
const inkCost = (effects: EventEffect[] = []) => effects.reduce((a, f) => a + (f.kind === "ink" && f.amount < 0 ? -f.amount : 0), 0);
/** False when the option costs more ink than you have, or needs a card you do not have. */
export function eventOptionAvailable(run: Run, idx: number): boolean {
  if (!run.event) return false;
  const opt = eventById(run.event.id)?.options[idx];
  if (!opt) return false;
  const fx = opt.effects ?? [];
  if (inkCost(fx) > run.ink) return false;
  if (fx.some((f) => f.kind === "remove") && run.deck.length <= 1) return false;
  if (fx.some((f) => f.kind === "upgrade") && !run.deck.some((c) => !c.up)) return false;
  return true;
}
function applyEffects(r: Run, effects: EventEffect[]): string[] {
  const out: string[] = [];
  const rr = rng(subSeed(r, 13));
  for (const f of effects) {
    switch (f.kind) {
      case "heal": { const n = Math.min(Math.round(r.maxHp * f.pct), r.maxHp - r.hp); r.hp += n; out.push(`Healed ${n}.`); break; }
      case "damage": r.hp = Math.max(0, r.hp - f.amount); out.push(`Lost ${f.amount} life.`); break;
      case "ink": r.ink += f.amount; out.push(f.amount >= 0 ? `+${f.amount} ink.` : `Paid ${-f.amount} ink.`); break;
      case "maxhp": r.maxHp = Math.max(1, r.maxHp + f.amount); r.hp = f.amount > 0 ? r.hp + f.amount : Math.min(r.hp, r.maxHp); out.push(f.amount >= 0 ? `+${f.amount} max life.` : `−${-f.amount} max life.`); break;
      case "relic": { const pool = relics.filter((x) => !r.relics.includes(x.id)); if (pool.length) { const x = pick(rr, pool); addRelic(r, x.id); out.push(`Found ${x.name}.`); } break; }
      case "card": { const [s] = f.tier ? [weightedPick(rr, spells.filter((x) => x.tier === f.tier), spells.filter((x) => x.tier === f.tier).map((x) => RARITY_WEIGHT[x.rarity]))] : rollCards(rr, r.floor, 1); if (s) { addCard(r, s); out.push(`Learned ${s.name}.`); } break; }
      case "remove": if (r.deck.length > 1) { r.event!.pending = "remove"; out.push("Choose a card to forget."); } break;
      case "upgrade": if (r.deck.some((c) => !c.up)) { r.event!.pending = "upgrade"; out.push("Choose a card to upgrade."); } break;
      case "breath": r.maxBreath += f.amount; out.push(`+${f.amount} max breath.`); break;
      case "purgeGrudges": out.push(r.grudges.length ? `${r.grudges.length} grudges forgiven.` : "No grudges to forgive."); r.grudges = []; break;
      case "leave": out.push("You walk on."); break;
    }
  }
  return out;
}
/** Choose option `idx`; trials need the `score` of the phrase the UI captured. Unavailable options return the run unchanged. */
export function resolveEvent(run: Run, idx: number, score?: number): Run {
  if (run.phase !== "event" || !run.event || run.event.stage !== "choose") throw new Error("resolveEvent: no event to resolve");
  const opt = eventById(run.event.id)?.options[idx];
  if (!opt) throw new Error("resolveEvent: bad option");
  if (!eventOptionAvailable(run, idx)) return run;
  const r = structuredClone(run);
  let note = "", effects = opt.effects ?? [];
  if (opt.trial) { const ok = (score ?? 0) >= opt.trial.threshold; effects = ok ? opt.trial.success : opt.trial.failure; note = ok ? "The trial is passed. " : "The trial fails. "; }
  const lines = applyEffects(r, effects);
  r.event!.outcome = (note + lines.join(" ")).trim() || "Nothing happens.";
  r.event!.stage = r.event!.pending ? "pick" : "done";
  log(r, r.event!.outcome);
  if (r.hp <= 0) { r.phase = "dead"; log(r, "You fall."); }
  return r;
}
/** Complete a pending `remove`/`upgrade` from an event with card `uid`. */
export function pickEventCard(run: Run, uid: string): Run {
  if (run.phase !== "event" || !run.event || run.event.stage !== "pick" || !run.event.pending) throw new Error("pickEventCard: nothing pending");
  const r = structuredClone(run);
  const c = cardOf(r, uid); if (!c) throw new Error("pickEventCard: unknown card");
  const name = spellOfCard(c).name;
  if (r.event!.pending === "remove") { if (r.deck.length <= 1) throw new Error("pickEventCard: last card"); r.deck = r.deck.filter((x) => x.uid !== uid); r.event!.outcome = `${r.event!.outcome ?? ""} ${name} is forgotten.`.trim(); }
  else { if (c.up) throw new Error("pickEventCard: already upgraded"); c.up = true; r.event!.outcome = `${r.event!.outcome ?? ""} ${name} becomes ${name}+.`.trim(); }
  r.event!.pending = undefined; r.event!.stage = "done";
  log(r, r.event!.outcome!);
  return r;
}

/* ---------- merchant ---------- */
function rollShop(r: Run): Shop {
  const rr = rng(subSeed(r, 17));
  const cards = rollCards(rr, r.floor, 4).map((spell) => ({ spell, price: CARD_PRICE[spell.tier] + Math.round((rr() - 0.5) * 10), sold: false }));
  const shopRelics = rollRelics(rr, r, 2).map((relic) => ({ relic, price: RELIC_PRICE + Math.round((rr() - 0.5) * 20), sold: false }));
  return { cards, relics: shopRelics, removePrice: REMOVE_PRICE, upgradePrice: UPGRADE_PRICE };
}
/** Buy shop card `i`. Returns the run unchanged when sold out or unaffordable. */
export function buyCard(run: Run, i: number): Run {
  const it = run.phase === "merchant" ? run.shop?.cards[i] : undefined;
  if (!it || it.sold || run.ink < it.price) return run;
  const r = structuredClone(run);
  r.ink -= it.price; r.shop!.cards[i].sold = true; addCard(r, it.spell); log(r, `Bought ${it.spell.name} for ${it.price} ink.`);
  return r;
}
/** Buy shop relic `i`. Returns the run unchanged when sold out or unaffordable. */
export function buyRelic(run: Run, i: number): Run {
  const it = run.phase === "merchant" ? run.shop?.relics[i] : undefined;
  if (!it || it.sold || run.ink < it.price) return run;
  const r = structuredClone(run);
  r.ink -= it.price; r.shop!.relics[i].sold = true; addRelic(r, it.relic.id); log(r, `Bought ${it.relic.name} for ${it.price} ink.`);
  return r;
}
/** Pay to remove card `uid`. Returns the run unchanged when unaffordable or it is your last card. */
export function buyRemove(run: Run, uid: string): Run {
  const c = cardOf(run, uid);
  if (run.phase !== "merchant" || !run.shop || !c || run.ink < run.shop.removePrice || run.deck.length <= 1) return run;
  const r = structuredClone(run);
  r.ink -= r.shop!.removePrice; r.deck = r.deck.filter((x) => x.uid !== uid); log(r, `Paid ${r.shop!.removePrice} ink to forget ${spellOfCard(c).name}.`);
  return r;
}
/** Pay to upgrade card `uid`. Returns the run unchanged when unaffordable or already upgraded. */
export function buyUpgrade(run: Run, uid: string): Run {
  const c = cardOf(run, uid);
  if (run.phase !== "merchant" || !run.shop || !c || c.up || run.ink < run.shop.upgradePrice) return run;
  const r = structuredClone(run);
  r.ink -= r.shop!.upgradePrice; cardOf(r, uid)!.up = true; log(r, `Paid ${r.shop!.upgradePrice} ink: ${spellOfCard(c).name} is now ${spellOfCard(c).name}+.`);
  return r;
}
export function leaveShop(run: Run): Run {
  if (run.phase !== "merchant") throw new Error("leaveShop: not at the merchant");
  const r = structuredClone(run); advanceInPlace(r); return r;
}
