# components/fx — visual primitives

Pure presentational pieces for the battle, map and reward screens. Everything is inline SVG and
CSS; no images, no dependencies, and **no imports from `lib/engine.ts` or `data/*`** — props are
plain strings, numbers, booleans and small literal unions declared in `components/fx/types.ts`
(`Element`, `SpellKind`, `EnemyKind`, `NodeKind`, `StatusId`). Import from the barrel:

```ts
import { EnemySprite, SpellCard, HpBar, useFloatText, /* … */ } from "@/components/fx";
```

Art direction: dark candlelit grimoire. Fraunces for display type, Manrope for UI, Noto Serif SC
for Chinese. Every component that renders an in-world name takes `italic` — pass
`LANGS[lang].italic`, never italicise Chinese. UI copy inside components is English; in-world names
arrive already localised. Motion is short and purposeful; `prefers-reduced-motion` is respected
(the global rule in `app/globals.css` cuts every animation to one frame, and floating numbers /
ink deltas get a static pose instead of vanishing).

Review page: `/dev/fx` renders every component in every state.

---

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

```tsx
<p>Weak to <Sigil element={enemy.weak} size={14} /> {ELEMENT_LABEL[enemy.weak]}</p>
```

## SpellCard

```ts
{ name: string; desc: string; element: Element; kind: "attack" | "shield" | "heal" | "drain" | "hex" | "empower";
  tier: 1 | 2 | 3; cost: number; power?: number; up?: boolean; selected?: boolean; disabled?: boolean;
  hint?: string; italic?: boolean; onClick?: () => void; hotkey?: string; className?: string }
```

Grimoire card, 150 px wide (`.fx-card`, min-height 206 px) so a 4–5 card hand fits in 720 px and
wraps at phone width. Cost gem top-left, tier pips top-right, element sigil with `power` under it,
name in Fraunces (`italic` default true), kind · element, rules text (`desc`, clamped to 3 lines).
`up` adds a vellum sheen and a gold top edge (pass the name with "+" already appended, as
`cardName()` does). `selected` lifts the card and rings it ember; hover lifts slightly.
`disabled` dims the face but keeps the `hint` badge readable. Hints that explain a penalty
("resisted", "too weak", "silenced", "not enough breath") render in blood; everything else
("steam ↑", "×2 here", "3 breath") in light.

```tsx
<SpellCard name={cardName(card, lang)} desc={spell.desc} element={spell.element} kind={spell.kind}
  tier={spell.tier} cost={spell.cost} power={spell.power} up={card.up} italic={LANGS[lang].italic}
  selected={selected === card.uid} disabled={!preview.affordable || preview.silenced}
  hint={hintFor(preview)} hotkey={String(i + 1)} onClick={() => setSelected(card.uid)} />
```

## BreathPips

```ts
{ current: number; max: number; className?: string }
```

Ember gems, spent ones hollow. `role="meter"` with an aria label ("2 of 3 breath").

```tsx
<BreathPips current={run.breath} max={run.maxBreath} />
```

## HpBar

```ts
{ value: number; max: number; color?: "moss" | "blood" | "light"; label?: string; ghost?: boolean; className?: string }
```

Animated fill (300 ms) with a pale ghost segment that follows 900 ms later, so recent damage
lingers as a tail (`ghost` default true). Shows `value / max` in tabular figures; the number turns
blood when a moss bar drops to 25 %.

```tsx
<HpBar value={run.hp} max={run.maxHp} label="Your life" />
<HpBar value={enemy.hpNow} max={enemy.hp} color="blood" />
<HpBar value={run.shield} max={30} color="light" label="Shield" ghost={false} />
```

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

```tsx
{enemy.statuses.map((s) => <StatusBadge key={s.id} id={s.id} stacks={s.stacks} turns={s.turns} />)}
{run.statuses.map((s) => <StatusBadge key={s.id} {...s} target="self" />)}
```

## useFloatText · FloatLayer

```ts
useFloatText(): { host: RefObject<HTMLDivElement | null>; float(text: string, cls?: string): void; layer: ReactElement }
<FloatLayer floats={FloatItem[]} />
```

React-state replacement for the old `document.createElement` hack. Attach `host` to a `relative`
container and render `layer` inside it; `float()` adds a rising display-font number for 1.1 s.
`cls` is a colour class (default `text-ember`). Near-simultaneous floats fan out horizontally.

```tsx
const { host, float, layer } = useFloatText();
<section ref={host} className="relative min-h-[220px]">
  {/* the incantation */}
  {layer}
</section>
// after a cast:
if (r.backfire) float(`−${r.selfDamage}`, "text-blood");
else if (spell.kind === "heal") float(`+${r.healed}`, "text-moss");
else float(`${r.crit ? "✦ " : ""}${r.damage}`, r.weak ? "text-light" : "text-ember");
```

