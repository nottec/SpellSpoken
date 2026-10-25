/**
 * Engine rule checks (node:assert). Run with `npm run check`.
 * Pure-engine invariants from docs/DESIGN.md §1–§8; these must keep passing after balance changes.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  newRun, chooseNode, startBattle, castCard, endTurn, canAct, castBlocker, previewCast, useRedraw, drawPhrase, winBattle,
  takeCard, takeRelic, advance, rest, resolveEvent, pickEventCard, eventOptionAvailable, buyCard, buyRelic, buyRemove, buyUpgrade, leaveShop,
  cardOf, cardName, cardDesc, intentDamage, pendingReward, HAND_SIZE, BASE_BREATH, START_INK, FLOORS, type Run,
} from "./engine";
import { spellById, spells } from "@/data/spells";
import { enemies, enemyById } from "@/data/enemies";
import { relics } from "@/data/relics";
import { events } from "@/data/events";
import { vocabEs } from "@/data/vocab.es";
import { vocabZh } from "@/data/vocab.zh";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const W = vocabEs[0];                    // any word will do; scoring is injected
const noCrit = () => 0.99;               // rand that never crits (and never redraws a grudge)
const GOOD = 0.9, BAD = 0.3;
/** A battle with exactly these cards in hand (≤ 4 cards → the whole deck is drawn). */
function battle(cards: string[], enemyId = "rata", seed = 1): Run {
  const r = newRun(seed);
  return startBattle({ ...r, deck: cards.map((id, i) => ({ uid: `c${i + 1}`, spell: id, up: false })) }, enemyId);
}
const uidOf = (run: Run, spellId: string) => run.hand.find((u) => cardOf(run, u)!.spell === spellId)!;
const cast = (run: Run, spellId: string, score = GOOD, rand = noCrit, ms = 1800) => castCard(run, uidOf(run, spellId), W, score, ms, false, rand);

console.log("engine checks");

check("purity: lib/engine.ts, lib/map.ts, data/* import no DOM, fetch or React", () => {
  const files = ["lib/engine.ts", "lib/map.ts", ...readdirSync("data").map((f) => `data/${f}`)];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.ok(!/from\s+["'](react|next|react-dom)/.test(src), `${f} imports React/Next`);
    assert.ok(!/\b(window|document|localStorage|navigator)\s*\.\s*[A-Za-z]|\bfetch\s*\(/.test(src), `${f} touches the DOM or fetch`);
    assert.ok(!/"use client"/.test(src), `${f} is marked client`);
  }
});

check("data: every record bilingual, ids unique, 13 fixed enemy ids, ≥ 7 events, 12+ relics", () => {
  const ids = (xs: { id: string }[]) => assert.equal(new Set(xs.map((x) => x.id)).size, xs.length, "duplicate id");
  ids(spells); ids(enemies); ids(relics); ids(events);
  for (const s of spells) { assert.ok(s.name && s.zh && s.gloss && s.desc, s.id); assert.ok(s.cost >= 0 && s.tier >= 1); }
  for (const e of enemies) { assert.ok(e.name && e.zh && e.gloss && e.taunt && e.tauntZh, e.id); assert.ok(e.pattern.length > 0); }
  for (const x of relics) assert.ok(x.name && x.zh && x.gloss && x.desc, x.id);
  for (const ev of events) { assert.ok(ev.title && ev.titleZh && ev.body, ev.id); assert.ok(ev.options.length >= 2 && ev.options.length <= 3); for (const o of ev.options) { assert.ok(o.label && o.zh && o.detail); assert.ok(o.trial || o.effects); } }
  assert.deepEqual(enemies.map((e) => e.id).sort(), ["arana", "bruja", "cuervo", "dragon", "duende", "espectro", "golem", "hidra", "limo", "lobo", "murci", "olvido", "rata"].sort());
  assert.ok(events.length >= 7 && relics.length >= 12 && spells.length >= 24);
  for (const id of ["chispa", "gota", "brisa", "pinchazo", "destello", "escudo", "aliento", "llamarada", "marea", "vendaval", "garra", "rayo", "muro", "sangria", "infierno", "diluvio", "huracan", "eclipse", "amanecer"]) assert.ok(spellById(id), id);
});

check("determinism: newRun(123) twice is deep-equal; same calls + same rand → same state", () => {
  assert.deepEqual(newRun(123), newRun(123));
  const play = () => {
    let r = chooseNode(newRun(123), 0);
    let k = 0; const rand = () => ((k++ * 7919) % 1000) / 1000;
    for (let i = 0; i < 6 && r.phase === "battle"; i++) {
      while (canAct(r) && r.phase === "battle") { const uid = r.hand.find((u) => !castBlocker(r, u))!; r = castCard(r, uid, drawPhrase(r, spellById(cardOf(r, uid)!.spell), vocabEs, rand), 0.5 + rand() / 2, 1800, false, rand).run; }
      if (r.phase === "battle") r = endTurn(r, rand).run;
    }
    return r;
  };
  assert.deepEqual(play(), play());
});

check("newRun: phase map, floor 0, one fight door, 7-card starting deck (3 attack elements, escudo, aliento, susurro, a hex), 30 ink", () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    const r = newRun(seed);
    assert.equal(r.phase, "map"); assert.equal(r.floor, 0); assert.equal(r.ink, START_INK);
    assert.deepEqual(r.map[0].map((n) => n.kind), ["fight"]);
    assert.equal(r.deck.length, 7);
    const sp = r.deck.map((c) => spellById(c.spell));
    const attacks = sp.filter((s) => s.tier === 1 && s.cost === 1 && (s.kind === "attack" || s.kind === "drain"));
    assert.equal(attacks.length, 3); assert.equal(new Set(attacks.map((s) => s.element)).size, 3);
    for (const id of ["escudo", "aliento", "susurro"]) assert.ok(sp.some((s) => s.id === id), id);
    assert.equal(sp.filter((s) => s.kind === "hex").length, 1);
    assert.equal(new Set(r.deck.map((c) => c.uid)).size, 7);
  }
});

