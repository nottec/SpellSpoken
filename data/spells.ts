import type { Theme } from "./vocab";

export type Element = "fire" | "water" | "wind" | "shadow" | "light";
export type SpellKind = "attack" | "shield" | "heal" | "drain";

/**
 * A spell is an EFFECT. The words you must say are drawn fresh from the lexicon
 * every cast (lib/engine.ts drawPhrase), filtered by the spell's tier and themes.
 */
export type Spell = {
  id: string;
  name: string;        // Spanish spell name, flavor only
  zh: string;          // Mandarin spell name
  gloss: string;
  element: Element;
  kind: SpellKind;
  tier: 1 | 2 | 3;
  power: number;       // base damage / shield / heal
  themes: Theme[];
};

export const LANG = "es-ES";

export const spells: Spell[] = [
  // tier 1
  { id: "chispa",    name: "Chispa", zh: "火花",      gloss: "spark",        element: "fire",   kind: "attack", tier: 1, power: 15, themes: ["nature", "food", "light"] },
  { id: "gota",      name: "Gota", zh: "水滴",        gloss: "drop",         element: "water",  kind: "attack", tier: 1, power: 15, themes: ["weather", "nature", "food"] },
  { id: "brisa",     name: "Brisa", zh: "微风",       gloss: "breeze",       element: "wind",   kind: "attack", tier: 1, power: 15, themes: ["weather", "animals", "places"] },
  { id: "pinchazo",  name: "Pinchazo", zh: "刺",    gloss: "jab",          element: "shadow", kind: "attack", tier: 1, power: 15, themes: ["emotions", "body", "time"] },
  { id: "destello",  name: "Destello", zh: "闪光",    gloss: "flash",        element: "light",  kind: "attack", tier: 1, power: 15, themes: ["light", "numbers", "objects"] },
  { id: "escudo",    name: "Escudo", zh: "盾",      gloss: "shield",       element: "light",  kind: "shield", tier: 1, power: 10, themes: ["objects", "body", "places"] },
  { id: "aliento",   name: "Aliento", zh: "气息",     gloss: "breath",       element: "water",  kind: "heal",   tier: 1, power: 10, themes: ["body", "time", "emotions"] },
  // tier 2
  { id: "llamarada", name: "Llamarada", zh: "烈焰",   gloss: "blaze",        element: "fire",   kind: "attack", tier: 2, power: 26, themes: ["nature", "actions", "emotions"] },
  { id: "marea",     name: "Marea", zh: "潮汐",       gloss: "tide",         element: "water",  kind: "attack", tier: 2, power: 26, themes: ["weather", "nature", "places"] },
  { id: "vendaval",  name: "Vendaval", zh: "狂风",    gloss: "gale",         element: "wind",   kind: "attack", tier: 2, power: 26, themes: ["weather", "actions", "animals"] },
  { id: "garra",     name: "Garra oscura", zh: "暗爪", gloss: "dark claw",   element: "shadow", kind: "attack", tier: 2, power: 26, themes: ["animals", "emotions", "light"] },
  { id: "rayo",      name: "Rayo", zh: "雷电",        gloss: "bolt",         element: "light",  kind: "attack", tier: 2, power: 26, themes: ["light", "weather", "numbers"] },
  { id: "muro",      name: "Muro", zh: "墙",        gloss: "wall",         element: "wind",   kind: "shield", tier: 2, power: 18, themes: ["places", "objects", "nature"] },
  { id: "sangria",   name: "Sangría", zh: "吸血",     gloss: "bloodletting", element: "shadow", kind: "drain",  tier: 2, power: 20, themes: ["body", "food", "time"] },
  // tier 3
  { id: "infierno",  name: "Infierno", zh: "地狱火",    gloss: "inferno",      element: "fire",   kind: "attack", tier: 3, power: 40, themes: ["nature", "actions", "emotions"] },
  { id: "diluvio",   name: "Diluvio", zh: "洪水",     gloss: "deluge",       element: "water",  kind: "attack", tier: 3, power: 40, themes: ["weather", "nature", "places"] },
  { id: "huracan",   name: "Huracán", zh: "飓风",     gloss: "hurricane",    element: "wind",   kind: "attack", tier: 3, power: 40, themes: ["weather", "actions", "time"] },
  { id: "eclipse",   name: "Eclipse", zh: "日食",     gloss: "eclipse",      element: "shadow", kind: "drain",  tier: 3, power: 32, themes: ["light", "emotions", "body"] },
  { id: "amanecer",  name: "Amanecer", zh: "黎明",    gloss: "dawn",         element: "light",  kind: "attack", tier: 3, power: 40, themes: ["light", "time", "numbers"] },
];

export const spellById = (id: string) => spells.find((s) => s.id === id)!;
export const spellName = (s: Spell, lang: string) => (lang === "zh" ? s.zh : s.name);

export const ELEMENT_LABEL: Record<Element, string> = { fire: "Fuego", water: "Agua", wind: "Viento", shadow: "Sombra", light: "Luz" };
export const ELEMENT_ICON: Record<Element, string> = { fire: "🔥", water: "💧", wind: "🌪️", shadow: "🌑", light: "✨" };
export const KIND_LABEL: Record<SpellKind, string> = { attack: "attack", shield: "shield", heal: "heal", drain: "drain" };
