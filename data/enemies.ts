import type { Element } from "./spells";

export type EnemyKind = "minion" | "elite" | "boss" | "final";
export type Intent = "attack" | "charge" | "curse" | "heal";

export type EnemyDef = {
  id: string;
  name: string;
  zh: string;
  gloss: string;
  kind: EnemyKind;
  emoji: string;
  hp: number;
  attack: number;
  weak: Element;
  resist?: Element;
  minTier?: 1 | 2 | 3;
  pattern: Intent[];   // telegraphed, cycles
  taunt: string;
  tauntZh: string;
};

export const INTENT_TEXT: Record<Intent, (atk: number) => string> = {
  attack: (a) => `strikes for ${a}`,
  charge: () => "gathers power — next hit is doubled",
  curse: () => "curses you — your next incantation is one level harder",
  heal: () => "mends itself",
};

export const enemies: EnemyDef[] = [
  { id: "limo",     name: "Limo de pantano", zh: "沼泽泥怪",  gloss: "swamp slime",    kind: "minion", emoji: "🟢", hp: 36,  attack: 4,  weak: "fire",   pattern: ["attack", "attack", "heal"], taunt: "¡Qué asco! (How gross!)", tauntZh: "真恶心！(How gross!)" },
  { id: "murci",    name: "Murciélago", zh: "蝙蝠",       gloss: "bat",            kind: "minion", emoji: "🦇", hp: 32,  attack: 5,  weak: "wind",   pattern: ["attack", "charge", "attack"], taunt: "¡No me ves! (You can't see me!)", tauntZh: "你看不见我！(You can't see me!)" },
  { id: "rata",     name: "Rata gigante", zh: "巨鼠",     gloss: "giant rat",      kind: "minion", emoji: "🐀", hp: 40,  attack: 4,  weak: "light",  pattern: ["attack", "attack", "attack"], taunt: "¡Tengo hambre! (I'm hungry!)", tauntZh: "我饿了！(I'm hungry!)" },
  { id: "golem",    name: "Gólem de piedra", zh: "石巨人",  gloss: "stone golem",    kind: "elite",  emoji: "🗿", hp: 80,  attack: 7,  weak: "water",  resist: "wind",   minTier: 2, pattern: ["charge", "attack", "attack"], taunt: "Las palabras no rompen la piedra. (Words don't break stone.)", tauntZh: "话打不碎石头。(Words don't break stone.)" },
  { id: "espectro", name: "Espectro", zh: "幽灵",         gloss: "specter",        kind: "elite",  emoji: "👻", hp: 72,  attack: 8,  weak: "light",  resist: "shadow", minTier: 2, pattern: ["curse", "attack", "attack"], taunt: "Tu voz tiembla. (Your voice trembles.)", tauntZh: "你的声音在发抖。(Your voice trembles.)" },
  { id: "lobo",     name: "Lobo de ceniza", zh: "灰烬狼",   gloss: "ash wolf",       kind: "elite",  emoji: "🐺", hp: 76,  attack: 8,  weak: "water",  resist: "fire",   minTier: 2, pattern: ["attack", "attack", "charge", "attack"], taunt: "Más rápido, mago. (Faster, mage.)", tauntZh: "快一点，法师。(Faster, mage.)" },
  { id: "dragon",   name: "Dragón de ceniza", zh: "灰烬龙", gloss: "ash dragon",     kind: "boss",   emoji: "🐉", hp: 140, attack: 11, weak: "water",  resist: "fire",   minTier: 2, pattern: ["attack", "charge", "attack", "heal"], taunt: "¿Eso es todo? (Is that all?)", tauntZh: "就这样吗？(Is that all?)" },
  { id: "olvido",   name: "El Olvido", zh: "遗忘",        gloss: "the Forgetting", kind: "final",  emoji: "🌫️", hp: 200, attack: 13, weak: "light",  resist: "shadow", minTier: 3, pattern: ["curse", "attack", "charge", "attack"], taunt: "Olvidarás cada palabra. (You will forget every word.)", tauntZh: "你会忘记每一个字。(You will forget every word.)" },
];

export const enemyName = (e: EnemyDef, lang: string) => (lang === "zh" ? e.zh : e.name);
export const enemyTaunt = (e: EnemyDef, lang: string) => (lang === "zh" ? e.tauntZh : e.taunt);

export const ROOM_PLAN: EnemyKind[] = ["minion", "minion", "elite", "boss", "minion", "elite", "elite", "final"];