check("startBattle: hand = HAND_SIZE, breath = max, turn 1, deck accounted for", () => {
  const r = chooseNode(newRun(5), 0);
  assert.equal(r.phase, "battle"); assert.equal(r.hand.length, HAND_SIZE); assert.equal(r.breath, BASE_BREATH); assert.equal(r.turn, 1);
  assert.equal(r.hand.length + r.draw.length + r.discard.length, r.deck.length);
  assert.ok(r.enemy && r.enemy.hpNow === r.enemy.hp && r.enemy.statuses.length === 0);
  assert.ok(canAct(r));
});

check("backfire (0.3): breath spent, 2 + 2 × tier self-damage, grudge, 0 damage, no statuses, chain reset", () => {
  const r0 = battle(["chispa", "llamarada", "infierno", "escudo"], "rata");
  let r = cast(r0, "chispa").run;                      // chain 1 of fire
  assert.equal(r.chain, 1); assert.equal(r.lastElement, "fire");
  const { run: r2, result } = cast(r, "llamarada", BAD);
  assert.equal(result.backfire, true); assert.equal(result.selfDamage, 2 + 2 * 2); assert.equal(r2.hp, r.hp - 6);
  assert.equal(r2.breath, r.breath - 2); assert.equal(result.damage, 0); assert.deepEqual(result.applied, []);
  assert.equal(result.grudge, true); assert.ok(r2.grudges.includes(W.id));
  assert.equal(result.chain, 0); assert.equal(r2.chain, 0); assert.equal(r2.lastElement, null);
  assert.equal(r2.enemy!.hpNow, r.enemy!.hpNow, "no damage on backfire");
  assert.ok(!r2.hand.includes(uidOf(r, "llamarada")) && r2.discard.includes(uidOf(r, "llamarada")));
  assert.equal(r2.stats.backfires, 1); assert.equal(r2.resonance, 0);
});

check("castCard throws on unaffordable / silenced / not in hand; canAct and previewCast agree", () => {
  let r = battle(["infierno", "chispa", "escudo", "susurro"], "rata");
  r = { ...r, statuses: [{ id: "silence", stacks: 1, turns: 1 }] };
  assert.equal(castBlocker(r, uidOf(r, "infierno")), "silenced");
  assert.equal(previewCast(r, spellById("infierno")).silenced, true);
  assert.throws(() => cast(r, "infierno"));
  r = { ...r, breath: 0 };
  assert.equal(castBlocker(r, uidOf(r, "chispa")), "not enough breath");
  assert.equal(previewCast(r, spellById("chispa")).affordable, false);
  assert.throws(() => cast(r, "chispa"));
  assert.equal(canAct(r), true, "susurro costs 0");
  r = cast(r, "susurro").run;
  assert.equal(canAct(r), false);
  assert.throws(() => castCard(r, "nope", W, GOOD, 1800, false, noCrit));
});

