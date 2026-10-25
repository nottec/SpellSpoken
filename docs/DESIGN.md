# Incantation — expansion design (HackTX 2026, Oct 24→25)

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

- `run.breath` / `run.maxBreath` (base 3). A card's `cost` is breath; by default `cost = tier`.
- `HAND_SIZE = 4`. At turn start draw up to HAND_SIZE; if the draw pile is empty, shuffle the
  discard into it (seeded). Unplayed cards are discarded at end of turn.
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
  chain: number;                 // consecutive same-element casts including this one (1 = none)
  reaction: ReactionId | null;
  damage: number; echoDamage: number; selfDamage: number; healed: number; shielded: number;
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
| `silence` | player gets `silence` 1 turn (cannot cast tier-3 cards next turn) |
| `heal`    | enemy heals 12% of max HP (0 if `weak`? no — heal is unaffected) |
| `block`   | enemy gains `armor` = `attack × 1.5` (armor absorbs damage, halves each enemy phase) |

Then: enemy statuses tick (`turns −1`, remove at 0; armor halves), `charged` stays until used,
relic `thorns` damages the enemy when it hit you, player `shield = floor(shield / 2)`, player
statuses tick, `regen` heals, `turn++`, discard hand, draw HAND_SIZE, `breath = maxBreath`,
`redrawsLeft` reset. Death → `phase = "dead"`.

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

Starting deck (7): three tier-1 attacks of **three different elements** (seeded), `escudo`
(shield), `aliento` (heal), `susurro` (0-cost shadow jab), and one tier-1 hex (seeded).

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
  Eclipse 🌑 drain 34, 100% · Amanecer ✨ 42 +exposed 2, heal 10 · Fortaleza ✨ shield 30 + armor 10 ·
  Plegaria 💧 heal 30 + regen 5/3.

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
five floors, merchant on exactly two, event on at least two. `fight`/`elite`/`boss`/`final` nodes
carry `enemyId` picked (seeded) from `data/enemies.ts` by kind, never repeating an id within a run.

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
- `winBattle` → `phase: "reward"`, `run.rewards = { cards: Spell[] (3), relics: Relic[] (0 or 2–3), ink }`.
  Card tiers by floor: floors 0–1 tier 1 (one tier-2 allowed), 2–4 mostly tier 2, 5–6 tier 2–3.
  Elites/bosses add a relic choice. `takeCard(run, idx | null)` then `takeRelic(run, idx | null)`
  (only if offered); when nothing is pending → `advance`.
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
  score. `remove`/`upgrade` effects need a card: `run.event.pending = "remove" | "upgrade"` and the UI
  calls `pickEventCard(run, uid)`. When the event is finished → `advance`.
- **Merchant** (`phase: "merchant"`): `run.shop = { cards: {spell, price, sold}[], relics: {relic, price, sold}[],
  removePrice, upgradePrice }` (seeded). `buyCard(run, i)`, `buyRelic(run, i)`, `buyRemove(run, uid)`,
  `buyUpgrade(run, uid)`, `leaveShop(run)`.

## 7. Relics

`data/relics.ts`, 12–14, bilingual. Keep the six existing hooks and add:
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
  log: string[];                               // last ~20 human-readable lines, newest last
};
```

`drawPhrase(run, spellOrLevel, lexicon, rand?)` keeps its behaviour (level = tier + cursed, themes,
skip last 5, 40% grudge redraw) and also accepts `{ level: 1|2|3 }` for trials.

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
