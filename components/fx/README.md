# components/fx — visual primitives

Pure presentational pieces for the battle, map and reward screens. Everything is inline SVG and
CSS; no images, no dependencies beyond `pinyin-pro` (for `Ruby`), and **no imports from
`lib/engine.ts` or `data/*`** — props are plain strings, numbers, booleans and small literal unions
declared in `components/fx/types.ts` (`Element`, `SpellKind`, `EnemyKind`, `NodeKind`, `StatusId`,
`LangId`, `IntentId`, `ReactionId`). The two exceptions are deliberate: `LogPanel` imports
`localizeLine` from `lib/lang.ts` (which reads the name tables in `data/*`) and `StageFx` /
`SfxToggle` import `lib/sfx.ts`. Import from the barrel:

```ts
import { EnemySprite, SpellCard, HpBar, useStageFx, Ruby, withPinyin, IntentBadge, /* … */ } from "@/components/fx";
```

Art direction: dark candlelit grimoire. Fraunces for display type, Manrope for UI, Noto Serif SC
for Chinese. Every component that renders an in-world name takes `italic` — pass
`LANGS[lang].italic`, never italicise Chinese — and, where it renders a name itself, `lang`, so that
Chinese comes with ruby pinyin. UI copy inside components is English; in-world names arrive already
localised. Motion is short and purposeful; `prefers-reduced-motion` is respected (the global rule in
`app/globals.css` cuts every animation to one frame, floating numbers / banners / ink deltas get a
static pose instead of vanishing, and shake / knockback / recoil are skipped entirely).

Review page: `/dev/fx` renders every component in every state.

---

## Ruby · withPinyin · pinyinOf · hasHan

```ts
Ruby: { text: string; lang: LangId; className?: string; rt?: string; italic?: boolean }
withPinyin(text: string, lang: LangId): ReactNode
pinyinOf(run: string): string[]      // tone-marked pinyin per character of a Han run, memoised
hasHan(s: string): boolean
```

Pinyin for every Chinese string on screen. For `lang === "zh"` `Ruby` renders one `<ruby>` per run
of Chinese characters with an `<rt>` per character (`蝙<rt>biān</rt>蝠<rt>fú</rt>`), readings from
`pinyin-pro` with tone marks and 一/不 sandhi (so 不好 → bù hǎo, 一个 → yí gè, 下雨了 → xià yǔ le).
Chinese punctuation, Latin text and digits pass through untouched. For `"es"` it is a plain
`<span lang="es-ES">`, italic when `italic` is true. `rt` overrides the reading for the whole text
(use it for a curated `Vocab.reading`). The `<rt>` is small (`max(.5em, 9px)`), Manrope, muted
vellum and never italic (`.fx-ruby`, `.fx-zh` in globals.css); Chinese inside `Ruby` is never
italic whatever class you pass.

`withPinyin` does the same for any string — log lines, Eco's replies, Gemini tips, event outcomes,
the "it heard" transcript — wrapping only the Han runs and returning the plain string for `"es"` or
when there is no Chinese, so it can be dropped into any JSX child position.

```tsx
<h2 className="font-display text-2xl"><Ruby text={enemyName(e, lang)} lang={lang} italic={L.italic} /></h2>
<p>{withPinyin(castSentence(r, card, spell, lang), lang)}</p>
<Ruby text="下雨了" lang="zh" rt="xià yǔ le" />
```