check("chain: fire ×3 → chain 3 and +30% over chain 1", () => {
  const r0 = battle(["chispa", "chispa", "chispa", "escudo"], "rata");
  const first = cast(r0, "chispa");
  assert.equal(first.result.chain, 1);
  let r = cast(first.run, "chispa").run;
  assert.equal(previewCast(r, spellById("chispa")).chain, 3);
  assert.ok(Math.abs(previewCast(r, spellById("chispa")).mult - 1.3) < 1e-9);
  const third = cast(r, "chispa");
  assert.equal(third.result.chain, 3);
  assert.equal(third.result.damage, Math.round(12 * 1.4 * 1.3));
  assert.equal(first.result.damage, Math.round(12 * 1.4));
});

check("reactions: shadow→light = eclipse (crit); fire→water = steam (burn removed)", () => {
  let r = battle(["pinchazo", "destello", "chispa", "gota"], "rata");
  r = cast(r, "pinchazo").run;
  const ecl = cast(r, "destello");
  assert.equal(ecl.result.reaction, "eclipse"); assert.equal(ecl.result.crit, true);
  let f = battle(["chispa", "gota", "escudo", "susurro"], "limo");
  f = cast(f, "chispa").run;
  assert.ok(f.enemy!.statuses.some((s) => s.id === "burn"));
  const steam = cast(f, "gota");
  assert.equal(steam.result.reaction, "steam");
  assert.ok(!steam.run.enemy!.statuses.some((s) => s.id === "burn"));
  assert.equal(steam.result.damage, Math.round(12 * 1.4 * 1.5));
  // wind → fire = wildfire doubles burn; water → wind = storm staggers; light → shadow = dusk drains all
  let w = battle(["brisa", "chispa", "gota", "vendaval"], "rata");
  w = cast(w, "brisa").run;
  const wf = cast(w, "chispa"); assert.equal(wf.result.reaction, "wildfire"); assert.equal(wf.result.applied[0].stacks, 4);
  let s = battle(["gota", "brisa", "escudo", "susurro"], "rata");
  s = cast(s, "gota").run;
  const st = cast(s, "brisa"); assert.equal(st.result.reaction, "storm"); assert.ok(st.result.applied.some((a) => a.status === "stagger"));
  let d = battle(["destello", "pinchazo", "escudo", "susurro"], "rata");
  d = { ...cast(d, "destello").run, hp: 30 };
  const du = cast(d, "pinchazo"); assert.equal(du.result.reaction, "dusk"); assert.equal(du.result.healed, du.result.damage);
});

check("stagger: enemy skips its action, step still advances", () => {
  let r = battle(["empujon", "chispa", "escudo", "susurro"], "rata");
  r = cast(r, "empujon").run;
  assert.ok(r.enemy!.statuses.some((s) => s.id === "stagger"));
  const { run: r2, result } = endTurn(r, noCrit);
  assert.equal(result.staggered, true); assert.equal(result.enemyHit, 0); assert.equal(r2.hp, r.hp);
  assert.equal(r2.enemy!.step, r.enemy!.step + 1);
  assert.ok(!r2.enemy!.statuses.some((s) => s.id === "stagger"));
  assert.equal(r2.turn, 2); assert.equal(r2.hand.length, HAND_SIZE); assert.equal(r2.breath, BASE_BREATH);
});

check("chill: a charging enemy under chill does not become charged", () => {
  let r = battle(["gota", "chispa", "escudo", "susurro"], "murci");     // murci: attack, charge, attack
  r = { ...r, enemy: { ...r.enemy!, step: 1, statuses: [{ id: "chill", stacks: 1, turns: 1 }] } };
  const { run: r2, result } = endTurn(r, noCrit);
  assert.equal(result.intent, "charge"); assert.equal(r2.enemy!.charged, false);
  const r3 = { ...r, enemy: { ...r.enemy!, step: 1, statuses: [] } };
  assert.equal(endTurn(r3, noCrit).run.enemy!.charged, true);
  // chill applied by a cast removes an existing charge
  const charged = { ...r, enemy: { ...r.enemy!, charged: true, statuses: [] } };
  assert.equal(cast(charged, "gota").run.enemy!.charged, false);
});

