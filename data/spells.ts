import type { Theme } from "./vocab";

export type Element = "fire" | "water" | "wind" | "shadow" | "light";
export type SpellKind = "attack" | "shield" | "heal" | "drain" | "hex" | "empower";
export type Rarity = "common" | "uncommon" | "rare";

/* Statuses live here (not in lib/engine) so data files never import the engine. */
export type StatusId = "burn" | "chill" | "stagger" | "weak" | "exposed" | "armor" | "focus" | "silence" | "strength" | "regen";
export type Status = { id: StatusId; stacks: number; turns: number };   // turns = 99 means "this battle"
export type StatusApply = { status: StatusId; stacks: number; turns: number; target: "enemy" | "self" };

/** Statuses whose `stacks` carry the meaning (an upgrade adds a stack); the rest are durations (an upgrade adds a turn). */
export const STACK_STATUSES: ReadonlySet<StatusId> = new Set<StatusId>(["burn", "stagger", "armor", "strength", "regen"]);
export const STATUS_LABEL: Record<StatusId, string> = { burn: "Burn", chill: "Chill", stagger: "Stagger", weak: "Weak", exposed: "Exposed", armor: "Armor", focus: "Focus", silence: "Silence", strength: "Strength", regen: "Regen" };
export const STATUS_DESC: Record<StatusId, string> = {
  burn: "Takes this much damage at the start of each enemy phase.",
  chill: "Cannot charge, and loses any charge.",
  stagger: "Skips its next actions, one per stack.",
  weak: "Deals 25% less damage.",
  exposed: "Takes 50% more damage.",
  armor: "Absorbs damage before life or shield; halves each enemy phase.",
  focus: "Next cast scores +0.10. Consumed on cast.",
  silence: "Cannot cast tier-3 spells.",
  strength: "Adds this much power to every attack and drain this battle.",
  regen: "Heals this much at the end of each enemy phase.",
};

/**
 * A spell is an EFFECT. The words you must say are drawn fresh from the lexicon
 * every cast (lib/engine.ts drawPhrase), filtered by the spell's tier and themes.
 * `cost` is breath (by default = tier). `desc` is English rules text generated
 * from the numbers so it never drifts; `spellDesc(spell, up)` gives the upgraded text.
 */
export type Spell = {
  id: string;
  name: string;        // Spanish spell name, flavor only
  zh: string;          // Mandarin spell name
  gloss: string;
  element: Element;
  kind: SpellKind;
  tier: 1 | 2 | 3;
  cost: number;        // breath
  power: number;       // base damage / shield / heal (0 for hex and empower)
  themes: Theme[];
  rarity: Rarity;
  desc: string;
  applies?: StatusApply[];     // statuses applied when the cast does not backfire
  drain?: number;              // drain kind: fraction of damage healed (0.25–1.0)
  gain?: { breath?: number };  // empower kind: resources gained
};

type SpellDef = Omit<Spell, "desc">;
const E = (status: StatusId, stacks: number, turns: number): StatusApply => ({ status, stacks, turns, target: "enemy" });
const S = (status: StatusId, stacks: number, turns: number): StatusApply => ({ status, stacks, turns, target: "self" });

