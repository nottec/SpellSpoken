/**
 * Balance simulation: a bot plays whole runs at pronunciation accuracy p.
 * `npm run sim` (defaults: 400 runs × p ∈ {0.95, 0.85, 0.75, 0.65, 0.50}).
 * Options: --n 200  --p 0.9,0.7  --seed 7  --verbose (prints one run's log).
 * Each cast's rawScore = clamp(normal(p, 0.10), 0, 1); tier-3 phrases use normal(p − 0.05, 0.12).
 */
import {
  newRun, chooseNode, castCard, endTurn, canAct, castBlocker, previewCast, drawPhrase, takeCard, takeRelic, rest, resolveEvent, pickEventCard,
  eventOptionAvailable, buyCard, buyRelic, leaveShop, advance, handCards, intentDamage, effectivePower, nextIntent, stacksOf, hasStatus, cardOf, rng,
  pendingReward, FLOORS, BALANCE, type Run, type Card,
} from "./engine";
import { spellById, type Spell } from "@/data/spells";
import { enemies } from "@/data/enemies";
import { eventById } from "@/data/events";
import { vocabEs } from "@/data/vocab.es";

const lexicon = vocabEs;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
function normal(r: () => number) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const score = (r: () => number, p: number, level: number) => clamp(level === 3 ? p - 0.05 + 0.12 * normal(r) : p + 0.1 * normal(r), 0, 1);
const best = <T,>(xs: T[], f: (x: T) => number) => xs.reduce<{ x: T; v: number } | null>((b, x) => { const v = f(x); return !b || v > b.v ? { x, v } : b; }, null);
const spellOf = (c: Card) => spellById(c.spell);

/* ---------- battle policy ---------- */
function chooseCard(run: Run): string | null {
  const e = run.enemy!;
  const hand = handCards(run).filter((h) => !castBlocker(run, h.card.uid));
  if (!hand.length) return null;
  const incoming = intentDamage(e);
  const protection = run.shield + stacksOf(run.statuses, "armor");
  if (incoming >= 0.6 * run.hp && incoming > protection) {
    const sh = best(hand.filter((h) => h.spell.kind === "shield"), (h) => effectivePower(h.card));
    if (sh) return sh.x.card.uid;
  }
  if (run.hp < 0.35 * run.maxHp) {
    const he = best(hand.filter((h) => h.spell.kind === "heal"), (h) => effectivePower(h.card));
    if (he) return he.x.card.uid;
  }
  const otherAttackPower = (me: Card) => hand.filter((h) => h.card.uid !== me.uid && (h.spell.kind === "attack" || h.spell.kind === "drain") && h.spell.cost <= run.breath - spellOf(me).cost).reduce((a, h) => a + effectivePower(h.card), 0);
  const value = (h: { card: Card; spell: Spell }) => {
    const pv = previewCast(run, h.spell), power = effectivePower(h.card);
    switch (h.spell.kind) {
      case "attack": case "drain": {
        let v = pv.mult * (power + stacksOf(run.statuses, "strength"));
        if (h.spell.kind === "drain" && run.hp < 0.6 * run.maxHp) v *= 1.2;
        if (h.spell.applies?.some((a) => a.status === "exposed") && !hasStatus(e.statuses, "exposed")) v += 0.5 * otherAttackPower(h.card);
        return v;
      }
      case "hex": {
        let v = 0;
        for (const a of h.spell.applies ?? []) {
          if (a.status === "burn") v += a.stacks * Math.min(a.turns, 3);
          if (a.status === "stagger") v += incoming > 0 ? incoming + 4 : 6;
          if (a.status === "weak") v += 0.25 * e.attack * a.turns;
          if (a.status === "chill") v += nextIntent(e) === "charge" ? e.attack : 2;
          if (a.status === "exposed") v += 0.5 * otherAttackPower(h.card);
        }
        if (h.spell.applies?.length && hasStatus(e.statuses, h.spell.applies[0].status)) v *= 0.4;
        return v;
      }
      case "empower": {
        if (h.spell.gain?.breath) return h.spell.cost === 0 ? 60 : 0;
        if (h.spell.applies?.some((a) => a.status === "focus")) return hand.some((o) => o.card.uid !== h.card.uid && o.spell.kind !== "empower") && !hasStatus(run.statuses, "focus") ? 50 : 0;
        if (h.spell.applies?.some((a) => a.status === "strength")) return run.enemy!.hpNow > 60 ? 10 : 0;
        return 0;
      }
      case "shield": return incoming > protection ? 0.4 * power : 0;
      case "heal": return run.hp < 0.6 * run.maxHp ? 0.5 * power : 0;
    }
  };
  const pickBest = best(hand, value);
  return pickBest && pickBest.v > 0 ? pickBest.x.card.uid : null;
}