Used today by: EnemyPanel (name, taunt, element labels), Verdict (grade, sentence, phrase, heard,
tip, enemy line), Hand → SpellCard, TopStrip and RunHeader (relics), MapScreen → DoorCard,
RewardScreen, RestScreen, MerchantScreen, EventScreen, DeckPicker, End, Title ("中文" with
zhōngwén), Mentor (Eco's replies), LogPanel. `Incantation.tsx` needs the two lines under
Integration.

## localizeLine (lib/lang.ts) and LogPanel `lang`

```ts
localizeLine(line: string, lang: LangId): string
LogPanel: { lines: string[]; max?: number; className?: string; lang?: LangId }
```

The pure engine writes `run.log` in English with **Spanish** in-world names whatever the language
("Chispa+ lands for 14, critical — steam.", "Araña de cripta strikes for 17; you lose 6."). For
`"zh"`, `localizeLine` swaps every known name for its Chinese — spells with and without their "+",
enemies, relics, event titles and option labels, door labels, element names — whole words only,
case-sensitive, longest alternative first (so "Chispa+" wins over "Chispa", "Escudo de sal" over
"Escudo"; the lowercase reaction id "eclipse" is left alone while the spell "Eclipse" becomes 日食).
The dictionary and regex are built once from `data/*` and cached. `LogPanel lang="zh"` renders every
line through `withPinyin(localizeLine(l, "zh"), "zh")`; without `lang` it shows the lines as written.

## IntentBadge

```ts
{ intent: IntentId; amount?: number; charged?: boolean; shield?: number; armor?: number; note?: string | null;
  title?: string; lang?: LangId; pulseKey?: string | number; className?: string }
```

The enemy's next move, large enough to plan around: a glyph per intent (sword, two swords, rising
arrows, skull, muted speaker, heart-cross, shield), the number that matters (damage for attack and
double, armor gained for block, life mended for heal, "×2" for charge), one English line
("Strikes for 18", "Strikes twice · 10 each", "Charging: next hit ×2", "Curses your next words",
"Silences you", "Mends 14", "Hardens: +27 armor") and a second line. When `shield` or `armor` is
given the second line is "you'd lose N" / "your shield holds" and the badge turns **blood with a
pulsing aura** whenever the hit would get through; it is always blood when `charged` (plus a
"· charged" tag and a pulsing icon). Without those props it keeps the old copy and goes blood only
when charged. `note` is the muted sub-line from `intentLine` ("it will stagger instead", "weakened",
"the chill will hold it"). `title` is the in-world name (`intentName(intent, lang)` → Golpe / 攻击,
with pinyin for zh). Change `pulseKey` (`enemy.step`) to replay the entrance pulse. Flex row that
wraps at phone width; EnemyPanel stacks it under the sprite there.

```tsx
const i = intentLine(e);   // copy.ts: { intent, amount, text, danger, tone, note }
<IntentBadge intent={i.intent} amount={i.amount} charged={e.charged} shield={run.shield} armor={stacksOf(run.statuses, "armor")}
  note={i.note} title={intentName(i.intent, lang)} lang={lang} pulseKey={`${e.id}:${e.step}`} />
```

`copy.ts` also exports `intentAmount(e)` (damage before defenses / armor gained / life mended).

## useStageFx

```ts
useStageFx(): {
  host: RefObject<HTMLDivElement | null>;   // the `relative` section that shakes / recoils
  layer: ReactElement;                        // render inside the `relative` element the overlays should cover
  float(text: string, cls?: string): void;    // useFloatText-compatible rising number
  strike(element: Element, opts?: { amount?: number; crit?: boolean; reaction?: ReactionId | null; weak?: boolean; exposed?: boolean }): void;
  selfHit(amount: number, opts?: { backfire?: boolean }): void;
  shield(amount: number): void;
  heal(amount: number): void;
  callout(text: string, tone?: Element | "gold" | "blood" | "moss" | "light" | "vellum"): void;
  shake(intensity?: "soft" | "hard"): void;
}
REACTION_CALLOUT: Record<ReactionId, { text: string; tone: CalloutTone }>   // WILDFIRE! STEAM! STORM! ECLIPSE! DUSK!
```

Drop-in for `useFloatText()` that makes a hit feel like one. Each method plays its own cue from
`lib/sfx.ts`, so the battle makes one call per effect.

- `strike` — an element overlay over the layer (fire: flash + three flame tongues + ember sparks;
  water: splash flash + three ripple rings + droplets; wind: three slash streaks; shadow: a void
  pulse + six tendrils; light: a radiant beam + ✦ sparkles), a knockback on the sprite
  (`.fx-stage-hit .fx-stage-sprite`, so give the sprite wrapper the class `fx-stage-sprite`), a
  number sized by `amount` (text-4xl / 5xl from 16 / 6xl from 30), gold "✦ N" with its own punchy
  keyframe on a crit, a banner for the reaction (or "×2" for a weakness, or "exposed ×1.5"), a soft
  shake from 14 damage or any reaction and a hard shake on crits and 30+. Sound: `hit` or `crit`
  with the element's timbre, louder with `amount`.