const defs: SpellDef[] = [
  // tier 1 (cost 1 unless noted)
  { id: "chispa",      name: "Chispa", zh: "火花",        gloss: "spark",         element: "fire",   kind: "attack",  tier: 1, cost: 1, power: 12, rarity: "common",   themes: ["nature", "food", "light"],      applies: [E("burn", 2, 2)] },
  { id: "gota",        name: "Gota", zh: "水滴",          gloss: "drop",          element: "water",  kind: "attack",  tier: 1, cost: 1, power: 12, rarity: "common",   themes: ["weather", "nature", "food"],    applies: [E("chill", 1, 1)] },
  { id: "brisa",       name: "Brisa", zh: "微风",         gloss: "breeze",        element: "wind",   kind: "attack",  tier: 1, cost: 1, power: 14, rarity: "common",   themes: ["weather", "animals", "places"] },
  { id: "pinchazo",    name: "Pinchazo", zh: "刺",        gloss: "jab",           element: "shadow", kind: "drain",   tier: 1, cost: 1, power: 12, rarity: "common",   themes: ["emotions", "body", "time"],     drain: 0.25 },
  { id: "destello",    name: "Destello", zh: "闪光",      gloss: "flash",         element: "light",  kind: "attack",  tier: 1, cost: 1, power: 12, rarity: "common",   themes: ["light", "numbers", "objects"],  applies: [E("exposed", 1, 1)] },
  { id: "escudo",      name: "Escudo", zh: "盾",          gloss: "shield",        element: "light",  kind: "shield",  tier: 1, cost: 1, power: 10, rarity: "common",   themes: ["objects", "body", "places"] },
  { id: "aliento",     name: "Aliento", zh: "气息",       gloss: "breath",        element: "water",  kind: "heal",    tier: 1, cost: 1, power: 9,  rarity: "common",   themes: ["body", "time", "emotions"] },
  { id: "susurro",     name: "Susurro", zh: "低语",       gloss: "whisper",       element: "shadow", kind: "attack",  tier: 1, cost: 0, power: 6,  rarity: "common",   themes: ["emotions", "time", "body"] },
  { id: "foco",        name: "Foco", zh: "专注",          gloss: "focus",         element: "light",  kind: "empower", tier: 1, cost: 0, power: 0,  rarity: "uncommon", themes: ["light", "numbers", "objects"],  applies: [S("focus", 1, 99)] },
  { id: "ceniza",      name: "Ceniza", zh: "灰烬",        gloss: "ash",           element: "fire",   kind: "hex",     tier: 1, cost: 1, power: 0,  rarity: "uncommon", themes: ["nature", "food", "light"],      applies: [E("burn", 4, 3)] },
  { id: "niebla",      name: "Niebla", zh: "雾",          gloss: "fog",           element: "water",  kind: "hex",     tier: 1, cost: 1, power: 0,  rarity: "uncommon", themes: ["weather", "places", "time"],    applies: [E("weak", 1, 2), E("chill", 1, 2)] },
  { id: "empujon",     name: "Empujón", zh: "推",         gloss: "shove",         element: "wind",   kind: "hex",     tier: 1, cost: 2, power: 0,  rarity: "uncommon", themes: ["actions", "body", "animals"],   applies: [E("stagger", 1, 99)] },
  // tier 2 (cost 2)
  { id: "llamarada",   name: "Llamarada", zh: "烈焰",     gloss: "blaze",         element: "fire",   kind: "attack",  tier: 2, cost: 2, power: 24, rarity: "common",   themes: ["nature", "actions", "emotions"], applies: [E("burn", 3, 2)] },
  { id: "marea",       name: "Marea", zh: "潮汐",         gloss: "tide",          element: "water",  kind: "attack",  tier: 2, cost: 2, power: 24, rarity: "common",   themes: ["weather", "nature", "places"],  applies: [E("chill", 1, 2)] },
  { id: "vendaval",    name: "Vendaval", zh: "狂风",      gloss: "gale",          element: "wind",   kind: "attack",  tier: 2, cost: 2, power: 24, rarity: "common",   themes: ["weather", "actions", "animals"], applies: [E("stagger", 1, 99)] },
  { id: "garra",       name: "Garra oscura", zh: "暗爪",  gloss: "dark claw",     element: "shadow", kind: "drain",   tier: 2, cost: 2, power: 24, rarity: "common",   themes: ["animals", "emotions", "light"], drain: 0.5 },
  { id: "rayo",        name: "Rayo", zh: "雷电",          gloss: "bolt",          element: "light",  kind: "attack",  tier: 2, cost: 2, power: 24, rarity: "common",   themes: ["light", "weather", "numbers"],  applies: [E("exposed", 1, 2)] },
  { id: "muro",        name: "Muro", zh: "墙",            gloss: "wall",          element: "wind",   kind: "shield",  tier: 2, cost: 2, power: 16, rarity: "uncommon", themes: ["places", "objects", "nature"],  applies: [S("armor", 6, 99)] },
  { id: "sangria",     name: "Sangría", zh: "吸血",       gloss: "bloodletting",  element: "shadow", kind: "drain",   tier: 2, cost: 2, power: 20, rarity: "uncommon", themes: ["body", "food", "time"],         drain: 0.5, applies: [E("weak", 1, 1)] },
  { id: "canto",       name: "Canto", zh: "歌",           gloss: "chant",         element: "light",  kind: "empower", tier: 2, cost: 2, power: 0,  rarity: "rare",     themes: ["emotions", "light", "actions"], applies: [S("strength", 3, 99)] },
  { id: "inspiracion", name: "Inspiración", zh: "灵感",   gloss: "inspiration",   element: "light",  kind: "empower", tier: 2, cost: 0, power: 0,  rarity: "rare",     themes: ["emotions", "time", "actions"],  gain: { breath: 2 } },
  // tier 3 (cost 3)
  { id: "infierno",    name: "Infierno", zh: "地狱火",    gloss: "inferno",       element: "fire",   kind: "attack",  tier: 3, cost: 3, power: 42, rarity: "rare",     themes: ["nature", "actions", "emotions"], applies: [E("burn", 5, 3)] },
  { id: "diluvio",     name: "Diluvio", zh: "洪水",       gloss: "deluge",        element: "water",  kind: "attack",  tier: 3, cost: 3, power: 42, rarity: "rare",     themes: ["weather", "nature", "places"],  applies: [E("chill", 1, 3), E("weak", 1, 2)] },
  { id: "huracan",     name: "Huracán", zh: "飓风",       gloss: "hurricane",     element: "wind",   kind: "attack",  tier: 3, cost: 3, power: 42, rarity: "rare",     themes: ["weather", "actions", "time"],   applies: [E("stagger", 2, 99)] },
  { id: "eclipse",     name: "Eclipse", zh: "日食",       gloss: "eclipse",       element: "shadow", kind: "drain",   tier: 3, cost: 3, power: 34, rarity: "rare",     themes: ["light", "emotions", "body"],    drain: 1 },
  { id: "amanecer",    name: "Amanecer", zh: "黎明",      gloss: "dawn",          element: "light",  kind: "attack",  tier: 3, cost: 3, power: 42, rarity: "rare",     themes: ["light", "time", "numbers"],     applies: [E("exposed", 1, 2), S("regen", 5, 2)] },
  { id: "fortaleza",   name: "Fortaleza", zh: "堡垒",     gloss: "fortress",      element: "light",  kind: "shield",  tier: 3, cost: 3, power: 30, rarity: "rare",     themes: ["places", "objects", "numbers"], applies: [S("armor", 10, 99)] },
  { id: "plegaria",    name: "Plegaria", zh: "祈祷",      gloss: "prayer",        element: "water",  kind: "heal",    tier: 3, cost: 3, power: 30, rarity: "rare",     themes: ["emotions", "time", "light"],    applies: [S("regen", 5, 3)] },
];

