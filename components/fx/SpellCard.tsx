"use client";

import Sigil from "./Sigil";
import { withPinyin } from "./Ruby";
import { ELEMENT_HEX, LANG_TAG, rgba, type Element, type LangId, type SpellKind } from "./types";

export type SpellCardProps = {
  name: string;
  desc: string;
  element: Element;
  kind: SpellKind;
  tier: 1 | 2 | 3;
  cost: number;
  power?: number;
  up?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** Short preview label, e.g. "steam ↑", "×2 here", "resisted", "too weak", "silenced". */
  hint?: string;
  /** Pass LANGS[lang].italic — never italicise Chinese. Defaults to true. */
  italic?: boolean;
  /** With "zh" the name renders with ruby pinyin (and is never italic). */
  lang?: LangId;
  onClick?: () => void;
  hotkey?: string;
  className?: string;
};

const KIND_LABEL: Record<SpellKind, string> = { attack: "attack", shield: "shield", heal: "heal", drain: "drain", hex: "hex", empower: "empower" };
/** Hints that explain why a cast is worse or impossible read in blood; everything else in light. */
const BAD_HINT = /resist|too weak|silenc|not enough|no breath|can.?t|cost/i;

function CostGem({ cost }: { cost: number }) {
  return (
    <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center" title={`${cost} breath`}>
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full drop-shadow-[0_0_6px_rgba(240,163,94,.5)]" aria-hidden>
        <path d="M12 1.5 21 7v10l-9 5.5L3 17V7Z" fill="#f0a35e" />
        <path d="M12 4.2 18.4 8v8L12 19.8 5.6 16V8Z" fill="#f8c98f" opacity=".55" />
      </svg>
      <span className="relative font-display text-[13px] font-semibold leading-none text-ink">{cost}</span>
    </span>
  );
}

/** A grimoire card: vellum face on dusk, element sigil, cost gem, tier pips, rules text, hint badge. ~150 px wide. */
export default function SpellCard({ name, desc, element, kind, tier, cost, power, up = false, selected = false, disabled = false, hint, italic = true, lang, onClick, hotkey, className = "" }: SpellCardProps) {
  const el = ELEMENT_HEX[element];
  const tone = hint ? (disabled || BAD_HINT.test(hint) ? "bad" : "good") : null;
  const zh = lang === "zh";
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={`${name}, ${KIND_LABEL[kind]}, tier ${tier}, ${cost} breath${hint ? `, ${hint}` : ""}`}
      className={`fx-card group relative flex shrink-0 flex-col overflow-hidden rounded-xl border bg-dusk p-3 text-left transition duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${
        selected ? "-translate-y-2 border-ember shadow-[0_0_28px_rgba(240,163,94,.35),0_12px_24px_-12px_rgba(0,0,0,.8)]" : "hover:-translate-y-1 hover:shadow-[0_12px_24px_-14px_rgba(0,0,0,.9)]"
      } ${disabled ? "cursor-not-allowed" : ""} ${className}`}
      style={{
        borderColor: selected ? undefined : rgba(el, disabled ? 0.15 : 0.35),
        backgroundImage: `radial-gradient(70% 42% at 50% 34%, ${rgba(el, disabled ? 0.08 : 0.22)}, transparent 72%), linear-gradient(180deg, rgba(236,226,205,.08), rgba(236,226,205,.015))`,
      }}
    >
      {up && <span className="fx-sheen" aria-hidden />}
      {up && <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-light/70" aria-hidden />}

      <div className={`flex flex-1 flex-col ${disabled ? "opacity-45 saturate-50" : ""}`}>
        <div className="flex items-start justify-between">
          <CostGem cost={cost} />
          <span className="mt-1.5 flex gap-1" title={`tier ${tier}`} aria-hidden>
            {[1, 2, 3].map((t) => <span key={t} className={`h-1.5 w-1.5 rounded-full ${t <= tier ? "bg-vellum2" : "bg-white/10"}`} />)}
          </span>
        </div>

        <div className="mt-2 flex flex-col items-center">
          <Sigil element={element} size={40} className="drop-shadow-[0_0_10px_currentColor]" />
          {power !== undefined && <span className="mt-1 font-display text-xl leading-none text-vellum">{power}</span>}
        </div>

        <p lang={lang ? LANG_TAG[lang] : undefined} className={`mt-2 text-balance font-display text-[17px] leading-tight text-vellum ${italic && !zh ? "italic" : ""}`}>{zh ? withPinyin(name, "zh") : name}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[.14em] text-vellum2">{KIND_LABEL[kind]} · <span style={{ color: el }}>{element}</span></p>
        <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-vellum2">{desc}</p>
      </div>

      <div className="mt-2 flex min-h-[18px] items-end justify-between gap-2">
        {hint ? (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${tone === "bad" ? "bg-blood/20 text-blood" : "bg-light/15 text-light"}`}>{hint}</span>
        ) : <span />}
        {hotkey && <kbd className="rounded border border-white/15 px-1 font-sans text-[10px] leading-4 text-vellum2">{hotkey}</kbd>}
      </div>
    </button>
  );
}