- `selfHit` — red vignette over the layer, a recoil on the host, "−N" in blood; `backfire: true`
  plays the sour backfire cue instead of the enemy-hit thump.
- `shield` — two cyan rings sweeping out plus a flash, "⛨ N".  `heal` — ten green motes rising,
  "+N".  `callout` — a display-font banner in the upper part of the layer, no sound.
  `shake` — the host only.

Nothing animates per frame in React: items mount with a CSS animation and unmount on a timeout
(≈ 0.65–1.4 s; 0.38 s under reduced motion, where shake, knockback and recoil are skipped). The
incantation stays the hero: overlays belong over the enemy sprite; on the self host only the
vignette, the ring, the motes and the numbers appear, and nothing lingers over the phrase longer
than ~0.65 s.

```tsx
const enemyFx = useStageFx();
<section ref={enemyFx.host} className="panel relative …">
  <div className="fx-stage-sprite relative"><EnemySprite … />{enemyFx.layer}</div>
  …
</section>
enemyFx.strike("water", { amount: 31, crit: true, reaction: "steam", weak: true });
```

## lib/sfx.ts · SfxToggle

```ts
playSfx(kind: "hit" | "crit" | "backfire" | "shield" | "heal" | "enemyHit" | "select" | "listen" | "win" | "lose",
        opts?: { element?: Element; intensity?: number }): void
sfxMuted(): boolean · setSfxMuted(v: boolean) · onSfxMuted(cb): unsubscribe · primeSfx()
SfxToggle: { className?: string }     // 🔊 / 🔇 button, aria-pressed, subscribes to the mute state
```

Synthesized cues, no assets: oscillators and filtered noise on a lazily created AudioContext
(created on the first pointer/key gesture, resumed when suspended). Element timbres: fire crackles
(noise 2.6 kHz→380 Hz + thump), water plops (sine 640→140 Hz + splash), wind whooshes (swelling
band-passed noise), shadow growls (two detuned saws under a closing low-pass), light chimes (a
triad + sparkle). `crit` adds an upward sweep and two high partials; `backfire` is a falling saw with
a buzz and a thud; `shield` rings; `heal` and `win` are rising figures; `lose` steps down. Mute
persists in localStorage `incantation.sfx` (default on) and is SSR-safe; nothing here ever throws.
The toggle sits in `TopStrip` (battle) and `RunHeader` (every other screen).

## EnemySprite

```ts
{ id: string; kind: "minion" | "elite" | "boss" | "final"; hurt?: boolean; charged?: boolean; dead?: boolean; className?: string }
```

Inline SVG for the 13 roster ids in DESIGN.md §5 — `limo murci rata arana cuervo duende golem
espectro lobo bruja dragon hidra olvido` (`ENEMY_SPRITE_IDS`). Unknown ids render a generic wisp.
Dark silhouette with an inner radial glow and one or two accent details; each has its own slow
idle (bob, breathe, squish, flicker, drift, sway, dangle, plus wing flaps / hydra heads / echo
rings / rising embers inside the art). Size follows `kind` (minion 140 px, elite 170, boss/final
210) and is overridable with width/height utilities in `className` (`h-12 w-12`).

- `hurt` — ~350 ms flash + shake. Set it true, then false again after ~400 ms; toggling re-runs it.
- `charged` — pulsing blood-red aura ring (enemy intent "charge").
- `dead` — 900 ms dissolve (blur, fade, sink); keep it true until you unmount the enemy.

```tsx
const [hurt, setHurt] = useState(false);
const hit = () => { setHurt(true); setTimeout(() => setHurt(false), 400); };
<EnemySprite id={enemy.id} kind={enemy.kind} hurt={hurt} charged={enemy.charged} dead={enemy.hpNow <= 0} />
```

## Sigil

```ts
{ element: "fire" | "water" | "wind" | "shadow" | "light"; size?: number; className?: string; title?: string }
```