## Burst

```ts
{ element: Element; trigger: number; className?: string }
```

Twelve CSS-only particles plus a soft flash in the element colour, 650 ms, fired every time
`trigger` changes (not on mount). Absolutely positioned over its `relative` parent, pointer-events
none. Increment a counter to fire it.

```tsx
const [burst, setBurst] = useState(0);
<div className="relative">
  <EnemySprite id={enemy.id} kind={enemy.kind} hurt={hurt} />
  <Burst element={spell.element} trigger={burst} />
</div>
// on a landed cast: setBurst((b) => b + 1)
```

## VuMeter · ListeningRing

```ts
VuMeter: { level: number; active: boolean; className?: string }
ListeningRing: { active: boolean; level: number; className?: string; children?: ReactNode }
```

`VuMeter` is nine ember bars whose heights follow `level` (0..1) through 150 ms CSS transitions;
dim when inactive. `ListeningRing` is two ember rings that swell with the level. Without children
it renders only the rings (absolute, inset-0) for a `relative` wrapper of your own; with children
it wraps them.

```tsx
const { listening, level, start, stop } = useSpeechCapture();
<VuMeter level={level} active={listening} />
<ListeningRing active={listening} level={level}>
  <button className="btn-ember" onClick={cast}>{listening ? "Listening — say it now" : "Cast"}</button>
</ListeningRing>
```

## DoorCard · DOOR_META

```ts
{ kind: "fight" | "elite" | "rest" | "event" | "merchant" | "boss" | "final"; title: string; subtitle?: string;
  italic?: boolean; onClick?: () => void; disabled?: boolean; className?: string }
```

Tall arch (140 × 200 px) with an icon and glow per kind: fight ember, elite blood, rest moss,
event shadow, merchant light, boss blood, final pale violet. Elite/boss/final pulse. `DOOR_META`
exposes label, colour and icon for reuse (e.g. legends).

```tsx
{run.map[run.floor].map((node, i) => (
  <DoorCard key={i} kind={node.kind} title={localName(enemyOrNode, lang)} subtitle={node.enemyId && gloss}
    italic={LANGS[lang].italic} onClick={() => choose(i)} />
))}
```

## PathStrip

```ts
{ floors: NodeKind[][]; path: number[]; floor: number; className?: string }
```

Compact 8-floor route strip, 36 px per floor (288 px for 8), 48 px tall. Pass `run.map` kinds,
`run.path` and `run.floor`. Visited choices are moss, the current node ember (all of the current
floor's doors are ember outlines while `path[floor]` is still undefined, with dashed leads from the
last node), boss/final bigger and blood-tinted ahead, unchosen siblings faint. Shapes: circle
fight, diamond elite, triangle rest, star event, square merchant. Each node has a `<title>`.

```tsx
<PathStrip floors={run.map.map((f) => f.map((n) => n.kind))} path={run.path} floor={run.floor} />
```

## InkCounter

```ts
{ value: number; delta?: number; className?: string }
```

Ink drop + value in display type. Whenever `delta` is non-zero and `value` or `delta` changes
(after mount) a `+N` / `−N` pops beside it for 1.3 s.

```tsx
<InkCounter value={run.ink} delta={lastInkDelta} />
```

## LogPanel

```ts
{ lines: string[]; max?: number; className?: string }
```

The last `max` (default 5) lines of `run.log`, newest last and brightest, older ones fading.
`role="log"`, `aria-live="polite"`.

```tsx
<LogPanel lines={run.log} />
```

---

## CSS added in app/globals.css

Keyframes (top level): `fxBob fxBreathe fxSquish fxFlicker fxDrift fxSway fxDangle fxFlap fxRings
fxEmber fxSpin fxHurt fxAura fxDissolve fxFloat fxBurst fxShimmer fxPop fxGlow`.

Classes (in `@layer components`, so Tailwind utilities override them): `.fx-sprite`,
`.fx-idle-{bob,breathe,squish,flicker,drift,sway,dangle}`, `.fx-part-{flap,sway,flicker,rings,ember,spin,spin-r}`,
`.fx-hurt`, `.fx-dead`, `.fx-aura`, `.fx-float`, `.fx-particle`, `.fx-card`, `.fx-sheen`, `.fx-pop`,
`.fx-danger`. The existing `.panel`, `.btn*`, `.input`, `.meter`, `.orb*` classes and the
`animate-*` utilities from tailwind.config.ts are untouched. `types.ts` exports `ELEMENT_HEX`,
`PALETTE` and `rgba()` so screens can tint inline styles with the same palette.