/** Upgraded cards hit 30% harder. */
export const UPGRADE_POWER = 1.3;
export const upgradedPower = (power: number) => Math.round(power * UPGRADE_POWER);

function statusText(a: StatusApply, plus: boolean): string {
  const stacks = a.stacks + (plus && STACK_STATUSES.has(a.status) ? 1 : 0);
  const turns = a.turns + (plus && !STACK_STATUSES.has(a.status) ? 1 : 0);
  const t = (n: number) => `${n} turn${n === 1 ? "" : "s"}`;
  switch (a.status) {
    case "burn": return `Burn ${stacks} for ${t(turns)}.`;
    case "chill": return `Chill for ${t(turns)}.`;
    case "stagger": return `Stagger ${stacks}.`;
    case "weak": return `Weak for ${t(turns)}.`;
    case "exposed": return `Exposed for ${t(turns)}.`;
    case "armor": return `Gain ${stacks} armor.`;
    case "focus": return "Focus: next cast +0.10 score.";
    case "silence": return `Silence for ${t(turns)}.`;
    case "strength": return `Strength ${stacks} this battle.`;
    case "regen": return `Regen ${stacks} for ${t(turns)}.`;
  }
}

/** English rules text for a spell, upgraded or not. */
export function spellDesc(s: SpellDef, up = false): string {
  const p = up ? upgradedPower(s.power) : s.power;
  const out: string[] = [];
  if (s.kind === "attack") out.push(`Deal ${p}.`);
  if (s.kind === "drain") out.push(`Deal ${p}, heal ${Math.round((s.drain ?? 0.5) * 100)}% of it.`);
  if (s.kind === "shield") out.push(`Shield ${p}.`);
  if (s.kind === "heal") out.push(`Heal ${p}.`);
  if (s.gain?.breath) out.push(`Gain ${s.gain.breath} breath.`);
  (s.applies ?? []).forEach((a, i) => out.push(statusText(a, up && i === 0)));
  return out.join(" ");
}

export const spells: Spell[] = defs.map((s) => ({ ...s, desc: spellDesc(s) }));

export const spellById = (id: string) => spells.find((s) => s.id === id)!;
export const spellName = (s: Spell, lang: string) => (lang === "zh" ? s.zh : s.name);
export const isDamageKind = (k: SpellKind) => k === "attack" || k === "drain";

/** Spanish element names, kept for compatibility; prefer `elementLabel(el, lang)` from lib/lang. */
export const ELEMENT_LABEL: Record<Element, string> = { fire: "Fuego", water: "Agua", wind: "Viento", shadow: "Sombra", light: "Luz" };
export const ELEMENT_ICON: Record<Element, string> = { fire: "🔥", water: "💧", wind: "🌪️", shadow: "🌑", light: "✨" };
export const KIND_LABEL: Record<SpellKind, string> = { attack: "attack", shield: "shield", heal: "heal", drain: "drain", hex: "hex", empower: "empower" };
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 3, uncommon: 2, rare: 1 };