check("enemy phase: armor absorbs before shield; shield halves afterwards; player statuses tick", () => {
  let r = battle(["chispa", "escudo", "aliento", "susurro"], "rata");   // floor 0: no scaling
  const atk = r.enemy!.attack;
  r = { ...r, shield: 20, statuses: [{ id: "armor", stacks: 6, turns: 99 }, { id: "exposed", stacks: 1, turns: 1 }] };
  assert.equal(intentDamage(r.enemy!), atk);
  const { run: r2, result } = endTurn(r, noCrit);
  assert.equal(result.intent, "attack"); assert.equal(result.armorAbsorbed, 6); assert.equal(result.blocked, atk - 6); assert.equal(result.enemyHit, 0);
  assert.equal(r2.hp, r.hp); assert.equal(r2.shield, Math.floor((20 - (atk - 6)) / 2));
  assert.ok(!r2.statuses.some((s) => s.id === "armor"), "armor spent"); assert.ok(!r2.statuses.some((s) => s.id === "exposed"), "exposed expired");
});

check("enemy intents: double, block, heal, curse, silence, weak (−25%)", () => {
  let r = battle(["chispa", "escudo", "aliento", "susurro"], "cuervo");   // double, curse, attack
  const d = endTurn(r, noCrit); assert.equal(d.result.intent, "double"); assert.equal(d.result.hits, 2); assert.equal(d.result.enemyHit, 2 * Math.round(r.enemy!.attack * 0.6));
  const c = endTurn(d.run, noCrit); assert.equal(c.result.intent, "curse"); assert.equal(c.run.cursed, true);
  assert.equal(drawPhrase(c.run, spellById("chispa"), vocabEs, noCrit).level, 2, "cursed: one level harder");
  let g = battle(["chispa", "escudo", "aliento", "susurro"], "golem");     // block, charge, attack
  const b = endTurn(g, noCrit); assert.equal(b.result.intent, "block"); assert.equal(b.result.armorGained, Math.round(g.enemy!.attack * 1.5));
  assert.equal(b.run.enemy!.statuses.find((s) => s.id === "armor")!.stacks, b.result.armorGained, "armor gained this phase does not halve yet");
  const hit = cast(b.run, "chispa"); assert.ok(hit.result.armorAbsorbed > 0 && hit.result.damage < Math.round(12 * 1.4));
  let l = battle(["chispa", "escudo", "aliento", "susurro"], "limo");     // attack, attack, heal
  l = { ...l, enemy: { ...l.enemy!, step: 2, hpNow: 10 } };
  const h = endTurn(l, noCrit); assert.equal(h.result.intent, "heal"); assert.equal(h.result.enemyHealed, Math.round(l.enemy!.hp * 0.12));
  let s = battle(["infierno", "escudo", "aliento", "susurro"], "espectro"); // curse, attack, silence, attack
  s = { ...s, enemy: { ...s.enemy!, step: 2 } };
  const si = endTurn(s, noCrit); assert.equal(si.result.silenced, true); assert.equal(castBlocker(si.run, uidOf(si.run, "infierno")), "silenced");
  const after = endTurn({ ...si.run, hp: 70 }, noCrit).run; assert.ok(!after.statuses.some((x) => x.id === "silence"), "silence lasts one player turn");
  let w = battle(["niebla", "escudo", "aliento", "susurro"], "rata");
  w = cast(w, "niebla").run; const wk = endTurn(w, noCrit); assert.equal(wk.result.enemyHit, Math.round(w.enemy!.attack * 0.75));
});

check("burn ticks at the start of the enemy phase and can win the battle", () => {
  let r = battle(["ceniza", "escudo", "aliento", "susurro"], "rata");
  r = { ...r, enemy: { ...r.enemy!, hpNow: 4 } };
  r = cast(r, "ceniza").run;                     // burn 4 for 3 turns
  const { run: r2, result } = endTurn(r, noCrit);
  assert.equal(result.burnDamage, 4); assert.equal(result.killed, true); assert.equal(r2.phase, "reward");
});

check("upgrade: +30% power, +1 stack on the first status, name gets a +", () => {
  let r = battle(["chispa", "escudo", "aliento", "susurro"], "rata");
  r = { ...r, deck: r.deck.map((c) => (c.spell === "chispa" ? { ...c, up: true } : c)) };
  const card = cardOf(r, uidOf(r, "chispa"))!;
  assert.equal(cardName(card, "es"), "Chispa+"); assert.equal(cardName(card, "zh"), "火花+");
  assert.equal(cardDesc(card), "Deal 16. Burn 3 for 2 turns.");
  const res = cast(r, "chispa"); assert.equal(res.result.damage, Math.round(16 * 1.4)); assert.equal(res.result.applied[0].stacks, 3);
});