/* ---------- out-of-battle policy ---------- */
function chooseDoor(run: Run): number {
  const kinds = run.map[run.floor].map((n) => n.kind);
  const at = (k: string) => kinds.indexOf(k as never);
  const hp = run.hp / run.maxHp;
  if (hp < 0.5 && at("rest") >= 0) return at("rest");
  if (run.ink >= 60 && at("merchant") >= 0) return at("merchant");
  if (hp > 0.7 && at("elite") >= 0) return at("elite");
  if (at("fight") >= 0) return at("fight");
  if (at("event") >= 0) return at("event");
  if (at("rest") >= 0) return at("rest");
  if (at("merchant") >= 0) return at("merchant");
  return 0;
}
function pickRewardCard(run: Run): number {
  const have = new Set(run.deck.map((c) => spellOf(c).element));
  const cards = run.rewards!.cards;
  const worth = (s: Spell) => (s.power || (s.kind === "hex" ? 8 * s.tier : 6)) + (have.has(s.element) ? 0 : 100);
  return best(cards.map((_, i) => i), (i) => worth(cards[i]))!.x;
}
const upgradeTarget = (run: Run) => best(run.deck.filter((c) => !c.up), (c) => effectivePower(c) * (spellOf(c).kind === "attack" || spellOf(c).kind === "drain" ? 1 : 0.5))?.x;
const removeTarget = (run: Run) => {
  if (run.deck.length < 8) return undefined;
  return best(run.deck, (c) => -(spellOf(c).kind === "attack" || spellOf(c).kind === "drain" ? effectivePower(c) : 20))?.x;
};
function chooseEventOption(run: Run, p: number): number | null {
  const ev = eventById(run.event!.id);
  const avail = ev.options.map((o, i) => ({ o, i })).filter(({ i }) => eventOptionAvailable(run, i));
  if (!avail.length) return null;
  const trial = avail.find(({ o }) => o.trial);
  if (p >= 0.75 && trial) return trial.i;
  const plain = avail.filter(({ o }) => !o.trial);
  const want = (kind: string) => plain.find(({ o }) => o.effects?.some((f) => f.kind === kind));
  if (run.hp < 0.6 * run.maxHp && want("heal")) return want("heal")!.i;
  if (want("card") && !want("card")!.o.effects!.some((f) => f.kind === "ink" && f.amount < 0)) return want("card")!.i;
  if (want("ink") && want("ink")!.o.effects!.every((f) => f.kind !== "ink" || f.amount > 0)) return want("ink")!.i;
  if (want("upgrade")) return want("upgrade")!.i;
  return (want("leave") ?? plain[0] ?? avail[0]).i;
}

