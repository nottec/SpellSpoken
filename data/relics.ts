export type Relic = {
  id: string;
  name: string;           // Spanish
  zh: string;             // Mandarin
  gloss: string;
  emoji: string;
  desc: string;           // English rules text
  // effects (all optional, summed across relics by the engine)
  scoreBonus?: number;    // added to pronunciation score (0..1)
  maxHp?: number;         // added to max HP when taken
  block?: number;         // damage blocked per enemy hit, before armor and shield
  critBonus?: number;     // added crit chance
  echo?: boolean;         // first attack each battle echoes for 50%
  lifesteal?: number;     // fraction of damage healed
  breath?: number;        // +max breath
  handSize?: number;      // +cards drawn each turn
  redraws?: number;       // +free phrase redraws per turn
  burnBonus?: number;     // +burn stacks on every burn applied
  chainBonus?: number;    // +mult per chain step (on top of 0.15)
  thorns?: number;        // damage back to the enemy when it hits you
  startArmor?: number;    // armor at battle start
  inkBonus?: number;      // fraction added to ink drops
  resonanceAt?: number;   // resonance threshold (2 instead of 3); the engine takes the minimum
  turnFocus?: boolean;    // focus at the start of every turn
  perfectBreath?: boolean;// score ≥ 0.95 refunds 1 breath, once per turn
  // keyword hooks (card depth, docs/DESIGN.md §13)
  exhaustBreath?: boolean;// exhausting a card gives 1 breath
  drawBonus?: number;     // every card draw draws this many more
  retainOne?: boolean;    // at end of turn the costliest unplayed card is kept
  firstDiscount?: boolean;// the first card each turn costs 1 less (a standing Tailwind)
  castStrength?: number;  // every Nth cast in a battle gives 1 Strength
};

export const relics: Relic[] = [
  { id: "lengua",   name: "Lengua de plata",  zh: "银舌",   gloss: "silver tongue",  emoji: "👅", desc: "+8% to every pronunciation score.", scoreBonus: 0.08 },
  { id: "corazon",  name: "Corazón de roble", zh: "橡木心", gloss: "oak heart",      emoji: "🪵", desc: "+25 max life.", maxHp: 25 },
  { id: "escudo",   name: "Escudo de sal",    zh: "盐盾",   gloss: "salt shield",    emoji: "🛡️", desc: "Block 4 damage from every enemy hit.", block: 4 },
  { id: "eco",      name: "Eco",              zh: "回声",   gloss: "echo",           emoji: "🔁", desc: "Your first attack each battle echoes for 50% damage.", echo: true },
  { id: "dado",     name: "Dado cargado",     zh: "灌铅骰", gloss: "loaded die",     emoji: "🎲", desc: "+20% crit chance.", critBonus: 0.2 },
  { id: "sangre",   name: "Sangre de hiedra", zh: "常春藤血", gloss: "ivy blood",    emoji: "🌿", desc: "Heal 20% of damage dealt.", lifesteal: 0.2 },
  { id: "fuelle",   name: "Fuelle de cuero",  zh: "皮风箱", gloss: "leather bellows", emoji: "🫁", desc: "+1 max breath.", breath: 1 },
  { id: "manga",    name: "Manga ancha",      zh: "宽袖",   gloss: "wide sleeve",    emoji: "🧥", desc: "Draw 1 more card each turn.", handSize: 1 },
  { id: "pluma",    name: "Pluma de cuervo",  zh: "乌鸦羽", gloss: "crow feather",   emoji: "🪶", desc: "+1 free redraw of the incantation each turn.", redraws: 1 },
  { id: "brasa",    name: "Brasa eterna",     zh: "永恒余烬", gloss: "eternal ember", emoji: "🔥", desc: "Every burn you apply gets +1 stack.", burnBonus: 1 },
  { id: "rosario",  name: "Rosario de cuentas", zh: "念珠", gloss: "prayer beads",   emoji: "📿", desc: "Element chains give +20% per step instead of +15%.", chainBonus: 0.05 },
  { id: "espinas",  name: "Corona de espinas", zh: "荆棘冠", gloss: "crown of thorns", emoji: "🌵", desc: "Enemies take 5 damage whenever they hit you.", thorns: 5 },
  { id: "coraza",   name: "Coraza de hierro", zh: "铁甲",   gloss: "iron cuirass",   emoji: "⛓️", desc: "Start every battle with 8 armor.", startArmor: 8 },
  { id: "bolsa",    name: "Bolsa de tinta",   zh: "墨袋",   gloss: "ink pouch",      emoji: "👝", desc: "+30% ink from every battle.", inkBonus: 0.3 },
  { id: "diapason", name: "Diapasón",         zh: "音叉",   gloss: "tuning fork",    emoji: "🎵", desc: "Resonance charges after 2 good casts instead of 3.", resonanceAt: 2 },
  { id: "vela",     name: "Vela de sebo",     zh: "油蜡烛", gloss: "tallow candle",  emoji: "🕯️", desc: "Start every turn with Focus (+0.10 to your next score).", turnFocus: true },
  { id: "reloj",    name: "Reloj de arena",   zh: "沙漏",   gloss: "hourglass",      emoji: "⏳", desc: "Once per turn, a cast scoring 95%+ refunds its breath by 1.", perfectBreath: true },
  // keyword relics
  { id: "paginas",  name: "Páginas de ceniza", zh: "灰页",  gloss: "ash pages",      emoji: "📜", desc: "Whenever you Exhaust a card, gain 1 breath.", exhaustBreath: true },
  { id: "abanico",  name: "Abanico de seda",  zh: "丝扇",   gloss: "silk fan",       emoji: "🪭", desc: "Whenever a card draws, draw 1 more.", drawBonus: 1 },
  { id: "marcapaginas", name: "Marcapáginas", zh: "书签",   gloss: "bookmark",       emoji: "🔖", desc: "At the end of your turn, keep your costliest unplayed card.", retainOne: true },
  { id: "veleta",   name: "Veleta",           zh: "风向标", gloss: "weathervane",    emoji: "🧭", desc: "Your first card each turn costs 1 less.", firstDiscount: true },
  { id: "metronomo", name: "Metrónomo",       zh: "节拍器", gloss: "metronome",      emoji: "🎼", desc: "Every 4th cast in a battle gives 1 Strength.", castStrength: 4 },
];

export const relicById = (id: string) => relics.find((x) => x.id === id)!;
export const relicName = (x: Relic, lang: string) => (lang === "zh" ? x.zh : x.name);