check("winBattle: reward phase, ink = round(enemy.ink × (0.75 + 0.5 × avg)), 3 cards; relics after elites; final → won", () => {
  let r = battle(["chispa", "escudo", "aliento", "susurro"], "rata");
  r = { ...r, enemy: { ...r.enemy!, hpNow: 1 } };
  const kill = cast(r, "chispa", 0.9);
  assert.equal(kill.result.killed, true); assert.equal(kill.run.phase, "reward");
  assert.equal(kill.run.rewards!.ink, Math.round(enemyById("rata").ink * (0.75 + 0.5 * 0.9)));
  assert.equal(kill.run.ink, START_INK + kill.run.rewards!.ink);
  assert.equal(kill.run.rewards!.cards.length, 3); assert.equal(kill.run.rewards!.relics.length, 0);
  assert.equal(pendingReward(kill.run), "card");
  const taken = takeCard(kill.run, 0);
  assert.equal(taken.phase, "map"); assert.equal(taken.floor, 1); assert.equal(taken.deck.length, 5);
  let e = battle(["chispa", "escudo", "aliento", "susurro"], "golem");
  e = { ...e, floor: 2, enemy: { ...e.enemy!, hpNow: 1 } };
  const won = winBattle(e);
  assert.equal(won.rewards!.relics.length, 3); assert.equal(pendingReward(won), "card");
  const afterCard = takeCard(won, null); assert.equal(afterCard.phase, "reward"); assert.equal(pendingReward(afterCard), "relic");
  const afterRelic = takeRelic(afterCard, 0); assert.equal(afterRelic.phase, "map"); assert.equal(afterRelic.relics.length, 1); assert.equal(afterRelic.floor, 3);
  let f = battle(["chispa", "escudo", "aliento", "susurro"], "olvido");
  f = { ...f, floor: 7, enemy: { ...f.enemy!, hpNow: 1 } };
  assert.equal(winBattle(f).phase, "won");
});

check("map: 8 floors, fixed floors, 2–3 doors with constraints, no repeated enemy id", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { map } = newRun(seed);
    assert.equal(map.length, FLOORS);
    assert.deepEqual(map[0].map((n) => n.kind), ["fight"]); assert.deepEqual(map[3].map((n) => n.kind), ["boss"]); assert.deepEqual(map[7].map((n) => n.kind), ["final"]);
    let restF = 0, merchF = 0, eventF = 0;
    for (const f of [1, 2, 4, 5, 6]) {
      const kinds = map[f].map((n) => n.kind);
      assert.ok(kinds.length >= 2 && kinds.length <= 3, `seed ${seed} floor ${f}: ${kinds}`);
      assert.ok(kinds.filter((k) => k === "elite").length <= 1);
      assert.ok(kinds.some((k) => k === "fight" || k === "elite"));
      assert.equal(new Set(kinds).size, kinds.length, "no duplicate door kinds");
      if (kinds.includes("rest")) restF++; if (kinds.includes("merchant")) merchF++; if (kinds.includes("event")) eventF++;
    }
    assert.equal(restF, 2); assert.equal(merchF, 2); assert.ok(eventF >= 2);
    const ids = map.flat().filter((n) => n.enemyId).map((n) => n.enemyId!);
    assert.equal(new Set(ids).size, ids.length, `seed ${seed}: repeated enemy`);
    for (const n of map.flat()) { if (n.enemyId) assert.ok(enemyById(n.enemyId)); if (n.kind === "event") assert.ok(n.eventId); }
    assert.equal(enemyById(map[3][0].enemyId!).kind, "boss"); assert.equal(map[7][0].enemyId, "olvido");
  }
});

