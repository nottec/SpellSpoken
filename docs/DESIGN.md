# SpellSpoken (formerly Incantation) — expansion design (HackTX 2026, Oct 24→25)

This document is the contract between the engine, the speech/Gemini layer, the visual
components and the screens. Agents implement **exactly** the names and shapes here; if an
agent must deviate, it updates this file in the same change and says so in its report.

The game is a **pronunciation roguelike** in Spanish or Mandarin. Spells are effects; the
words you must say are drawn from a lexicon by tier. Say it well → the effect lands; score
below 0.45 → it backfires. This expansion adds Slay-the-Spire-style depth: breath (energy),
a deck and hand, statuses, element chains and reactions, a branching map with rest / event /
merchant nodes, ink (currency), more enemies with more intents, and build-around relics.

Invariants that do **not** change:

- `lib/engine.ts`, `lib/scoring.ts`, all of `data/*` are pure: no DOM, no fetch, no React.
  Randomness inside the engine comes from the run seed (`rng(seed)`); the only injected
  randomness is the `rand` parameter already used for crits.
- Score 0–1 from `lib/scoring.ts`. `BACKFIRE_BELOW = 0.45`. Grudge if score < 0.70.
- Resonance: 3 consecutive casts ≥ 0.80 → next cast is a guaranteed crit (relic can lower to 2).
- Word mastery lives in `lib/lexicon.ts` (3 casts at ≥ 0.85 avg → +15% power).
- Gemini never changes damage. The scorer decides before Gemini is called.
- UI copy is English; **in-world names** (spells, enemies, relics, events, element names,
  grade labels, taunts) are in the target language. Every data record therefore carries
  `name` (Spanish) and `zh` (Mandarin); the UI picks with `localName(x, lang)` from `lib/lang.ts`.

---

## 1. Turn structure (engine)

A battle is a sequence of **player turns**; the enemy acts once at the end of each.

```
startBattle(run)      shuffle deck → draw pile; hand = draw HAND_SIZE; breath = maxBreath; turn = 1
player turn           castCard(...) any number of times while breath ≥ card cost
endTurn(run)          discard hand → enemy phase → status ticks → draw new hand → breath reset
```

- `run.breath` / `run.maxBreath` (base 3). A card's `cost` is breath; it usually equals the tier, but §13
  decouples the two where that creates a decision, and `cardCost(run, card)` applies Tailwind/Veleta discounts.
- `HAND_SIZE = 5` (was 4 before §13). At turn start draw up to HAND_SIZE (Retained cards count toward it);
  if the draw pile is empty, shuffle the discard into it (seeded). Unplayed cards are discarded at end of turn
  unless they Retain; Exhausted cards sit out the rest of the battle.
- `run.redrawsLeft` (base 1 per turn, + relic): the player may redraw the *phrase* for the
  selected card without penalty that many times per turn. The engine only tracks the counter
  (`useRedraw(run)`); drawing itself is `drawPhrase`.
- `canAct(run)`: true if some card in hand is castable (affordable and not silenced).
  The UI auto-ends the turn when `!canAct(run)` after showing the result; there is also a
  manual **End turn** button.

### castCard

```ts
castCard(run, uid, word, rawScore, ms, wordMastered, rand = Math.random): { run: Run; result: CastResult }
```

`castCard` **throws** when the card is not castable (not in hand, unaffordable, tier 3 while
silenced, not in battle); the UI gates on `castBlocker(run, uid)` / `previewCast` / `canAct` first.

Order of operations:

1. `score = min(1, rawScore + relic scoreBonus + (focus status ? 0.10 : 0))`; focus is consumed.
2. Backfire if `score < BACKFIRE_BELOW`: self-damage `2 + 2 × tier`, breath still spent, card
   discarded, resonance reset, word becomes a grudge, chain resets. Nothing else happens.
3. Otherwise `mult = 0.5 + score`, then multiply by: weak ×2 / resist ×0.5 / underTier ×0.5
   (enemy `minTier`), mastery ×1.15, crit ×1.5, chain bonus, reaction bonus, `strength` (+stacks
   flat power before multipliers), `exposed` on enemy ×1.5 (attacks/drains only).
4. Crit chance: `(score ≥ 0.85 && ms < 2500 ? 0.30 : 0.05) + relic critBonus`; resonance ≥ threshold
   forces a crit and resets resonance.
5. Kind effects:
   - `attack`: damage to enemy (armor absorbs first), relic lifesteal, echo relic (first cast per battle +50%).
   - `drain`: like attack, heals `spell.drain` (0.25–1.0) of damage dealt.
   - `shield`: `run.shield += power × mult × crit × mastery` (shield halves at end of each enemy phase).
   - `heal`: `run.hp += …` capped at maxHp.
   - `hex`: no damage; only `applies`.
   - `empower`: no damage; `applies` to self and/or `gain` (e.g. `{ breath: 1 }`, `{ strength: 3 }`).
   - Any kind: `spell.applies[]` statuses are applied if the cast did not backfire
     (burn stacks get relic `burnBonus`; upgraded cards +1 stack or +1 turn, see §3).
6. Chain / reaction (see §2), stats, grudges (score < 0.70 adds, ≥ 0.70 removes), resonance.
7. `breath -= cost`; card uid moves hand → discard. If the enemy died: `winBattle` (§6).

```ts
type CastResult = {
  score: number; backfire: boolean; crit: boolean; resonant: boolean;
  weak: boolean; resist: boolean; underTier: boolean; exposed: boolean;
  chain: number;                 // consecutive same-element casts including this one (1 = none, 0 = backfire)
  reaction: ReactionId | null;
  damage: number; echoDamage: number; armorAbsorbed: number; selfDamage: number; healed: number; shielded: number;
  // damage/echoDamage are what reached the enemy's life after its armor; healed is life actually restored
  applied: { status: StatusId; stacks: number; turns: number; target: "enemy" | "self" }[];
  gained: { breath?: number };
  killed: boolean; wordMastered: boolean; grudge: boolean;
  breathLeft: number;
};
```

### endTurn

```ts
endTurn(run, rand = Math.random): { run: Run; result: TurnResult }
```

Enemy phase, in order: burn ticks (enemy takes `stacks` damage; may kill → `winBattle`); if
`stagger` → the enemy skips its action (intent still advances) and stagger stacks −1; else
resolve `nextIntent`:

| intent    | effect |
|-----------|--------|
| `attack`  | hit for `attack × (charged ? 2 : 1) × (weak ? 0.75 : 1)`, minus relic `block`, then player armor, then shield |
| `double`  | two hits of `attack × 0.6` each, same pipeline (shields matter) |
| `charge`  | `charged = true` unless `chill` (then nothing) |
| `curse`   | `run.cursed = true` (next phrase one level harder) |
| `silence` | player gets `silence` (stored as 2 turns so it survives this phase's tick and covers the whole next player turn: no tier-3 casts) |
| `heal`    | enemy heals 12% of max HP (heal is unaffected by `weak`) |
| `block`   | enemy gains `armor` = `attack × 1.5` (armor absorbs damage, halves each enemy phase; armor gained this phase does not halve until the next) |

Then: enemy statuses tick (`turns −1`, remove at 0; armor halves; `turns = 99` never expires),
`charged` stays until used (a `double` consumes it too), relic `thorns` damages the enemy once when
it hit you, player `shield = floor(shield / 2)`, `regen` heals (before the tick, so "regen 5 for 3
turns" heals three times), player statuses tick, `turn++`, discard hand, draw HAND_SIZE, `breath =
maxBreath`, `redrawsLeft` reset, relic `turnFocus` applies focus. Death → `phase = "dead"`. Burn
bypasses armor. `endTurn`'s `rand` is accepted but unused (enemy actions are deterministic).

```ts
type TurnResult = {
  intent: Intent; staggered: boolean; hits: number; enemyHit: number; blocked: number; armorAbsorbed: number;
  enemyHealed: number; burnDamage: number; armorGained: number; cursed: boolean; silenced: boolean;
  thorns: number; regen: number; killed: boolean; dead: boolean;
};
```

## 2. Elements, chain, reactions

Elements: `fire | water | wind | shadow | light`. Each has a signature status it applies through its cards:

| element | signature status (on enemy) | meaning |
|---------|-----------------------------|---------|
| fire    | `burn`     | takes `stacks` damage at the start of each enemy phase for `turns` turns |
| water   | `chill`    | cannot charge (and loses `charged` when applied) for `turns` turns |
| wind    | `stagger`  | skips its next `stacks` actions |
| shadow  | `weak`     | deals −25% for `turns` turns (and shadow cards drain) |
| light   | `exposed`  | takes +50% damage for `turns` turns |

Other statuses: `armor` (enemy or player; flat absorb, halves each enemy phase), and on the
player `focus` (next cast +0.10 score, consumed), `silence` (no tier-3 casts, `turns`),
`strength` (+stacks power on attacks/drains, lasts the battle), `regen` (heal `stacks` per turn, `turns`).

```ts
type StatusId = "burn" | "chill" | "stagger" | "weak" | "exposed" | "armor" | "focus" | "silence" | "strength" | "regen";
type Status = { id: StatusId; stacks: number; turns: number };   // turns = 99 means "this battle"
```

**Chain**: `run.lastElement`, `run.chain`. Casting the same element as the previous cast this
battle: `chain + 1`, bonus `+0.15 × min(chain − 1, 3)` to mult (2nd cast +15%, 3rd +30%, 4th+ +45%).
A different element resets chain to 1 and may trigger a **reaction** (previous → current):

| previous → current | id | effect |
|---|---|---|
| wind → fire   | `wildfire` | burn applied this cast is doubled, +25% damage |
| fire → water  | `steam`    | +50% damage; removes burn from the enemy (the tradeoff) |
| water → wind  | `storm`    | also applies `stagger` 1 |
| shadow → light| `eclipse`  | guaranteed crit |
| light → shadow| `dusk`     | drain 100% of damage dealt |

Backfires reset `lastElement` to null. `previewCast(run, spell)` exposes these so the UI can
label cards ("steam ↑", "×2 here", "resisted", "too weak", "silenced", "3 breath").

```ts
type CastPreview = { affordable: boolean; silenced: boolean; weak: boolean; resist: boolean; underTier: boolean;
  chain: number; reaction: ReactionId | null; mult: number /* everything except score & crit */ };
```

## 3. Cards and the deck

```ts
type Card = { uid: string; spell: string; up: boolean };     // uid unique within a run
run.deck: Card[];            // everything owned
run.draw: string[]; run.hand: string[]; run.discard: string[];   // uids, battle only
```

Upgrade (`up`): +30% power, +1 stack on the first applied status (or +1 turn if it has no
stacks to speak of), and displayed as `Name+`. `cardName(card, lang)` returns the localized name
with "+" appended when upgraded.

Starting deck (10, since §13): four basic tier-1 attacks of **four different elements** (seeded; fire and
water may arrive as their 2-cost variant Hoguera/Témpano), `escudo` ×2, `aliento`, `susurro` (0-cost shadow
jab), one tier-1 hex with a cost (seeded) and `foco` (0-cost, Retain).

Card pool (`data/spells.ts`, ~24; each has `id, name, zh, gloss, element, kind, tier, cost, power,
themes, rarity, desc, applies?, drain?, gain?`). `desc` is English rules text, e.g.
"Deal 12. Burn 2 for 2 turns." Suggested set — the engine agent may tune numbers:

- Tier 1 (cost 1): Chispa 🔥 12 +burn 2/2 · Gota 💧 12 +chill 1 · Brisa 🌪 12 · Pinchazo 🌑 12 drain 25% ·
  Destello ✨ 12 +exposed 1 · Escudo ✨ shield 10 · Aliento 💧 heal 9 · Susurro 🌑 6 (cost 0) ·
  Foco ✨ empower: focus (cost 0) · Ceniza 🔥 hex: burn 4/3 · Niebla 💧 hex: weak 2 + chill 2 ·
  Empujón 🌪 hex: stagger 1 (cost 2).
- Tier 2 (cost 2): Llamarada 🔥 24 +burn 3/2 · Marea 💧 24 +chill 2 · Vendaval 🌪 24 +stagger 1 ·
  Garra oscura 🌑 24 drain 50% · Rayo ✨ 24 +exposed 2 · Muro 🌪 shield 16 + armor 6 (self) ·
  Sangría 🌑 drain 20, 50% · Canto ✨ empower: strength 3 (this battle).
- Tier 3 (cost 3): Infierno 🔥 42 +burn 5/3 · Diluvio 💧 42 +chill 3 +weak 2 · Huracán 🌪 42 +stagger 2 ·
  Eclipse 🌑 drain 34, 100% · Amanecer ✨ 42 +exposed 2, regen 5/2 (its "heal 10" is paid as regen) ·
  Fortaleza ✨ shield 30 + armor 10 · Plegaria 💧 heal 30 + regen 5/3.
- Also: Inspiración ✨ (tier 2, cost 0, rare) empower: gain 2 breath — the one card using `gain`.
  Brisa is 14 power because it applies nothing. Pinchazo is `kind: "drain"` (25%). Sangría also applies weak 1.
  Final pool: 28 cards. `desc` is generated from the numbers (`spellDesc(spell, up)`), never hand-written.

Power per breath should rise with tier (tier 3 ≈ 14/breath vs tier 1 ≈ 12/breath) because a
level-3 sentence is harder to say and a backfire wastes 3 breath.

## 4. Map

```ts
type NodeKind = "fight" | "elite" | "rest" | "event" | "merchant" | "boss" | "final";
type MapNode = { kind: NodeKind; enemyId?: string; eventId?: string };
run.map: MapNode[][];     // 8 floors
run.floor: number;        // floor currently being chosen / played
run.path: number[];       // chosen node index per floor
```

Generation (seeded): floor 0 = `[fight]`; floor 3 = `[boss]`; floor 7 = `[final]`; floors
1, 2, 4, 5, 6 offer 2–3 doors from `{fight, elite, rest, event, merchant}` with constraints: at most
one elite per floor, at least one fight-or-elite per floor, rest appears on exactly two of the
five floors, merchant on exactly two, event on at least two, no duplicate door kinds on a floor.
Elites never appear on floor 1 (a tier-1 deck gets one plain fight first); 2–4 elite doors per run.
`fight`/`elite`/`boss`/`final` nodes carry `enemyId` picked (seeded) from `data/enemies.ts` by
kind, never repeating an id within a run; `event` nodes carry `eventId` (no repeats while the pool lasts).
Generation lives in `lib/map.ts` (`generateMap(rng)`), called by `newRun`.

Flow: `newRun(seed)` → `phase: "map"`, floor 0. `chooseNode(run, idx)` enters the node:
fight/elite/boss/final → `startBattle` (`phase: "battle"`); rest → `"rest"`; event → `"event"`;
merchant → `"merchant"`. Leaving a node (`takeCard`/`takeRelic` done, `rest`, `resolveEvent`
finished, `leaveShop`) calls `advance(run)` → `floor + 1`, `phase: "map"`; after the final boss
→ `"won"`.

Phases: `"map" | "battle" | "reward" | "rest" | "event" | "merchant" | "dead" | "won"`.

## 5. Enemies

`data/enemies.ts` roster (ids are fixed so the sprite components can match them):

| id | kind | name (es) | zh | gloss |
|---|---|---|---|---|
| limo | minion | Limo de pantano | 沼泽泥怪 | swamp slime |
| murci | minion | Murciélago | 蝙蝠 | bat |
| rata | minion | Rata gigante | 巨鼠 | giant rat |
| arana | minion | Araña de cripta | 墓穴蜘蛛 | crypt spider |
| cuervo | minion | Cuervo | 乌鸦 | crow |
| duende | minion | Duende | 小妖 | goblin |
| golem | elite | Gólem de piedra | 石巨人 | stone golem |
| espectro | elite | Espectro | 幽灵 | specter |
| lobo | elite | Lobo de ceniza | 灰烬狼 | ash wolf |
| bruja | elite | Bruja del eco | 回声女巫 | echo witch |
| dragon | boss | Dragón de ceniza | 灰烬龙 | ash dragon |
| hidra | boss | Hidra | 九头蛇 | hydra |
| olvido | final | El Olvido | 遗忘 | the Forgetting |

```ts
type Intent = "attack" | "double" | "charge" | "curse" | "silence" | "heal" | "block";
type EnemyDef = { id; name; zh; gloss; kind; emoji; hp; attack; weak: Element; resist?: Element; minTier?: 1|2|3;
  pattern: Intent[]; taunt: string; tauntZh: string; ink: number /* base drop */ };
type Enemy = EnemyDef & { hpNow: number; step: number; charged: boolean; statuses: Status[] };
```

Enemies act once per player turn (≈ every 3 casts), so their attacks are roughly 2–2.5× the old
values; the simulation tunes them. `INTENT_TEXT` stays English (UI language) and gains entries
for `double`, `silence`, `block`.

## 6. Rewards, ink, rest, events, merchant

- **Ink** (`run.ink`): earned on `winBattle` = `enemy.ink × (0.75 + 0.5 × avgScoreThisBattle)`
  (+ relic `inkBonus`). Start with 30.
- `winBattle` → `phase: "reward"`, `run.rewards = { cards: Spell[] (3), relics: Relic[] (0 or 3), ink, cardTaken, relicTaken }`.
  Card tiers by floor: floors 0–1 tier 1 (one tier-2 allowed), 2–4 mostly tier 2, 5–6 tier 2–3;
  picks are weighted by rarity (common 3 : uncommon 2 : rare 1). Elites/bosses add a relic choice (3).
  `pendingReward(run)` says what is still open ("card" → "relic" → null). `takeCard(run, idx | null)`
  then `takeRelic(run, idx | null)` (only if offered); when nothing is pending the engine calls `advance`.
  Beating the final → `phase: "won"` (no rewards). `run.enemy` stays set during "reward" for the screen copy.
- **Rest** (`phase: "rest"`): `rest(run, "heal" | "study" | "forget", cardUid?)` — heal 30% max HP,
  upgrade a card, or remove a card. Then `advance`.
- **Events** (`data/events.ts`, ≥ 7, bilingual title/body): each has 2–3 `EventOption`s.
  ```ts
  type EventEffect =
    | { kind: "heal"; pct: number } | { kind: "damage"; amount: number } | { kind: "ink"; amount: number }
    | { kind: "maxhp"; amount: number } | { kind: "relic" } | { kind: "card"; tier?: 1|2|3 } | { kind: "remove" }
    | { kind: "upgrade" } | { kind: "breath"; amount: number } | { kind: "purgeGrudges" } | { kind: "leave" };
  type EventOption = { label: string; zh: string; detail: string;
    trial?: { level: 1|2|3; threshold: number; success: EventEffect[]; failure: EventEffect[] };
    effects?: EventEffect[] };
  ```
  A **trial** is a pronunciation check: the UI draws a phrase (`drawPhrase(run, { level }, lexicon)`),
  captures speech, then calls `resolveEvent(run, optionIdx, score)`; non-trial options call it without a
  score. `remove`/`upgrade` effects need a card: `run.event.pending = "remove" | "upgrade"`,
  `stage = "pick"`, and the UI calls `pickEventCard(run, uid)`. When nothing is pending the engine sets
  `stage = "done"` and writes `run.event.outcome` (English); the UI shows it and **calls `advance(run)`
  itself** (unlike rewards/rest/shop, which advance inside the engine) so the outcome can be read.
  Negative `ink` effects are prices: `eventOptionAvailable(run, idx)` is false when the run cannot pay
  (or has no card to remove/upgrade) and `resolveEvent` then returns the run unchanged. An event
  `damage` that kills sets `phase: "dead"`.
- **Merchant** (`phase: "merchant"`): `run.shop = { cards: {spell, price, sold}[], relics: {relic, price, sold}[],
  removePrice, upgradePrice }` (seeded). `buyCard(run, i)`, `buyRelic(run, i)`, `buyRemove(run, uid)`,
  `buyUpgrade(run, uid)`, `leaveShop(run)`.

## 7. Relics

`data/relics.ts`, 17 (six existing + one per new hook), bilingual. Keep the six existing hooks and add:
`breath` (+1 max), `handSize` (+1), `redraws` (+1 per turn), `burnBonus` (+1 burn stack applied),
`chainBonus` (+0.05 per chain step), `thorns` (damage back when hit), `startArmor` (armor at battle
start), `inkBonus` (fraction), `resonanceAt` (2 instead of 3), `turnFocus` (focus at the start of
every turn), `perfectBreath` (score ≥ 0.95 refunds 1 breath, once per turn).

## 8. Run type (complete)

```ts
type Run = {
  seed: number; floor: number; map: MapNode[][]; path: number[];
  hp: number; maxHp: number; shield: number; ink: number;
  deck: Card[]; draw: string[]; hand: string[]; discard: string[];
  breath: number; maxBreath: number; redrawsLeft: number; turn: number;
  relics: string[]; statuses: Status[];
  enemy: Enemy | null; echoUsed: boolean; cursed: boolean; resonance: number;
  lastElement: Element | null; chain: number;
  grudges: string[]; recent: string[]; wordsSeen: string[];
  battleScores: number[];                      // for ink
  stats: { casts: number; perfect: number; backfires: number; damage: number; scoreSum: number;
           turns: number; inkEarned: number; maxChain: number; reactions: number; elites: number };
  phase: Phase;
  rewards?: { cards: Spell[]; relics: Relic[]; ink: number; cardTaken: boolean; relicTaken: boolean };
  event?: { id: string; stage: "choose" | "pick" | "done"; pending?: "remove" | "upgrade"; outcome?: string };
  shop?: Shop;
  log: string[];                               // last 20 human-readable lines, newest last (English sentences, Spanish in-world names)
  perfectUsed: boolean;                        // perfectBreath relic already refunded this turn (reset each turn)
};
```

`drawPhrase(run, spellOrLevel, lexicon, rand?)` keeps its behaviour (level = tier + cursed, themes,
skip last 5, 40% grudge redraw) and also accepts `{ level: 1|2|3 }` for trials (no curse, no themes).

## 9. Speech & Gemini layer (lib/speech.ts, lib/gemini.ts, app/api/*)

```ts
// lib/speech.ts
type CaptureReason = "result" | "silence" | "timeout" | "stopped" | "error" | "unsupported";
type Capture = { alts: Alt[]; ms: number; reason: CaptureReason; error?: string; audio: { b64: string; mime: string } | null };
function captureCast(lang: string, opts: { timeoutMs?: number; onLevel?: (v: number) => void }): { result: Promise<Capture>; stop(): void };
```

- `stop()` ends listening **now** and still returns whatever the recognizer heard (it calls
  `recognition.stop()` and waits ≤ 2.5 s for the final result instead of resolving empty).
- The timeout does the same: stop and wait for the final result, never discard speech.
- `reason: "silence"` when no speech was detected (`no-speech`, or empty alternatives). The UI
  treats silence/timeout-without-speech as **no cast**: no breath spent, no damage, "I didn't
  hear anything — try again".
- All mic tracks are stopped in every exit path; the browser's mic indicator must go off within
  ~300 ms of the result.
- `onLevel` reports RMS 0..1 ~30×/s for a meter.
- `components/hooks/useSpeechCapture.ts`: React hook `{ listening, level, start(lang, timeoutMs), stop() }`
  returning a `Capture`, used by the battle screen and by event trials.

```ts
// lib/gemini.ts
type GeminiWhy = "nokey" | "quota" | "cooldown" | "timeout" | "badmodel" | "empty" | "error";
callGemini(contents, generationConfig, opts?: { prefer?: "flash" | "lite" }): Promise<{ text: string | null; why?: GeminiWhy; model?: string }>;
geminiStatus(): { configured: boolean; models: string[]; cooldownUntil: number; lastError: { status: number; message: string; model: string; at: number } | null };
```

- 429 → set a cooldown (`Retry-After` or "retry in Ns" from the body, default 30 s); during
  cooldown calls return `{ text: null, why: "cooldown" }` immediately.
- 400 mentioning thinking → retry once without `thinkingConfig`.
- Routes return `mode` and `why` so the UI can show a quiet status ("coach resting: quota, 24 s").
- `GET /api/health` → `geminiStatus()`; `GET /api/health?ping=1` additionally lists models the
  key can see (`GET /v1beta/models`) and makes one tiny generateContent call, returning the raw
  status and message. Never called by the game loop.
- Request budget: feedback once per cast (skipped when `score ≥ 0.97`, template praise instead);
  vocab growth at most once per **floor**, from the map/reward screen; mentor on demand.

## 10. Screens (phase 2)

`components/Game.tsx` orchestrates state (`run, lang, lexicon, words, useTyping`) and renders one of
`components/screens/{Title,MapScreen,Battle,RewardScreen,RestScreen,EventScreen,MerchantScreen,End}.tsx`
plus `Mentor`. Visual primitives live in `components/fx/*` (see its README).

---

## 11. API (final)

Everything the screens may import, with exact signatures. All engine functions are pure and return a
**new** `Run` (`structuredClone`); the input is never mutated. Functions that refuse a legal-but-impossible
player action (shop purchases without ink, unavailable event options, `useRedraw` with none left) return
the **same `run` reference**; functions called in the wrong phase or with bad ids **throw**.

### `lib/engine.ts`

```ts
// constants (balance knobs)
export const RUN_VERSION = 2;                                       // stamped on newRun().version; Game.tsx discards saves with another version
export const HAND_SIZE = 5; export const BASE_BREATH = 3; export const START_HP = 70; export const START_INK = 30;
export const GRUDGE_BELOW = 0.7; export const RESONANCE_AT = 3; export const REST_HEAL = 0.3; export const LOG_LINES = 20;
export const ELEMENT_OFFER_BIAS = 0.6;                              // share of card offers drawn from elements already in the deck (§13)
export const BALANCE: { floorScale: number };                       // 0.05 — enemy hp/attack × (1 + floor × floorScale); mutable for lib/sim.ts only
export const CARD_PRICE: Record<1 | 2 | 3, number>;                  // 35 / 55 / 80 (± seeded jitter in the shop)
export const RELIC_PRICE = 110; export const REMOVE_PRICE = 45; export const UPGRADE_PRICE = 35;
export { FLOORS } from "./map";                                      // 8

// types (re-exported from data where they live)
export type { Status, StatusId, StatusApply, Element, Spell } from "@/data/spells";
export type { MapNode, NodeKind } from "./map";
export type { Intent, EnemyDef } from "@/data/enemies";
export type { Relic } from "@/data/relics";
export type Phase = "map" | "battle" | "reward" | "rest" | "event" | "merchant" | "dead" | "won";
export type ReactionId = "wildfire" | "steam" | "storm" | "eclipse" | "dusk";
export type Card = { uid: string; spell: string; up: boolean };
export type Enemy = EnemyDef & { hpNow: number; step: number; charged: boolean; statuses: Status[] };
export type ShopCard = { spell: Spell; price: number; sold: boolean };
export type ShopRelic = { relic: Relic; price: number; sold: boolean };
export type Shop = { cards: ShopCard[]; relics: ShopRelic[]; removePrice: number; upgradePrice: number };
export type Rewards = { cards: Spell[]; relics: Relic[]; ink: number; cardTaken: boolean; relicTaken: boolean };
export type EventState = { id: string; stage: "choose" | "pick" | "done"; pending?: "remove" | "upgrade"; outcome?: string };
export type RunStats = { casts: number; perfect: number; backfires: number; damage: number; scoreSum: number; turns: number; inkEarned: number; maxChain: number; reactions: number; elites: number };
export type Run = { /* §8, plus perfectUsed: boolean; version: number; exhausted: string[]; discount: number (§13) */ };
export type CastResult = { /* §1, plus (§13): */ costPaid: number; drawn: number; exhausted: boolean; consumed?: { status: StatusId; stacks: number }; bonusPower: number; sacrificed: number; vsBonus: boolean };
export type TurnResult = { /* §1, plus (§13): */ retained: number };
export type CastPreview = { affordable: boolean; silenced: boolean; weak: boolean; resist: boolean; underTier: boolean; chain: number; reaction: ReactionId | null; mult: number;
  cost: number; bonusPower: number; bonusMult: number; bonusText: string | null };   // §13: cost after discounts; what the card's conditionals give right now ("+18 from Burn", "×1.5 vs Chilled"); `mult` includes bonusMult

// rng
export function rng(seed: number): () => number;                     // xorshift32, values in [0, 1)

// reactions
export const REACTIONS: Record<string, ReactionId>;                  // keys "prev>cur", e.g. "fire>water"
export function reactionFor(prev: Element | null, cur: Element): ReactionId | null;
export const REACTION_TEXT: Record<ReactionId, string>;              // English labels, e.g. "Steam: +50% damage, clears burn"

// statuses (read helpers; lists are run.statuses or run.enemy.statuses)
export function statusOf(list: Status[], id: StatusId): Status | undefined;
export function stacksOf(list: Status[], id: StatusId): number;
export function hasStatus(list: Status[], id: StatusId): boolean;

// small helpers
export function relicsOf(run: Run): Relic[];
export function resonanceAt(run: Run): number;                       // 3, or 2 with Diapasón
export function handSizeOf(run: Run): number;                        // HAND_SIZE + relics
export function nextIntent(e: Enemy): Intent;
export function intentDamage(e: Enemy): number;                      // damage of the next action before block/armor/shield (0 for non-attacks)
export function elementVs(e: Element, enemy: Enemy): "weak" | "resist" | "neutral";
export function cardOf(run: Run, uid: string): Card | undefined;
export function spellOfCard(card: Card): Spell;
export function effectivePower(card: Card): number;                  // power × 1.3 when upgraded
export function cardName(card: Card, lang: string): string;          // localized, "+" appended when upgraded
export function cardDesc(card: Card): string;                        // English rules text with upgraded numbers
export function handCards(run: Run): { card: Card; spell: Spell }[]; // the hand in order
export function currentNode(run: Run): MapNode | undefined;
export function cardCost(run: Run, card: Card): number;              // §13: breath this card costs right now (Tailwind / Veleta discounts); the UI shows this, not spell.cost
export function cardTags(card: Card): string[];                      // §13: ["Exhaust" | "Retain" | "Draw N" | "Tailwind" | "Detonate"] badges

// run flow
export function newRun(seed?: number): Run;                          // phase "map", floor 0, 10 cards, 30 ink, 70 hp, version = RUN_VERSION
export function chooseNode(run: Run, idx: number): Run;              // enters run.map[run.floor][idx]: battle | rest | event | merchant
export function advance(run: Run): Run;                              // floor + 1 → "map" (clears rewards/event/shop/enemy)

// battle
export function spawnEnemy(id: string, floor: number): Enemy;
export function startBattle(run: Run, enemyId?: string): Run;        // defaults to the current node's enemy; called by chooseNode
export function castBlocker(run: Run, uid: string): string | null;   // null = castable; else "not enough breath" | "silenced" | "not enough life" (sacrifice ≥ hp) | "card not in hand" | "not in battle"
export function canAct(run: Run): boolean;                           // some card in hand is castable
export function previewCast(run: Run, spell: Spell): CastPreview;
export function useRedraw(run: Run): Run;                            // redrawsLeft − 1; same run when 0
export function drawPhrase(run: Run, spellOrLevel: Spell | { level: 1 | 2 | 3 }, lexicon: Vocab[], rand?: () => number): Vocab;
export function castCard(run: Run, uid: string, word: Vocab, rawScore: number, ms: number, wordMastered: boolean, rand?: () => number): { run: Run; result: CastResult };
export function endTurn(run: Run, rand?: () => number): { run: Run; result: TurnResult };
export function winBattle(run: Run): Run;                            // the engine calls this itself when the enemy dies

// rewards
export function pendingReward(run: Run): "card" | "relic" | null;
export function takeCard(run: Run, idx: number | null): Run;         // null = skip; advances when nothing is pending
export function takeRelic(run: Run, idx: number | null): Run;

// rest
export function rest(run: Run, choice: "heal" | "study" | "forget", cardUid?: string): Run;   // advances

// events
export function eventOptionAvailable(run: Run, idx: number): boolean;
export function resolveEvent(run: Run, idx: number, score?: number): Run;   // trial options need score; stage → "pick" | "done"
export function pickEventCard(run: Run, uid: string): Run;                   // completes pending remove/upgrade; stage → "done"

// merchant (refusals return the same run)
export function buyCard(run: Run, i: number): Run;
export function buyRelic(run: Run, i: number): Run;
export function buyRemove(run: Run, uid: string): Run;
export function buyUpgrade(run: Run, uid: string): Run;
export function leaveShop(run: Run): Run;                            // advances
```

**Screen flow.** `map`: render `run.map[run.floor]` (doors; `path[f]` is the door taken on floor `f`),
call `chooseNode`. `battle`: `handCards(run)` for the hand; per card `previewCast` / `castBlocker` for
labels and disabling; the phrase is `drawPhrase(run, spell, lexicon)`; Redraw = `run.redrawsLeft > 0 →
useRedraw(run)` then `drawPhrase` again; cast → `castCard`; after showing the result, when
`!canAct(run)` call `endTurn(run)` (there is also a manual End turn button); after either call check
`run.phase` ("reward" | "won" | "dead" can follow both). The intent line is
`INTENT_TEXT[nextIntent(e)](e.attack * (e.charged ? 2 : 1))`; `intentDamage(e)` gives the number.
`reward`: `pendingReward(run)` → `takeCard` / `takeRelic`; the engine advances. `rest`: `rest(run, …)`.
`event`: `eventById(run.event.id)`; disable options with `!eventOptionAvailable`; trial →
`drawPhrase(run, { level }, lexicon)`, capture, `resolveEvent(run, i, score)`; `stage "pick"` → show the
deck and `pickEventCard`; `stage "done"` → show `run.event.outcome`, Continue → `advance(run)`.
`merchant`: `run.shop`, buy functions (compare the returned reference to detect a refusal), `leaveShop`.
`run.log` is a ready-made English battle log (Spanish in-world names); `CastResult`/`TurnResult` carry
everything needed to write localized copy instead.

### `lib/map.ts`

```ts
export type NodeKind = "fight" | "elite" | "rest" | "event" | "merchant" | "boss" | "final";
export type MapNode = { kind: NodeKind; enemyId?: string; eventId?: string };
export const FLOORS = 8; export const OPEN_FLOORS = [1, 2, 4, 5, 6]; export const BOSS_FLOOR = 3; export const FINAL_FLOOR = 7;
export function isCombat(k: NodeKind): boolean;
export function generateMap(r: () => number): MapNode[][];
```

### `lib/lang.ts`

```ts
export type LangId = "es" | "zh";
export type LangConfig = { id: LangId; label: string; english: string; speech: string; tokens: "word" | "char"; hasReading: boolean; italic: boolean; levelDesc: string; coachHint: string; readingName?: string };
export const LANGS: Record<LangId, LangConfig>;
export const DEFAULT_LANG: LangId;
export function loadLang(): LangId; export function saveLang(l: LangId): void;      // localStorage (client only)
export function localName(x: { name: string; zh: string }, lang: LangId): string;    // spells, enemies, relics, NODE_LABEL…
export const ELEMENT_LABELS: Record<LangId, Record<Element, string>>;                // es Fuego/Agua/Viento/Sombra/Luz · zh 火/水/风/影/光
export function elementLabel(el: Element, lang: LangId): string;
export const NODE_LABEL: Record<NodeKind, { name: string; zh: string; en: string }>; // rest = Descansar / 休息 / Rest
export function nodeLabel(kind: NodeKind, lang: LangId): string;
export const REST_LABEL: { name: string; zh: string; en: string };
```

### `data/spells.ts`

```ts
export type Element = "fire" | "water" | "wind" | "shadow" | "light";
export type SpellKind = "attack" | "shield" | "heal" | "drain" | "hex" | "empower";
export type Rarity = "common" | "uncommon" | "rare";
export type StatusId = "burn" | "chill" | "stagger" | "weak" | "exposed" | "armor" | "focus" | "silence" | "strength" | "regen";
export type Status = { id: StatusId; stacks: number; turns: number };            // turns 99 = this battle
export type StatusApply = { status: StatusId; stacks: number; turns: number; target: "enemy" | "self" };
export const STACK_STATUSES: ReadonlySet<StatusId>;                              // burn, stagger, armor, strength, regen (the number shown is stacks; others show turns)
export const STATUS_LABEL: Record<StatusId, string>;                             // English
export const STATUS_DESC: Record<StatusId, string>;                              // English one-liners
export type Spell = { id: string; name: string; zh: string; gloss: string; element: Element; kind: SpellKind; tier: 1 | 2 | 3; cost: number; power: number; themes: Theme[]; rarity: Rarity; desc: string; applies?: StatusApply[]; drain?: number; gain?: { breath?: number };
  // §13 keywords, all optional, all spelled out by spellDesc
  exhaust?: boolean; retain?: boolean; draw?: number; consume?: { status: StatusId; power: number }; perStack?: { status: StatusId; power: number };
  vs?: { status: StatusId; mult?: number; drain?: number }; tailwind?: number; perCast?: number; sacrifice?: number; also?: { heal?: number } };
export const STATUS_ADJ: Record<StatusId, string>;                               // "Chilled", "Burning", … for conditional rules text
export const UPGRADE_POWER = 1.3; export function upgradedPower(power: number): number;
export function sacrificeOf(spell: { sacrifice?: number }, up?: boolean): number;  // life a sacrifice card costs (halved, rounded up, when upgraded)
export function spellDesc(spell: Omit<Spell, "desc">, up?: boolean): string;
export const spells: Spell[];                                                    // 40 (28 + the 12 of §13)
export function spellById(id: string): Spell;
export function spellName(s: Spell, lang: string): string;
export function isDamageKind(k: SpellKind): boolean;                             // attack | drain
export const ELEMENT_LABEL: Record<Element, string>;                             // Spanish (compat); use elementLabel()
export const ELEMENT_ICON: Record<Element, string>;
export const KIND_LABEL: Record<SpellKind, string>;                              // English, incl. hex / empower
export const RARITY_WEIGHT: Record<Rarity, number>;                              // 3 / 2 / 1
```

### `data/enemies.ts`

```ts
export type EnemyKind = "minion" | "elite" | "boss" | "final";
export type Intent = "attack" | "double" | "charge" | "curse" | "silence" | "heal" | "block";
export type EnemyDef = { id: string; name: string; zh: string; gloss: string; kind: EnemyKind; emoji: string; hp: number; attack: number; weak: Element; resist?: Element; minTier?: 1 | 2 | 3; pattern: Intent[]; taunt: string; tauntZh: string; ink: number };
export const INTENT_TEXT: Record<Intent, (atk: number) => string>;               // English; pass attack × (charged ? 2 : 1)
export const enemies: EnemyDef[];                                                // the 13 ids of §5
export function enemyById(id: string): EnemyDef;
export function enemyName(e: EnemyDef, lang: string): string;
export function enemyTaunt(e: EnemyDef, lang: string): string;
```

### `data/relics.ts`

```ts
export type Relic = { id: string; name: string; zh: string; gloss: string; emoji: string; desc: string;
  scoreBonus?: number; maxHp?: number; block?: number; critBonus?: number; echo?: boolean; lifesteal?: number;
  breath?: number; handSize?: number; redraws?: number; burnBonus?: number; chainBonus?: number; thorns?: number;
  startArmor?: number; inkBonus?: number; resonanceAt?: number; turnFocus?: boolean; perfectBreath?: boolean;
  exhaustBreath?: boolean; drawBonus?: number; retainOne?: boolean; firstDiscount?: boolean; castStrength?: number };   // §13 keyword hooks
export const relics: Relic[];                                                    // 22 (17 + the 5 of §13)
export function relicById(id: string): Relic;
export function relicName(x: Relic, lang: string): string;
```

### `data/events.ts`

```ts
export type EventEffect = /* §6 */;
export type EventOption = { label: string; zh: string; detail: string; trial?: { level: 1 | 2 | 3; threshold: number; success: EventEffect[]; failure: EventEffect[] }; effects?: EventEffect[] };
export type EventDef = { id: string; title: string; titleZh: string; body: string; options: EventOption[] };
export const events: EventDef[];                                                 // 8: pozo, vendedora, altar, espejo, biblioteca, ermitano, fuente, mensajero
export function eventById(id: string): EventDef;
export function eventTitle(e: EventDef, lang: string): string;
```

### Removed

`ROOM_PLAN` (data/enemies), `LANG` (data/spells), and from the engine `cast`, `takeReward`, `Reward`.
`run.room` is now `run.floor`; `run.hand` holds card **uids** (`cardOf` → `Card` → `spellOfCard`).

### Deviations from §1–§8 (all reflected above)

1. `CastResult.armorAbsorbed` added; `damage`/`echoDamage` are post-armor; `healed` is life actually restored.
2. `Run.perfectUsed` added (perfectBreath relic, once per turn).
3. `castCard` throws when the card is not castable (documented choice).
4. Events finish in `stage: "done"` and the **UI calls `advance`** (so the outcome can be shown); rewards, rest and shop advance inside the engine.
5. Silence is stored with 2 turns; regen heals before the player tick; armor gained by `block` does not halve in the same phase.
6. 17 relics (not 12–14): one relic per requested hook. 28 cards: adds Inspiración (`gain: { breath: 2 }`); Amanecer heals via regen 5/2.
7. Elites never on floor 1; no duplicate door kinds on a floor.
8. `BALANCE.floorScale` is a mutable object so `lib/sim.ts` can sweep it; `startBattle` takes an optional `enemyId`.
9. §13 (card depth): `HAND_SIZE` 5, a 10-card starter, `RUN_VERSION`, `Run.exhausted` / `Run.discount`, the keyword
   fields on `Spell`, `cardCost` / `cardTags`, the extra `CastResult` / `TurnResult` / `CastPreview` fields, `castBlocker`
   → "not enough life", 40 cards, 22 relics, element-weighted offers. All additive: the phase-2 UI compiles unchanged.
10. Enemy `attack` × 0.9 across the roster (the bigger starter deck and once-per-battle tier-3s made fights longer).

---

## 12. Balance

`npm run sim` plays 400 whole runs per accuracy level with a bot (`lib/sim.ts`, seeded, reproducible).
Each cast's `rawScore = clamp(normal(p, 0.10), 0, 1)`; tier-3 phrases draw `normal(p − 0.05, 0.12)`;
`ms` 1800 when p ≥ 0.85 else 3000; `wordMastered` false. Bot policy: on the map rest when hp < 50%,
merchant when ink ≥ 60, elite when hp > 70%, else fight, else event; in battle shield when the
telegraphed hit ≥ 60% of current hp, heal under 35%, take a kill when one is in hand (the cheapest, not an
Exhaust card), otherwise rank the castable cards by value per breath with free cards first: attacks by
`previewCast().mult × (power + strength + bonusPower)`, Detonate minus the burn ticks it gives up, Draw and
Tailwind when they open the hand, Exhaust attacks held back on a nearly dead minion, Pacto / Inspiración only
when the hand costs more than the breath left, hexes by what they prevent or apply, exposed before big hits;
end the turn when nothing has value. Rewards and shop: the card worth most to the deck (power, +8 per card of
its element, +6 per burn / chill / stagger / weak source the deck already has for Avivar, Explosión, Témpano,
Escarcha, Filo, Garra, −10 for a sentence); the first affordable relic. Rest: heal under 60% else upgrade.
Trials attempted when p ≥ 0.75.

Metrics: `allPlay%` = turns whose whole starting hand was affordable; `casts/turn` = casts ÷ hands dealt;
`left` = cards still in hand when the turn was ended.

Result (400 runs per p, seeds 1–400, `npm run sim`, engine2 / §13):

| p    | win%  | avg floor | casts | words | turns | backfire% | allPlay% | casts/turn | left |
|------|-------|-----------|-------|-------|-------|-----------|----------|------------|------|
| 0.95 |  64.8 |      7.76 |  53.7 |  41.7 |  13.5 |       0.0 |     12.5 |       2.88 | 2.13 |
| 0.85 |  55.0 |      7.68 |  57.3 |  42.7 |  15.0 |       0.0 |     11.9 |       2.88 | 2.13 |
| 0.75 |  33.8 |      7.01 |  59.6 |  39.5 |  16.1 |       0.1 |     11.1 |       2.93 | 2.09 |
| 0.65 |  13.3 |      6.12 |  55.4 |  32.9 |  14.9 |       1.9 |     11.5 |       3.00 | 2.02 |
| 0.50 |   0.0 |      3.80 |  27.0 |  18.5 |   6.7 |      28.4 |     10.4 |       3.03 | 1.79 |

Targets: win 60–70 / 45–55 / 30–40 / 15–25 / 0–5, allPlay ≤ 25 %, casts/turn 2.2–2.8. Win rates sit in, or within
one standard deviation (≈ 2.5 points at n = 400) of, every band: p = 0.85 is on the line, p = 0.65 is 1.7 under, and
the two move in opposite directions under any flat change. allPlay is 10–12 %. casts/turn is 2.9–3.0, above the
band: two free cards among ten plus three breath make ≈ 2.9 the arithmetic floor while the deck is all 1-cost,
and the bot plays every free card. Levers if that band matters more than the free-card feel: cost 1 on Foco
(or Exhaust instead of Retain), or a third 2-cost starter. "avg floor" counts floors entered (8 = cleared).
Casts per run rose from ≈ 44 to ≈ 55 (hand 5): about 40 distinct words a run. A human will do a little worse.

What was tuned (engine2): with the phase-2 roster the bigger starter (two shields, Foco, two free cards) and the
once-per-battle tier-3s made fights longer and p = 0.95 fell to 53 %. Enemy `attack` × 0.9 across the roster
brought the table back (minions 14–16, elites 22–23 after one more point off, bosses 25–26); the final boss is the
sensitive knob (olvido 32 → 68 / 57.5 / 35 / 15, 34 → 58.5 / 47 / 26 / 12), settled at 33. hp is unchanged (hp adds
casts, attack adds deaths). Spell power, costs, ink and prices are as in §3 / §6 / §13. Phase-2 history: the first
draft (minions ~44 hp / 10 attack, elites ~100 / 17, bosses ~165 / 19, final 230 / 24) won 98 % at p = 0.95 and
was scaled to hp × 1.19 / attack × 1.63; the phase-2 table was 63.8 / 48.3 / 34.3 / 17.5 / 0 with ≈ 44 casts.

Knobs, in order of leverage:

- `data/enemies.ts` `hp` / `attack` (per enemy; `pattern` changes the texture, `ink` the economy).
- `BALANCE.floorScale` in `lib/engine.ts` (0.05): how much harder floors 4–6 are than 0–2.
- `power` / `cost` / `applies` in `data/spells.ts`; `UPGRADE_POWER` (1.3).
- `START_HP` 70, `START_INK` 30, `HAND_SIZE` 5, `BASE_BREATH` 3, `REST_HEAL` 0.3, `ELEMENT_OFFER_BIAS` 0.6 in `lib/engine.ts`;
  the starter's two free cards (Susurro, Foco) and the 2-cost tier-1 variants set casts per turn (§13).
- Prices `CARD_PRICE` {35, 55, 80}, `RELIC_PRICE` 110, `REMOVE_PRICE` 45, `UPGRADE_PRICE` 35; reward
  tier odds in `tierWeights()`; crit/backfire thresholds in §1 and `lib/scoring.ts`.
- Sim what-ifs without touching data: `npm run sim -- --hp 1.1 --atk 0.9 --scale 0.08 --n 200 --p 0.9,0.7`;
  `--verbose --p 0.85 --seed 3` prints one run's log and final state.

---

## 13. Card depth (engine2)

The complaint this answers: "the cards don't synergize, and you can almost always play the whole hand." Hand 5,
breath 3, a 10-card starter with two free cards (Susurro, Foco): the whole hand is affordable only when both free
cards arrive with three 1-cost cards (≈ 11 % of turns in the sim), so a turn is a choice of two or three cards.
**Tier is phrase difficulty, cost is breath.** Hoguera / Témpano / Empujón are one easy word for 2 breath; Avivar /
Escarcha / Filo de viento / Letanía are a harder phrase for 1 breath. Keywords live on `Spell` as optional fields,
`spellDesc` spells every one out (so `cardDesc(card)` stays the single source of truth) and `cardTags` badges the
boolean ones: **Exhaust** (out for the battle, back after it: every tier-3, Inspiración, Pacto, Señal), **Retain**
(Foco, Muro), **Draw N** (Brisa), **Detonate** (`consume`, Explosión), `perStack` (Avivar), `vs` (Témpano, Escarcha,
Filo, Garra oscura), **Tailwind** (Ráfaga: the next card with a cost pays 1 less, unused by free cards, gone at turn end),
`perCast` (Letanía), `sacrifice` (Pacto), `also.heal` (Aura). Conditionals read the enemy as it is before the cast
applies its own statuses; none of them fire on a backfire (an Exhaust card is still spent).

Engines, one per element (reactions in §2 cut across them):

- **Fire — build burn, then choose: tick or burst.** Chispa, Ceniza, Hoguera, Llamarada stack burn (Brasa eterna +1,
  wildfire ×2). Avivar reads the stack (+3 per stack, keeps it); Explosión consumes it (+3 per stack, now). Steam
  (fire→water) is the tempting mistake: +50 % damage but it clears the burn you were building.
- **Water — chill, then punish.** Gota, Niebla, Marea, Escarcha chill (and stop charges). Témpano and Escarcha hit ×1.5
  into Chill: Gota → Témpano is 3 breath for 12 + 30 instead of 12 + 20. Niebla's Weak also feeds shadow.
- **Wind — tempo.** Brisa draws, Ráfaga's Tailwind makes Vendaval cost 1 (3 breath for 8 + 24), Empujón / Vendaval /
  storm (water→wind) stagger, Filo de viento hits ×1.5 into Stagger. Muro is the wall you Retain until the charged hit.
- **Shadow — drain and debt.** Maldición, Sangría, Niebla apply Weak; Garra oscura drains *all* its damage against a
  Weak enemy; Pacto pays 4 life for 2 breath once per battle and the drains pay it back; dusk (light→shadow) drains everything.
- **Light — expose and amplify.** Señal (free, once per battle), Destello, Rayo expose (×1.5 to every hit); Aura
  shields and heals; Foco is a Retained +0.10; Canto, Letanía (+2 per cast this battle) and Metrónomo scale a long
  fight; Inspiración is the once-per-battle extra turn.

Offers lean toward the deck: each reward/shop slot takes an element already in the deck with probability
`ELEMENT_OFFER_BIAS` (0.6, weighted by card count), and the last slot is forced off-element when the others all
matched and some element is still missing, so a fire deck keeps seeing Avivar / Explosión but never loses its way out.
Relics on the keywords: Páginas de ceniza (Exhaust → +1 breath), Abanico de seda (every draw +1), Marcapáginas (keep
the costliest unplayed card), Veleta (first card each turn −1), Metrónomo (every 4th cast +1 Strength).

### UI wiring needed (components are owned by the UI agent; the engine is additive, the UI compiles as is)

- `components/screens/battle/Hand.tsx`: `cost={cardCost(run, card)}` instead of `spell.cost`; render `cardTags(card)`
  as small badges on the card; pass `previewCast(run, spell).bonusText` through `cardHint`.
- `components/screens/battle/copy.ts` `cardHint`: after the blocker checks add `if (p.bonusText) return p.bonusText;`
  and, when `p.cost < spell.cost`, `"−1 breath"` (avoid the word "cost": `SpellCard`'s `BAD_HINT` regex treats it as a penalty).
- `copy.ts` `castSentence`: `r.consumed` → `", detonating 6 burn"`; `r.bonusPower` → `" (+18 from burn)"`; `r.drawn` →
  `"Draw 1."`; `r.exhausted` → `"It is spent for this battle."`; `r.sacrificed` → `"You pay 4 life."`; `r.costPaid < spell.cost`
  → `"(1 breath, tailwind)"`. `enemyTurnSentence`: `t.retained` → `"You keep 1 card."`.
- `components/screens/battle/Incantation.tsx`: when `run.discount > 0` show "Tailwind: your next card costs 1 less"
  beside the chain / reaction line; the keyboard hint "1–5" becomes "1–9" (Draw can grow the hand).
- `components/screens/Battle.tsx` `cast()`: `castBlocker` can return `"not enough life"` → notice "Not enough life to pay
  for that."; `castEffects`: float `r.sacrificed` as `−4` in blood and `r.drawn` as `+1 card`.
- `components/Game.tsx` `loadRun`: `if (r.version !== RUN_VERSION) return null;` (import `RUN_VERSION`); `mentorCtx.hand`
  entries: `cost: cardCost(run, card)` and `tags: cardTags(card)`.
- `RewardScreen` / `MerchantScreen` / `DeckPicker`: `spell.cost` and `cardDesc` are right outside battle (no discounts);
  `spell.desc` already carries the keywords. Optional: `cardTags` badges there too.
