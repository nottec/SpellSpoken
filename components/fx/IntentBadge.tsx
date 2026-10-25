import type { CSSProperties, ReactElement } from "react";
import Ruby from "./Ruby";
import { ELEMENT_HEX, PALETTE, rgba, type IntentId, type LangId } from "./types";

/**
 * The enemy's next move, large enough to plan around: a glyph, the number that matters, one
 * English line and a second line about your defenses. Pure props — the battle passes
 * `nextIntent(enemy)`, `intentDamage(enemy)` (armor gained for block, life mended for heal),
 * `enemy.charged`, your `shield` and `armor`, and keys the pulse on `enemy.step`.
 */
export type IntentBadgeProps = {
  intent: IntentId;
  /** attack/double: damage before your defenses · block: armor gained · heal: life mended. */
  amount?: number;
  /** Next hit is doubled: the badge goes blood with a pulsing aura. */
  charged?: boolean;
  /** Your shield and armor. When either is given the badge says what gets through. */
  shield?: number;
  armor?: number;
  /** Muted sub-line from the old intent copy ("it will stagger instead", "weakened", "the chill will hold it"). */
  note?: string | null;
  /** In-world name of the move (Golpe / 攻击), shown small; ruby pinyin for zh. */
  title?: string;
  lang?: LangId;
  /** Change it (enemy.step) to replay the entrance pulse when a new intent appears. */
  pulseKey?: string | number;
  className?: string;
};

type Tone = "ember" | "blood" | "shadow" | "moss" | "stone";
const TONE_HEX: Record<Tone, string> = { ember: PALETTE.ember, blood: PALETTE.blood, shadow: ELEMENT_HEX.shadow, moss: PALETTE.moss, stone: PALETTE.vellum2 };

/** 24×24 stroke glyphs, drawn with currentColor. */
const ICON: Record<IntentId, ReactElement> = {
  attack: <><path d="M5 19 17 7M14 4l6 6M4 20l3-1 1-3" /><path d="M16 5.5 18.5 8" /></>,
  double: <><path d="M4 20 16 8M13 5l6 6M3 21l3-1 1-3" /><path d="M20 20 8 8M11 5 5 11M21 21l-3-1-1-3" /></>,
  charge: <><path d="M12 21V9M6 15l6-6 6 6" /><path d="M6 8l6-6 6 6" opacity=".55" /></>,
  curse: <><path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4.3 3 5.5V19h8v-3.5c1.8-1.2 3-3.1 3-5.5a7 7 0 0 0-7-7Z" /><circle cx="9.5" cy="11" r="1.3" fill="currentColor" stroke="none" /><circle cx="14.5" cy="11" r="1.3" fill="currentColor" stroke="none" /><path d="M10 19v2M14 19v2" /></>,
  silence: <><path d="M4 9h3l4-3.5v13L7 15H4Z" /><path d="M16 9l5 5M21 9l-5 5" /></>,
  heal: <><path d="M12 20.5S3.5 15 3.5 9A4.5 4.5 0 0 1 12 6.6a4.5 4.5 0 0 1 8.5 2.4c0 6-8.5 11.5-8.5 11.5Z" /><path d="M12 9v6M9 12h6" /></>,
  block: <><path d="M12 3l7 2.5V11c0 4.3-3 7.6-7 8.5-4-.9-7-4.2-7-8.5V5.5Z" /><path d="M12 7v9M8.5 11.5h7" opacity=".6" /></>,
};

export default function IntentBadge({ intent, amount = 0, charged = false, shield, armor, note, title, lang = "es", pulseKey, className = "" }: IntentBadgeProps) {
  const attackish = intent === "attack" || intent === "double";
  const known = shield !== undefined || armor !== undefined;
  const through = attackish && known ? Math.max(0, amount - (armor ?? 0) - (shield ?? 0)) : null;
  const danger = charged || (attackish && through !== null && through > 0);
  const tone: Tone = danger ? "blood" : intent === "curse" || intent === "silence" ? "shadow" : intent === "heal" ? "moss" : intent === "block" ? "stone" : "ember";
  const c = TONE_HEX[tone];

  const label =
    intent === "attack" ? `Strikes for ${amount}`
    : intent === "double" ? `Strikes twice · ${amount / 2} each`
    : intent === "charge" ? "Charging: next hit ×2"
    : intent === "curse" ? "Curses your next words"
    : intent === "silence" ? "Silences you"
    : intent === "heal" ? (amount > 0 ? `Mends ${amount}` : "Mends itself")
    : `Hardens: +${amount} armor`;
  const sub =
    attackish && through !== null ? (through > 0 ? `you'd lose ${through}` : "your shield holds")
    : attackish ? (charged ? "doubled by its charge" : "before your shield and armor")
    : intent === "charge" ? "a hex or a stagger can stop it"
    : intent === "curse" ? "one level harder to say"
    : intent === "silence" ? "no tier-3 spells next turn"
    : intent === "heal" ? "a tenth of its life, about"
    : "armor halves each turn";
  const big = attackish || intent === "block" || (intent === "heal" && amount > 0) ? String(amount) : intent === "charge" ? "×2" : null;
  const aria = `Next: ${label}${sub ? `, ${sub}` : ""}${note ? `, ${note}` : ""}`;

  return (
    <div
      key={pulseKey}
      className={`fx-intent fx-intent-in ${danger ? "fx-intent-danger" : ""} ${charged ? "fx-intent-charged" : ""} ${className}`}
      style={{ "--c": c, "--c-soft": rgba(c, 0.16), "--c-ring": rgba(c, danger ? 0.7 : 0.45) } as CSSProperties}
      data-intent={intent}
      role="status" aria-label={aria}
    >
      <span className="fx-intent-icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICON[intent]}</svg>
      </span>
      {big !== null && <span className="fx-intent-num font-display" aria-hidden>{big}</span>}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[10px] uppercase tracking-[.18em] text-vellum2">
          next{title && <> · <Ruby text={title} lang={lang} className="normal-case tracking-normal text-vellum2" /></>}{charged && <span className="ml-1 font-semibold text-blood">· charged</span>}
        </span>
        <span className="block text-base font-semibold leading-tight" style={{ color: c }}>{label}</span>
        <span className="block text-xs text-vellum2">{sub}{note && <span className="text-vellum2/80"> · {note}</span>}</span>
      </span>
    </div>
  );
}
