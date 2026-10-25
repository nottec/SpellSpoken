import type { ReactElement } from "react";
import { ELEMENT_HEX, PALETTE, type StatusId } from "./types";

export type StatusBadgeProps = { id: StatusId; stacks: number; turns: number; target?: "enemy" | "self"; className?: string };

export type StatusMeta = {
  label: string;
  /** English meaning (DESIGN.md §2). {n} = stacks, {t} = turns. */
  description: string;
  color: string;
  /** Which number the badge shows large. */
  primary: "stacks" | "turns";
  /** True when the status hurts whoever carries it. */
  harmful: boolean;
  /** 16×16 stroke glyph, drawn with currentColor. */
  icon: ReactElement;
};

export const STATUS_META: Record<StatusId, StatusMeta> = {
  burn: {
    label: "Burn", color: ELEMENT_HEX.fire, primary: "stacks", harmful: true,
    description: "Takes {n} damage at the start of each enemy phase for {t} turns.",
    icon: <path d="M8 1.5c.8 3 3.5 4.4 3.5 7.8a3.5 3.5 0 0 1-7 0c0-1.8.9-3 1.8-4 .3 1.1.8 1.8 1.7 2.1 0-1.8-.7-3 0-5.9Z" />,
  },
  chill: {
    label: "Chill", color: ELEMENT_HEX.water, primary: "turns", harmful: true,
    description: "Cannot charge, and loses any charge it had, for {t} turns.",
    icon: <path d="M8 1.5v13M2.4 4.8l11.2 6.4M2.4 11.2l11.2-6.4M8 1.5 6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2" />,
  },
  stagger: {
    label: "Stagger", color: ELEMENT_HEX.wind, primary: "stacks", harmful: true,
    description: "Skips its next {n} actions.",
    icon: <path d="M8 8.3a1.5 1.5 0 0 1 1.5 1.5A3 3 0 0 1 6.5 12.8 4.6 4.6 0 0 1 1.9 8.2 6.1 6.1 0 0 1 8 2.1a6.1 6.1 0 0 1 6.1 6.1" />,
  },
  weak: {
    label: "Weak", color: ELEMENT_HEX.shadow, primary: "turns", harmful: true,
    description: "Deals 25% less damage for {t} turns.",
    icon: <path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" />,
  },
  exposed: {
    label: "Exposed", color: ELEMENT_HEX.light, primary: "turns", harmful: true,
    description: "Takes 50% more damage for {t} turns.",
    icon: <><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></>,
  },
  armor: {
    label: "Armor", color: PALETTE.vellum2, primary: "stacks", harmful: false,
    description: "Absorbs {n} damage before life is touched; halves each enemy phase.",
    icon: <path d="M8 1.5l5.5 2v4.5c0 3.2-2.4 5.6-5.5 6.5-3.1-.9-5.5-3.3-5.5-6.5V3.5Z" />,
  },
  focus: {
    label: "Focus", color: PALETTE.ember, primary: "stacks", harmful: false,
    description: "Next cast scores +0.10, then focus is spent.",
    icon: <><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" /></>,
  },
  silence: {
    label: "Silence", color: PALETTE.blood, primary: "turns", harmful: true,
    description: "Cannot cast tier-3 cards for {t} turns.",
    icon: <><path d="M3 3h10v7H8l-3 2.5V10H3Z" /><path d="M2 14 14 2" /></>,
  },
  strength: {
    label: "Strength", color: PALETTE.ember, primary: "stacks", harmful: false,
    description: "+{n} power on attacks and drains for this battle.",
    icon: <path d="M8 14V3M3.5 7.5 8 3l4.5 4.5M4 14h8" />,
  },
  regen: {
    label: "Regen", color: PALETTE.moss, primary: "stacks", harmful: false,
    description: "Heals {n} at the end of each turn for {t} turns.",
    icon: <><path d="M8 13.5S2 9.8 2 5.8A3 3 0 0 1 8 4.2a3 3 0 0 1 6 1.6c0 4-6 7.7-6 7.7Z" /><path d="M8 6v4M6 8h4" /></>,
  },
};

/** Full English tooltip for a status instance. `turns` ≥ 99 means "this battle". */
export function describeStatus(id: StatusId, stacks: number, turns: number, target: "enemy" | "self" = "enemy"): string {
  const m = STATUS_META[id];
  const who = target === "self" ? "You" : "The enemy";
  const body = m.description.replace("{n}", String(stacks)).replace("{t}", turns >= 99 ? "the rest of the battle" : `${turns} turn${turns === 1 ? "" : "s"}`);
  const sentence = body.replace(/^Takes/, `${who} take${target === "self" ? "" : "s"}`).replace(/^Cannot/, `${who} cannot`).replace(/^Skips its/, target === "self" ? "You skip your" : "It skips its").replace(/^Deals/, `${who} deal${target === "self" ? "" : "s"}`).replace(/^Heals/, `${who} heal${target === "self" ? "" : "s"}`).replace(/^Absorbs/, `${who === "You" ? "Your armor absorbs" : "Its armor absorbs"}`);
  return `${m.label} ${m.primary === "stacks" ? stacks : turns} — ${sentence}`;
}

/** Compact status pill: glyph + number, tooltip with the meaning. Export STATUS_META for lists and tooltips elsewhere. */
export default function StatusBadge({ id, stacks, turns, target = "enemy", className = "" }: StatusBadgeProps) {
  const m = STATUS_META[id];
  const primary = m.primary === "stacks" ? stacks : turns;
  const showTurns = m.primary === "stacks" && turns > 0 && turns < 99;
  const tip = describeStatus(id, stacks, turns, target);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-black/35 px-1.5 py-0.5 text-[11px] leading-none ring-1 ${target === "self" ? "ring-moss/25" : "ring-white/10"} ${className}`}
      style={{ color: m.color }} title={tip} aria-label={tip} role="img"
    >
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{m.icon}</svg>
      <span className="font-semibold tabular-nums">{primary >= 99 ? "∞" : primary}</span>
      {showTurns && <span className="text-[9px] text-vellum2 tabular-nums">{turns}t</span>}
    </span>
  );
}
