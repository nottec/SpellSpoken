/**
 * Plain literal unions and colour constants for the fx library.
 * Declared locally on purpose: components/fx must not import from lib/engine.ts or data/*.
 * Keep these in sync with docs/DESIGN.md (§2 statuses, §3 cards, §4 map, §5 enemies).
 */

export type Element = "fire" | "water" | "wind" | "shadow" | "light";
export type SpellKind = "attack" | "shield" | "heal" | "drain" | "hex" | "empower";
export type EnemyKind = "minion" | "elite" | "boss" | "final";
export type NodeKind = "fight" | "elite" | "rest" | "event" | "merchant" | "boss" | "final";
export type StatusId = "burn" | "chill" | "stagger" | "weak" | "exposed" | "armor" | "focus" | "silence" | "strength" | "regen";
/** Mirrors lib/lang.ts LangId / data/enemies.ts Intent (declared here so fx stays free of lib/engine and data/*). */
export type LangId = "es" | "zh";
export type IntentId = "attack" | "double" | "charge" | "curse" | "silence" | "heal" | "block";
export type ReactionId = "wildfire" | "steam" | "storm" | "eclipse" | "dusk";

/** BCP-47 tags and the "italic display type looks wrong on CJK" rule, mirroring LANGS. */
export const LANG_TAG: Record<LangId, string> = { es: "es-ES", zh: "zh-CN" };
export const LANG_ITALIC: Record<LangId, boolean> = { es: true, zh: false };

/** Mirrors tailwind.config.ts so SVG fills and inline styles can use the same palette. */
export const ELEMENT_HEX: Record<Element, string> = {
  fire: "#e98a4f",
  water: "#7fb6d6",
  wind: "#a8c686",
  shadow: "#b19ad9",
  light: "#e9d27c",
};

export const ELEMENT_LABEL: Record<Element, string> = { fire: "fire", water: "water", wind: "wind", shadow: "shadow", light: "light" };

export const PALETTE = {
  ink: "#140f1e",
  dusk: "#241b36",
  dusk2: "#2f2547",
  vellum: "#ece2cd",
  vellum2: "#b9ad99",
  ember: "#f0a35e",
  moss: "#8fb98a",
  blood: "#c8494c",
} as const;

/** "#rrggbb" + alpha → "rgba(r,g,b,a)". Tolerates 3-digit hex. */
export function rgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Tiny deterministic PRNG (mulberry32) so bursts and jitter are stable per trigger. */
export function seeded(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