check("events: trial success/failure by threshold; remove/upgrade set pending and finish via pickEventCard; ink prices refuse", () => {
  const base = { ...newRun(9), phase: "event" as const, event: { id: "pozo", stage: "choose" as const } };
  const ok = resolveEvent(base, 0, 0.9); assert.equal(ok.ink, base.ink + 45); assert.equal(ok.event!.stage, "done"); assert.ok(ok.event!.outcome!.includes("45"));
  const bad = resolveEvent(base, 0, 0.3); assert.equal(bad.hp, base.hp - 8); assert.equal(bad.event!.stage, "done");
  const herm = { ...newRun(9), phase: "event" as const, event: { id: "ermitano", stage: "choose" as const } };
  const rem = resolveEvent(herm, 0); assert.equal(rem.event!.stage, "pick"); assert.equal(rem.event!.pending, "remove");
  const picked = pickEventCard(rem, rem.deck[0].uid); assert.equal(picked.deck.length, herm.deck.length - 1); assert.equal(picked.event!.stage, "done"); assert.equal(picked.event!.pending, undefined);
  const altar = { ...newRun(9), phase: "event" as const, event: { id: "altar", stage: "choose" as const } };
  const up = resolveEvent(altar, 0); assert.equal(up.maxHp, altar.maxHp - 8); assert.equal(up.event!.pending, "upgrade");
  const upd = pickEventCard(up, up.deck[1].uid); assert.equal(upd.deck[1].up, true); assert.equal(upd.event!.stage, "done");
  const moved = advance(upd); assert.equal(moved.phase, "map"); assert.equal(moved.floor, altar.floor + 1); assert.equal(moved.event, undefined);
  const poor = { ...newRun(9), ink: 10, phase: "event" as const, event: { id: "vendedora", stage: "choose" as const } };
  assert.equal(eventOptionAvailable(poor, 0), false); assert.equal(resolveEvent(poor, 0), poor);
  const rich = { ...poor, ink: 100 }; const bought = resolveEvent(rich, 0); assert.equal(bought.ink, 75); assert.equal(bought.deck.length, rich.deck.length + 1);
});

check("merchant: buying deducts ink and marks sold; refuses when short; remove/upgrade; leaveShop advances", () => {
  let seed = 1; let r = newRun(seed);
  while (!r.map[1].some((n) => n.kind === "merchant")) r = newRun(++seed);
  const shopIdx = r.map[1].findIndex((n) => n.kind === "merchant");
  r = chooseNode({ ...r, floor: 1, path: [0], ink: 500 }, shopIdx);
  assert.equal(r.phase, "merchant"); assert.ok(r.shop && r.shop.cards.length >= 3 && r.shop.relics.length === 2);
  const price = r.shop!.cards[0].price;
  const b = buyCard(r, 0); assert.equal(b.ink, 500 - price); assert.equal(b.shop!.cards[0].sold, true); assert.equal(b.deck.length, r.deck.length + 1);
  assert.equal(buyCard(b, 0), b, "sold out → unchanged");
  const poor = { ...r, ink: 5 }; assert.equal(buyCard(poor, 1), poor); assert.equal(buyRelic(poor, 0), poor); assert.equal(buyRemove(poor, poor.deck[0].uid), poor);
  const rel = buyRelic(b, 0); assert.equal(rel.relics.length, 1); assert.equal(rel.ink, b.ink - b.shop!.relics[0].price);
  const rem = buyRemove(rel, rel.deck[0].uid); assert.equal(rem.deck.length, rel.deck.length - 1); assert.equal(rem.ink, rel.ink - rel.shop!.removePrice);
  const up = buyUpgrade(rem, rem.deck[0].uid); assert.equal(up.deck[0].up, true); assert.equal(buyUpgrade(up, up.deck[0].uid), up, "already upgraded → unchanged");
  const left = leaveShop(up); assert.equal(left.phase, "map"); assert.equal(left.floor, 2); assert.equal(left.shop, undefined);
});

check("rest: heal 30%, study upgrades, forget removes; then advance", () => {
  const r = { ...newRun(3), phase: "rest" as const, hp: 20, floor: 2, path: [0, 0, 0] };
  const h = rest(r, "heal"); assert.equal(h.hp, 20 + Math.round(70 * 0.3)); assert.equal(h.phase, "map"); assert.equal(h.floor, 3);
  const s = rest(r, "study", r.deck[0].uid); assert.equal(s.deck[0].up, true);
  const f = rest(r, "forget", r.deck[0].uid); assert.equal(f.deck.length, 6);
  assert.throws(() => rest(r, "study"));
});

