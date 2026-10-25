export type Relic = {
  id: string;
  name: string;
  gloss: string;
  emoji: string;
  desc: string;
  // effects (all optional)
  scoreBonus?: number;    // added to pronunciation score (0..1)
  maxHp?: number;         // added to max HP
  block?: number;         // damage blocked per enemy hit
  critBonus?: number;     // added crit chance
  echo?: boolean;         // first cast each room repeats at 50%
  lifesteal?: number;     // fraction of damage healed
};

export const relics: Relic[] = [
  { id: "lengua",  name: "Lengua de plata", gloss: "silver tongue", emoji: "👅", desc: "+8% to every pronunciation score.", scoreBonus: 0.08 },
  { id: "corazon", name: "Corazón de roble", gloss: "oak heart",    emoji: "🪵", desc: "+25 max HP.", maxHp: 25 },
  { id: "escudo",  name: "Escudo de sal",   gloss: "salt shield",   emoji: "🛡️", desc: "Block 4 damage from every enemy hit.", block: 4 },
  { id: "eco",     name: "Eco",             gloss: "echo",          emoji: "🔁", desc: "Your first spell each room echoes for 50% damage.", echo: true },
  { id: "dado",    name: "Dado cargado",    gloss: "loaded die",    emoji: "🎲", desc: "+20% crit chance.", critBonus: 0.2 },
  { id: "sangre",  name: "Sangre de hiedra", gloss: "ivy blood",    emoji: "🌿", desc: "Heal 20% of damage dealt.", lifesteal: 0.2 },
];