Stroke glyph in the element colour (flame, drop, gusts, crescent, star). Replaces `ELEMENT_ICON`
emoji. Colour is inline from `ELEMENT_HEX`; use `className` for spacing, opacity or drop shadows.

## SpellCard

```ts
{ name: string; desc: string; element: Element; kind: "attack" | "shield" | "heal" | "drain" | "hex" | "empower";
  tier: 1 | 2 | 3; cost: number; power?: number; up?: boolean; selected?: boolean; disabled?: boolean;
  hint?: string; italic?: boolean; lang?: LangId; onClick?: () => void; hotkey?: string; className?: string }
```

Grimoire card, 150 px wide (`.fx-card`, min-height 206 px) so a 4–5 card hand fits in 720 px and
wraps at phone width. Cost gem top-left, tier pips top-right, element sigil with `power` under it,
name in Fraunces (`italic` default true; with `lang="zh"` the name gets ruby pinyin and is never
italic), kind · element, rules text (`desc`, clamped to 3 lines). `up` adds a vellum sheen and a
gold top edge (pass the name with "+" already appended, as `cardName()` does). `selected` lifts the
card and rings it ember; hover lifts slightly. `disabled` dims the face but keeps the `hint` badge
readable. Hints that explain a penalty ("resisted", "too weak", "silenced", "not enough breath")
render in blood; everything else ("steam ↑", "×2 here", "3 breath") in light.

```tsx
<SpellCard name={cardName(card, lang)} desc={spell.desc} element={spell.element} kind={spell.kind}
  tier={spell.tier} cost={spell.cost} power={spell.power} up={card.up} italic={LANGS[lang].italic} lang={lang}
  selected={selected === card.uid} disabled={!preview.affordable || preview.silenced}
  hint={hintFor(preview)} hotkey={String(i + 1)} onClick={() => setSelected(card.uid)} />
```

## BreathPips

```ts
{ current: number; max: number; className?: string }
```

Ember gems, spent ones hollow. `role="meter"` with an aria label ("2 of 3 breath").

## HpBar

```ts
{ value: number; max: number; color?: "moss" | "blood" | "light"; label?: string; ghost?: boolean; className?: string }
```

Animated fill (300 ms) with a pale ghost segment that follows 900 ms later, so recent damage
lingers as a tail (`ghost` default true). Shows `value / max` in tabular figures; the number turns
blood when a moss bar drops to 25 %.

## StatusBadge · STATUS_META · describeStatus

```ts
{ id: StatusId; stacks: number; turns: number; target?: "enemy" | "self"; className?: string }
STATUS_META: Record<StatusId, { label; description; color; primary: "stacks" | "turns"; harmful; icon }>
describeStatus(id, stacks, turns, target?) => string   // the tooltip sentence
```

Small pill: glyph + the primary number (stacks or turns, see table) and, when both matter, a tiny
`Nt` turns counter. `turns ≥ 99` means "this battle" and shows ∞. `title`/`aria-label` carry the
English meaning. Self badges ring moss.

| id | label | primary | colour | meaning (DESIGN.md §2) |
|---|---|---|---|---|
| burn | Burn | stacks | fire | Takes {n} damage at the start of each enemy phase for {t} turns. |
| chill | Chill | turns | water | Cannot charge, and loses any charge it had, for {t} turns. |
| stagger | Stagger | stacks | wind | Skips its next {n} actions. |
| weak | Weak | turns | shadow | Deals 25% less damage for {t} turns. |
| exposed | Exposed | turns | light | Takes 50% more damage for {t} turns. |
| armor | Armor | stacks | vellum2 | Absorbs {n} damage before life is touched; halves each enemy phase. |
| focus | Focus | stacks | ember | Next cast scores +0.10, then focus is spent. |
| silence | Silence | turns | blood | Cannot cast tier-3 cards for {t} turns. |
| strength | Strength | stacks | ember | +{n} power on attacks and drains for this battle. |
| regen | Regen | stacks | moss | Heals {n} at the end of each turn for {t} turns. |

## useFloatText · FloatLayer (still exported)