check("redraws, drawPhrase levels/themes/grudges, hex and empower, relic hooks", () => {
  let r = battle(["foco", "ceniza", "canto", "chispa"], "rata");
  assert.equal(r.redrawsLeft, 1); const u = useRedraw(r); assert.equal(u.redrawsLeft, 0); assert.equal(useRedraw(u), u);
  const t = drawPhrase(r, { level: 3 }, vocabEs, noCrit); assert.equal(t.level, 3);
  const themed = drawPhrase(r, spellById("chispa"), vocabEs, noCrit); assert.ok(spellById("chispa").themes.includes(themed.theme)); assert.equal(themed.level, 1);
  const zh = drawPhrase(r, spellById("llamarada"), vocabZh, noCrit); assert.equal(zh.level, 2); assert.equal(zh.lang, "zh");
  const g = { ...r, grudges: [vocabEs[0].id, vocabEs[1].id] }; assert.ok(g.grudges.includes(drawPhrase(g, { level: 1 }, vocabEs, () => 0.1).id), "40% grudge redraw");
  const fo = cast(r, "foco"); assert.ok(fo.run.statuses.some((s) => s.id === "focus")); assert.equal(fo.result.breathLeft, 3);
  const focused = cast(fo.run, "chispa", 0.8); assert.ok(Math.abs(focused.result.score - 0.9) < 1e-9, "focus adds 0.10 and is consumed"); assert.ok(!focused.run.statuses.some((s) => s.id === "focus"));
  const ca = cast(focused.run, "canto"); assert.equal(ca.run.statuses.find((s) => s.id === "strength")!.stacks, 3);
  const hx = cast(r, "ceniza"); assert.equal(hx.result.damage, 0); assert.deepEqual(hx.result.applied, [{ status: "burn", stacks: 4, turns: 3, target: "enemy" }]);
  // relics: breath, handSize, scoreBonus, resonanceAt, startArmor, perfectBreath, inkBonus
  let rr = { ...newRun(4), relics: ["fuelle", "manga", "lengua", "diapason", "coraza", "reloj", "bolsa"], maxBreath: 4 };
  rr = startBattle(rr, "rata");
  assert.equal(rr.breath, 4); assert.equal(rr.hand.length, HAND_SIZE + 1); assert.equal(rr.statuses.find((s) => s.id === "armor")!.stacks, 8);
  const uid = rr.hand.find((x) => spellById(cardOf(rr, x)!.spell).cost === 1)!;
  const perfect = castCard(rr, uid, W, 0.9, 1800, false, noCrit);
  assert.ok(Math.abs(perfect.result.score - 0.98) < 1e-9); assert.equal(perfect.result.breathLeft, 4, "perfectBreath refunds once"); assert.deepEqual(perfect.result.gained, { breath: 1 });
  assert.equal(perfect.run.resonance, 1);
  const res2 = castCard(perfect.run, perfect.run.hand.find((x) => spellById(cardOf(perfect.run, x)!.spell).cost <= 1)!, W, 0.9, 1800, false, noCrit);
  assert.equal(res2.run.resonance, 2); assert.equal(res2.result.breathLeft, 4 - spellById(cardOf(perfect.run, perfect.run.hand.find((x) => spellById(cardOf(perfect.run, x)!.spell).cost <= 1)!)!.spell).cost, "refund only once per turn");
  const r3 = castCard(res2.run, res2.run.hand.find((x) => spellById(cardOf(res2.run, x)!.spell).cost <= 1)!, W, 0.9, 1800, false, noCrit);
  assert.equal(r3.result.resonant, true, "diapasón: resonance at 2"); assert.equal(r3.result.crit, true); assert.equal(r3.run.resonance, 0);
  const inkRun = winBattle({ ...rr, enemy: { ...rr.enemy!, hpNow: 0 }, battleScores: [1] });
  assert.equal(inkRun.rewards!.ink, Math.round(enemyById("rata").ink * 1.25 * 1.3));
});

check("log keeps the last 20 lines, newest last", () => {
  let r = chooseNode(newRun(7), 0);
  for (let i = 0; i < 30 && r.phase === "battle"; i++) {
    while (canAct(r) && r.phase === "battle") r = castCard(r, r.hand.find((u) => !castBlocker(r, u))!, W, 0.6, 3000, false, noCrit).run;
    if (r.phase === "battle") r = endTurn(r, noCrit).run;
  }
  assert.ok(r.log.length <= 20 && r.log.length > 0);
  assert.ok(r.log.every((l) => typeof l === "string" && l.length > 0));
});

console.log(process.exitCode ? `\n${passed} passed, some FAILED` : `\nall ${passed} checks passed`);
