import type { ReactElement } from "react";
import { withPinyin } from "./Ruby";
import { PALETTE, ELEMENT_HEX, LANG_TAG, rgba, type LangId, type NodeKind } from "./types";

export type DoorCardProps = {
  kind: NodeKind;
  title: string;
  subtitle?: string;
  /** Pass LANGS[lang].italic. Defaults to true. */
  italic?: boolean;
  /** With "zh" the title renders with ruby pinyin (and is never italic). */
  lang?: LangId;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

type DoorMeta = { label: string; color: string; danger: 0 | 1 | 2; icon: ReactElement };

export const DOOR_META: Record<NodeKind, DoorMeta> = {
  fight: {
    label: "fight", color: PALETTE.ember, danger: 0,
    icon: <><path d="M8 16 19 5M6.5 14.5l3 3M5 19l2.5-2.5" /><path d="M16 16 5 5M17.5 14.5l-3 3M19 19l-2.5-2.5" /></>,
  },
  elite: {
    label: "elite", color: PALETTE.blood, danger: 1,
    icon: <><path d="M4 18h16l1-9-5 3-4-6-4 6-5-3Z" /><path d="M4 21h16" /></>,
  },
  rest: {
    label: "rest", color: PALETTE.moss, danger: 0,
    icon: <><path d="M12 2.5c2 3.5 5 5 5 9a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5.5.6 1.8 1.5 2.5 2.5 2.5 0-2.5-1-4 0-6Z" /><path d="M6 21.5 18 17M18 21.5 6 17" /></>,
  },
  event: {
    label: "event", color: ELEMENT_HEX.shadow, danger: 0,
    icon: <><path d="M8.5 9a3.5 3.5 0 1 1 5 3.2c-1.2.7-1.5 1.4-1.5 2.8" /><path d="M12 18.5v.5" /><path d="M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0Z" opacity=".35" /></>,
  },
  merchant: {
    label: "merchant", color: ELEMENT_HEX.light, danger: 0,
    icon: <><ellipse cx="12" cy="7" rx="6.5" ry="2.6" /><path d="M5.5 7v9c0 1.5 2.9 2.6 6.5 2.6s6.5-1.1 6.5-2.6V7" /><path d="M5.5 11.5c0 1.5 2.9 2.6 6.5 2.6s6.5-1.1 6.5-2.6" /></>,
  },
  boss: {
    label: "boss", color: PALETTE.blood, danger: 2,
    icon: <><path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4.3 3 5.5V19h8v-3.5c1.8-1.2 3-3 3-5.5a7 7 0 0 0-7-7Z" /><circle cx="9.5" cy="11" r="1.4" fill="currentColor" stroke="none" /><circle cx="14.5" cy="11" r="1.4" fill="currentColor" stroke="none" /><path d="M10 19v2M12 19v2M14 19v2M5.5 6.5C3.5 5 3 3 3.5 1.5M18.5 6.5c2-1.5 2.5-3.5 2-5" /></>,
  },
  final: {
    label: "the end", color: "#c9c2e3", danger: 2,
    icon: <path d="M12 12a1 1 0 0 1 1 1 2 2 0 0 1-2 2 3 3 0 0 1-3-3 4 4 0 0 1 4-4 5 5 0 0 1 5 5 6 6 0 0 1-6 6 7 7 0 0 1-7-7 8 8 0 0 1 8-8 9 9 0 0 1 9 9" />,
  },
};

/** A tall arch door for the map. Elite, boss and final glow and pulse; the rest sit quietly. */
export default function DoorCard({ kind, title, subtitle, italic = true, lang, onClick, disabled = false, className = "" }: DoorCardProps) {
  const m = DOOR_META[kind];
  const c = m.color;
  const zh = lang === "zh";
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={`${m.label}: ${title}${subtitle ? `, ${subtitle}` : ""}`}
      className={`group relative flex h-[200px] w-[140px] shrink-0 flex-col items-center overflow-hidden rounded-b-xl rounded-t-[70px] bg-dusk text-center ring-1 ring-white/10 transition duration-200 ease-out hover:-translate-y-1 hover:ring-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${className}`}
      style={{
        backgroundImage: `radial-gradient(60% 50% at 50% 30%, ${rgba(c, m.danger ? 0.34 : 0.26)}, transparent 72%), linear-gradient(180deg, rgba(236,226,205,.05), rgba(0,0,0,.28))`,
        boxShadow: m.danger ? `0 0 ${16 + 12 * m.danger}px ${rgba(c, 0.18 * m.danger)}` : undefined,
      }}
    >
      <span className="pointer-events-none absolute inset-[6px] rounded-b-lg rounded-t-[64px] border" style={{ borderColor: rgba(c, 0.35) }} aria-hidden />
      {m.danger > 0 && <span className="fx-danger pointer-events-none absolute inset-[6px] rounded-b-lg rounded-t-[64px]" style={{ boxShadow: `inset 0 0 ${22 + 10 * m.danger}px ${rgba(c, 0.32)}` }} aria-hidden />}
      <svg viewBox="0 0 24 24" width="40" height="40" className="mt-9 transition-transform duration-200 group-hover:scale-110" style={{ color: c, filter: `drop-shadow(0 0 8px ${rgba(c, 0.6)})` }} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {m.icon}
      </svg>
      <span className="mt-2 text-[10px] uppercase tracking-[.2em]" style={{ color: c }}>{m.label}</span>
      <span lang={lang ? LANG_TAG[lang] : undefined} className={`mt-auto px-3 text-balance font-display text-lg leading-tight text-vellum ${italic && !zh ? "italic" : ""} ${subtitle ? "mb-1" : "mb-5"}`}>{zh ? withPinyin(title, "zh") : title}</span>
      {subtitle && <span className="mb-4 px-3 text-[11px] leading-snug text-vellum2">{subtitle}</span>}
    </button>
  );
}