```ts
useFloatText(): { host: RefObject<HTMLDivElement | null>; float(text: string, cls?: string): void; layer: ReactElement }
```

The older rising-number hook; `useStageFx` returns the same `host` / `float` / `layer` shape plus
the impact effects, so swapping one for the other needs no other change.

## Burst

```ts
{ element: Element; trigger: number; className?: string }
```

Twelve CSS-only particles plus a soft flash in the element colour, 650 ms, fired every time
`trigger` changes (not on mount). `useStageFx().strike` carries its own particles; EnemyPanel's
`burst` prop is optional now.

## VuMeter · ListeningRing

```ts
VuMeter: { level: number; active: boolean; className?: string }
ListeningRing: { active: boolean; level: number; className?: string; children?: ReactNode }
```

`VuMeter` is nine ember bars whose heights follow `level` (0..1) through 150 ms CSS transitions;
dim when inactive. `ListeningRing` is two ember rings that swell with the level.

## DoorCard · DOOR_META

```ts
{ kind: "fight" | "elite" | "rest" | "event" | "merchant" | "boss" | "final"; title: string; subtitle?: string;
  italic?: boolean; lang?: LangId; onClick?: () => void; disabled?: boolean; className?: string }
```

Tall arch (140 × 200 px) with an icon and glow per kind. With `lang="zh"` the title gets ruby
pinyin and is never italic. `DOOR_META` exposes label, colour and icon for reuse.

## PathStrip

```ts
{ floors: NodeKind[][]; path: number[]; floor: number; className?: string }
```

Compact 8-floor route strip, 36 px per floor, 48 px tall.

## InkCounter

```ts
{ value: number; delta?: number; className?: string }
```

Ink drop + value in display type; `delta` pops a `+N` / `−N` beside it for 1.3 s.

## LogPanel

```ts
{ lines: string[]; max?: number; className?: string; lang?: LangId }
```

The last `max` (default 5) lines of `run.log`, newest last and brightest. See "localizeLine" above.

---

## Integration (paste into Battle.tsx)

Battle.tsx and Incantation.tsx were not touched by the fx branch; everything builds with them as
they are (the new props are optional). These edits turn the effects, the badge's defense line and
the log pinyin on.

**1. Imports** (Battle.tsx line 15 and 23) — add `stacksOf` and swap the hook:

```ts
import { castCard, endTurn, useRedraw, drawPhrase, castBlocker, canAct, handCards, cardName, stacksOf, type Run, type Card, type Spell, type Element, type Enemy } from "@/lib/engine";
import { useStageFx, LogPanel } from "@/components/fx";
```

**2. Hooks** (lines 77–78):

```ts
  const enemyFx = useStageFx();
  const selfFx = useStageFx();
```