/* ---------- one run ---------- */
export type RunSummary = { won: boolean; floor: number; casts: number; words: number; turns: number; backfires: number; dead: boolean };
export function playRun(p: number, seed: number, verbose = false): RunSummary {
  const r = rng(seed * 7 + 1);
  const ms = p >= 0.85 ? 1800 : 3000;
  let run = newRun(seed);
  let guard = 0;
  while (run.phase !== "dead" && run.phase !== "won" && guard++ < 5000) {
    switch (run.phase) {
      case "map": run = chooseNode(run, chooseDoor(run)); break;
      case "battle": {
        const uid = chooseCard(run);
        if (uid && canAct(run)) {
          const spell = spellOf(cardOf(run, uid)!);
          const word = drawPhrase(run, spell, lexicon, r);
          run = castCard(run, uid, word, score(r, p, run.cursed ? Math.min(3, spell.tier + 1) : spell.tier), ms, false, r).run;
        } else {
          run = endTurn(run, r).run;
          if (run.phase === "battle" && run.turn > 60) { run = { ...run, phase: "dead" }; }   // stalemate guard
        }
        break;
      }
      case "reward": run = pendingReward(run) === "card" ? takeCard(run, pickRewardCard(run)) : takeRelic(run, 0); break;
      case "rest": { const up = upgradeTarget(run); run = run.hp < 0.6 * run.maxHp || !up ? rest(run, "heal") : rest(run, "study", up.uid); break; }
      case "event": {
        if (run.event!.stage === "choose") {
          const idx = chooseEventOption(run, p);
          if (idx === null) { run = advance(run); break; }
          const opt = eventById(run.event!.id).options[idx];
          run = resolveEvent(run, idx, opt.trial ? score(r, p, opt.trial.level) : undefined);
        } else if (run.event!.stage === "pick") {
          const target = run.event!.pending === "remove" ? removeTarget(run) ?? run.deck.find((c) => spellOf(c).id === "susurro") ?? run.deck[0] : upgradeTarget(run) ?? run.deck[0];
          run = pickEventCard(run, target.uid);
        } else run = advance(run);
        break;
      }
      case "merchant": {
        const shop = run.shop!;
        const relic = shop.relics.findIndex((x) => !x.sold && x.price <= run.ink);
        if (relic >= 0) { run = buyRelic(run, relic); break; }
        const card = best(shop.cards.map((_, i) => i).filter((i) => !shop.cards[i].sold && shop.cards[i].price <= run.ink), (i) => shop.cards[i].spell.power + shop.cards[i].spell.tier * 10);
        if (card) { run = buyCard(run, card.x); break; }
        run = leaveShop(run); break;
      }
    }
  }
  if (verbose) console.log(run.log.join("\n"), "\n", JSON.stringify({ phase: run.phase, floor: run.floor, hp: run.hp, deck: run.deck.map((c) => c.spell + (c.up ? "+" : "")), relics: run.relics, stats: run.stats }, null, 0));
  return { won: run.phase === "won", dead: run.phase === "dead", floor: run.phase === "won" ? FLOORS : run.floor + 1, casts: run.stats.casts, words: run.wordsSeen.length, turns: run.stats.turns, backfires: run.stats.backfires };
}

/* ---------- table ---------- */
export function simulate(ps: number[], n: number, seed0 = 1) {
  const rows: string[] = [];
  rows.push("| p    | win%  | avg floor | casts | words | turns | backfire% |");
  rows.push("|------|-------|-----------|-------|-------|-------|-----------|");
  for (const p of ps) {
    const s = { won: 0, floor: 0, casts: 0, words: 0, turns: 0, backfires: 0 };
    for (let i = 0; i < n; i++) {
      const out = playRun(p, seed0 + i);
      s.won += out.won ? 1 : 0; s.floor += out.floor; s.casts += out.casts; s.words += out.words; s.turns += out.turns; s.backfires += out.backfires;
    }
    rows.push(`| ${p.toFixed(2)} | ${((100 * s.won) / n).toFixed(1).padStart(5)} | ${(s.floor / n).toFixed(2).padStart(9)} | ${(s.casts / n).toFixed(1).padStart(5)} | ${(s.words / n).toFixed(1).padStart(5)} | ${(s.turns / n).toFixed(1).padStart(5)} | ${((100 * s.backfires) / Math.max(1, s.casts)).toFixed(1).padStart(9)} |`);
  }
  return rows.join("\n");
}

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
// what-if knobs: scale every enemy's hp / attack before playing (the data file keeps the real numbers)
const hpMul = Number(arg("hp") ?? 1), atkMul = Number(arg("atk") ?? 1);
if (hpMul !== 1 || atkMul !== 1) { for (const e of enemies) { e.hp = Math.round(e.hp * hpMul); e.attack = Math.round(e.attack * atkMul); } console.log(`enemy hp ×${hpMul}, attack ×${atkMul}`); }
if (arg("scale")) { BALANCE.floorScale = Number(arg("scale")); console.log(`floor scale ${BALANCE.floorScale}`); }
const n = Number(arg("n") ?? 400);
const ps = (arg("p") ?? "0.95,0.85,0.75,0.65,0.50").split(",").map(Number);
const seed = Number(arg("seed") ?? 1);
if (argv.includes("--verbose")) playRun(ps[0], seed, true);
else { const t0 = Date.now(); console.log(simulate(ps, n, seed)); console.log(`\n${n} runs per p, seeds ${seed}…${seed + n - 1}, ${((Date.now() - t0) / 1000).toFixed(1)} s`); }
