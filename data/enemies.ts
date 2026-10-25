import type { Element } from "./spells";

export type EnemyKind = "minion" | "elite" | "boss" | "final";
export type Intent = "attack" | "double" | "charge" | "curse" | "silence" | "heal" | "block";

export type EnemyDef = {
  id: string;
  name: string;
  zh: string;
  gloss: string;
  kind: EnemyKind;
  emoji: string;
  hp: number;
  attack: number;      // one action per player turn (≈ every 3 casts)
  weak: Element;
  resist?: Element;
  minTier?: 1 | 2 | 3; // spells below this tier deal half
  pattern: Intent[];   // telegraphed, cycles
  taunt: string;
  tauntZh: string;
  ink: number;         // base ink drop
};

/** English (UI language). `atk` is the attack after charge; the UI passes `enemy.attack * (charged ? 2 : 1)`. */
export const INTENT_TEXT: Record<Intent, (atk: number) => string> = {
  attack: (a) => `strikes for ${a}`,
  double: (a) => `strikes twice, ${Math.round(a * 0.6)} each`,
  charge: () => "gathers power — next hit is doubled",
  curse: () => "curses you — your next incantation is one level harder",
  silence: () => "silences you — no tier-3 spells next turn",
  heal: () => "mends itself",
  block: (a) => `hardens — gains ${Math.round(a * 1.5)} armor`,
};

export const enemies: EnemyDef[] = [
  // minions
  { id: "limo",     name: "Limo de pantano", zh: "沼泽泥怪", gloss: "swamp slime",    kind: "minion", emoji: "🟢", hp: 52, attack: 15, weak: "fire",   pattern: ["attack", "attack", "heal"],                 ink: 22, taunt: "¡Qué asco! (How gross!)", tauntZh: "真恶心！(How gross!)" },
  { id: "murci",    name: "Murciélago", zh: "蝙蝠",         gloss: "bat",            kind: "minion", emoji: "🦇", hp: 46, attack: 16, weak: "wind",   pattern: ["attack", "charge", "attack"],               ink: 22, taunt: "¡No me ves! (You can't see me!)", tauntZh: "你看不见我！(You can't see me!)" },
  { id: "rata",     name: "Rata gigante", zh: "巨鼠",       gloss: "giant rat",      kind: "minion", emoji: "🐀", hp: 57, attack: 15, weak: "light",  pattern: ["attack", "double", "attack"],               ink: 22, taunt: "¡Tengo hambre! (I'm hungry!)", tauntZh: "我饿了！(I'm hungry!)" },
  { id: "arana",    name: "Araña de cripta", zh: "墓穴蜘蛛", gloss: "crypt spider",   kind: "minion", emoji: "🕷️", hp: 49, attack: 17, weak: "fire",   pattern: ["curse", "attack", "attack"],                ink: 24, taunt: "Mi tela ya te tiene. (My web already has you.)", tauntZh: "你已经在我的网里了。(My web already has you.)" },
  { id: "cuervo",   name: "Cuervo", zh: "乌鸦",             gloss: "crow",           kind: "minion", emoji: "🐦‍⬛", hp: 48, attack: 18, weak: "light",  pattern: ["double", "curse", "attack"],                ink: 24, taunt: "Mal agüero. (Bad omen.)", tauntZh: "不祥之兆。(Bad omen.)" },
  { id: "duende",   name: "Duende", zh: "小妖",             gloss: "goblin",         kind: "minion", emoji: "👺", hp: 55, attack: 17, weak: "shadow", pattern: ["attack", "block", "double"],                ink: 26, taunt: "¡Dame tu tinta! (Give me your ink!)", tauntZh: "把你的墨给我！(Give me your ink!)" },
  // elites
  { id: "golem",    name: "Gólem de piedra", zh: "石巨人",  gloss: "stone golem",    kind: "elite",  emoji: "🗿", hp: 131, attack: 26, weak: "water",  resist: "wind",   minTier: 2, pattern: ["block", "charge", "attack"],          ink: 50, taunt: "Las palabras no rompen la piedra. (Words don't break stone.)", tauntZh: "话打不碎石头。(Words don't break stone.)" },
  { id: "espectro", name: "Espectro", zh: "幽灵",           gloss: "specter",        kind: "elite",  emoji: "👻", hp: 109, attack: 27, weak: "light",  resist: "shadow", minTier: 2, pattern: ["curse", "attack", "silence", "attack"], ink: 50, taunt: "Tu voz tiembla. (Your voice trembles.)", tauntZh: "你的声音在发抖。(Your voice trembles.)" },
  { id: "lobo",     name: "Lobo de ceniza", zh: "灰烬狼",   gloss: "ash wolf",       kind: "elite",  emoji: "🐺", hp: 119, attack: 27, weak: "water",  resist: "fire",   minTier: 2, pattern: ["attack", "double", "charge", "attack"], ink: 50, taunt: "Más rápido, mago. (Faster, mage.)", tauntZh: "快一点，法师。(Faster, mage.)" },
  { id: "bruja",    name: "Bruja del eco", zh: "回声女巫",  gloss: "echo witch",     kind: "elite",  emoji: "🧙", hp: 106, attack: 24, weak: "fire",   resist: "light",  minTier: 2, pattern: ["silence", "attack", "heal", "double"],  ink: 54, taunt: "Repite conmigo… si puedes. (Repeat after me… if you can.)", tauntZh: "跟我念……如果你会的话。(Repeat after me… if you can.)" },
  // bosses (floor 3)
  { id: "dragon",   name: "Dragón de ceniza", zh: "灰烬龙", gloss: "ash dragon",     kind: "boss",   emoji: "🐉", hp: 209, attack: 29, weak: "water",  resist: "fire",   minTier: 2, pattern: ["attack", "charge", "attack", "block", "heal"], ink: 90, taunt: "¿Eso es todo? (Is that all?)", tauntZh: "就这样吗？(Is that all?)" },
  { id: "hidra",    name: "Hidra", zh: "九头蛇",            gloss: "hydra",          kind: "boss",   emoji: "🐍", hp: 195, attack: 28, weak: "fire",   resist: "water",  minTier: 2, pattern: ["double", "attack", "heal", "double", "charge", "attack"], ink: 90, taunt: "Corta una, crecen dos. (Cut one, two grow.)", tauntZh: "砍掉一个，长出两个。(Cut one, two grow.)" },
  // final (floor 7)
  { id: "olvido",   name: "El Olvido", zh: "遗忘",          gloss: "the Forgetting", kind: "final",  emoji: "🌫️", hp: 285, attack: 36, weak: "light",  resist: "shadow", minTier: 3, pattern: ["curse", "attack", "charge", "attack", "silence", "double"], ink: 0, taunt: "Olvidarás cada palabra. (You will forget every word.)", tauntZh: "你会忘记每一个字。(You will forget every word.)" },
];

export const enemyById = (id: string) => enemies.find((e) => e.id === id)!;
export const enemyName = (e: EnemyDef, lang: string) => (lang === "zh" ? e.zh : e.name);
export const enemyTaunt = (e: EnemyDef, lang: string) => (lang === "zh" ? e.tauntZh : e.taunt);