**3. `castEffects` and `turnEffects`** (replace lines 161–183; `burstOn` becomes unused — delete it and the `burst` state, or leave them, EnemyPanel's `burst` prop is optional):

```ts
  function castEffects(spell: Spell, r: ReturnType<typeof castCard>["result"]) {
    if (r.backfire) { selfFx.selfHit(r.selfDamage, { backfire: true }); return; }
    if (isDamageKind(spell.kind)) {
      const dmg = r.damage + r.echoDamage + r.armorAbsorbed;
      if (dmg > 0) {
        enemyFx.strike(spell.element, { amount: dmg, crit: r.crit, reaction: r.reaction, weak: r.weak, exposed: r.exposed });
        flash();
      }
      if (r.healed) selfFx.heal(r.healed);
    } else if (spell.kind === "shield") selfFx.shield(r.shielded);
    else if (spell.kind === "heal") selfFx.heal(r.healed);
    else if (r.applied.some((a) => a.target === "enemy")) { enemyFx.strike(spell.element, { reaction: r.reaction }); flash(); }
    if (r.gained.breath) selfFx.float(`+${r.gained.breath} breath`, "text-ember");
  }

  function turnEffects(t: ReturnType<typeof endTurn>["result"]) {
    if (t.burnDamage) { enemyFx.strike("fire", { amount: t.burnDamage }); flash(); }
    if (t.enemyHit) selfFx.selfHit(t.enemyHit);
    else if (t.hits && (t.blocked || t.armorAbsorbed)) { selfFx.shield(0); selfFx.float("⛨ held", "text-light"); }
    if (t.thorns) { enemyFx.strike("wind", { amount: t.thorns }); flash(); }
    if (t.enemyHealed) enemyFx.heal(t.enemyHealed);
    if (t.regen) selfFx.heal(t.regen);
  }
```

**4. EnemyPanel** (line 352) — pass your defenses so the badge can say "you'd lose N":

```tsx
      <EnemyPanel enemy={enemy} lang={lang} hurt={hurt} dead={dead} burst={burst} host={enemyFx.host} layer={enemyFx.layer} shield={view.shield} armor={stacksOf(view.statuses, "armor")} />
```

**5. LogPanel** (line 366) — pinyin and Chinese names in the log:

```tsx
      <LogPanel lines={run.log} max={4} lang={lang} className="mt-4" />
```

**6. Optional cues** — `playSfx("listen")` right before `mic.start(...)` in `cast()`, `playSfx("select")` in `select()`, and in Game.tsx `playSfx(run.phase === "won" ? "win" : "lose")` when a run ends (`import { playSfx } from "@/lib/sfx"`).

### Incantation.tsx (two lines)

```tsx
import { ListeningRing, VuMeter, Sigil, Ruby } from "@/components/fx";
```

line 54, the card name:

```tsx
            <Ruby text={cardName(card, lang)} lang={lang} italic={L.italic} className="font-display text-sm text-vellum" /> draws from the lexicon · {phrase.theme}
```

line 131, the chain's element label:

```tsx
            · Chain ×{run.chain} <Sigil element={run.lastElement} size={12} /> <Ruby text={elementLabel(run.lastElement, lang)} lang={lang} />
```

The big phrase keeps its curated `phrase.reading` line underneath (already pinyin), so it needs no
ruby; if you want ruby there too, render `{withPinyin(phrase.text, lang)}` in the `<h1>` and drop
the reading line.

---

## CSS added in app/globals.css

Keyframes (top level): `fxBob fxBreathe fxSquish fxFlicker fxDrift fxSway fxDangle fxFlap fxRings
fxEmber fxSpin fxHurt fxAura fxDissolve fxFloat fxBurst fxShimmer fxPop fxGlow` plus, for the stage
effects, `fxFlash fxFlame fxRipple fxSlash fxVoid fxTendril fxBeam fxSparkle fxVignette
fxShieldRing fxMote fxCallout fxFloatCrit fxShake fxShakeHard fxKnock fxRecoil fxIntentIn
fxIntentDanger fxIntentCharge`.

Classes (in `@layer components`, so Tailwind utilities override them): `.fx-sprite`,
`.fx-idle-*`, `.fx-part-*`, `.fx-hurt`, `.fx-dead`, `.fx-aura`, `.fx-float`, `.fx-float-crit`,
`.fx-particle`, `.fx-card`, `.fx-sheen`, `.fx-pop`, `.fx-danger`, `.fx-zh`, `.fx-ruby` (+ `rt`),
`.fx-strike`, `.fx-flash(-crit)`, `.fx-flame`, `.fx-ripple`, `.fx-slash`, `.fx-void`, `.fx-tendril`,
`.fx-beam`, `.fx-sparkle`, `.fx-vignette`, `.fx-shield-ring`, `.fx-mote`, `.fx-callout`,
`.fx-shake`, `.fx-shake-hard`, `.fx-recoil`, `.fx-stage-hit .fx-stage-sprite`, `.fx-intent`,
`.fx-intent-icon`, `.fx-intent-num`, `.fx-intent-in`, `.fx-intent-danger`, `.fx-intent-charged`.
The existing `.panel`, `.btn*`, `.input`, `.meter`, `.orb*` classes and the `animate-*` utilities
from tailwind.config.ts are untouched. `types.ts` exports `ELEMENT_HEX`, `PALETTE`, `LANG_TAG`,
`LANG_ITALIC`, `rgba()` and `seeded()` so screens can tint inline styles with the same palette.
