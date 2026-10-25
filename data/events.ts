/**
 * Map events. UI copy (`body`, `detail`) is English; in-world titles and option
 * labels are bilingual (`title`/`titleZh`, `label`/`zh`). A `trial` option is a
 * pronunciation check: the UI draws a phrase at `level`, captures speech and calls
 * `resolveEvent(run, idx, score)`; `success` applies at `score ≥ threshold`.
 * Negative `ink` effects are prices: `eventOptionAvailable` refuses them when the run is short.
 */
export type EventEffect =
  | { kind: "heal"; pct: number } | { kind: "damage"; amount: number } | { kind: "ink"; amount: number }
  | { kind: "maxhp"; amount: number } | { kind: "relic" } | { kind: "card"; tier?: 1 | 2 | 3 } | { kind: "remove" }
  | { kind: "upgrade" } | { kind: "breath"; amount: number } | { kind: "purgeGrudges" } | { kind: "leave" };

export type EventOption = {
  label: string; zh: string; detail: string;
  trial?: { level: 1 | 2 | 3; threshold: number; success: EventEffect[]; failure: EventEffect[] };
  effects?: EventEffect[];
};

export type EventDef = { id: string; title: string; titleZh: string; body: string; options: EventOption[] };

export const events: EventDef[] = [
  {
    id: "pozo", title: "El pozo de los ecos", titleZh: "回声井",
    body: "A dry well. Whatever is spoken into it comes back twice, and coins glint far below. The echo only returns what was said cleanly.",
    options: [
      { label: "Hablar al pozo", zh: "对井说话", detail: "Trial: say a phrase well (75%+). Success: +45 ink. Failure: the echo bites for 8.", trial: { level: 2, threshold: 0.75, success: [{ kind: "ink", amount: 45 }], failure: [{ kind: "damage", amount: 8 }] } },
      { label: "Seguir", zh: "继续走", detail: "Leave the well alone.", effects: [{ kind: "leave" }] },
    ],
  },
  {
    id: "vendedora", title: "La vendedora ciega", titleZh: "盲眼商人",
    body: "She sells by touch and by sound. 'Ink speaks louder than eyes,' she says, holding out a bundle wrapped in cloth.",
    options: [
      { label: "Comprar un pergamino", zh: "买一卷卷轴", detail: "Pay 25 ink for a random tier-2 spell.", effects: [{ kind: "ink", amount: -25 }, { kind: "card", tier: 2 }] },
      { label: "Comprar la caja", zh: "买那只盒子", detail: "Pay 60 ink for a random relic.", effects: [{ kind: "ink", amount: -60 }, { kind: "relic" }] },
      { label: "Rechazar", zh: "拒绝", detail: "Keep your ink.", effects: [{ kind: "leave" }] },
    ],
  },
  {
    id: "altar", title: "El altar olvidado", titleZh: "被遗忘的祭坛",
    body: "A cracked altar hums when you approach. Something old still listens here, and it trades in blood and memory.",
    options: [
      { label: "Ofrecer sangre", zh: "献上鲜血", detail: "Lose 8 max life. Upgrade a card of your choice.", effects: [{ kind: "maxhp", amount: -8 }, { kind: "upgrade" }] },
      { label: "Rezar", zh: "祈祷", detail: "Heal 25% of your life.", effects: [{ kind: "heal", pct: 0.25 }] },
      { label: "Pasar de largo", zh: "绕过去", detail: "Leave it be.", effects: [{ kind: "leave" }] },
    ],
  },
  {
    id: "espejo", title: "El espejo de tinta", titleZh: "墨之镜",
    body: "A still pool of black ink shows the words that have beaten you, swimming like fish. If you can say one perfectly, it lets them go.",
    options: [
      { label: "Pronunciar al espejo", zh: "对着镜子念", detail: "Trial: a sentence at 80%+. Success: every grudge is forgiven, +5 max life. Failure: the ink burns for 10.", trial: { level: 3, threshold: 0.8, success: [{ kind: "purgeGrudges" }, { kind: "maxhp", amount: 5 }], failure: [{ kind: "damage", amount: 10 }] } },
      { label: "Beber la tinta", zh: "喝下墨水", detail: "+30 ink, lose 6 life.", effects: [{ kind: "ink", amount: 30 }, { kind: "damage", amount: 6 }] },
      { label: "Apartar la mirada", zh: "转开目光", detail: "Leave.", effects: [{ kind: "leave" }] },
    ],
  },
  {
    id: "biblioteca", title: "La biblioteca en llamas", titleZh: "燃烧的图书馆",
    body: "Shelves of grimoires, already alight. There is time to grab one book, if you do not mind the heat.",
    options: [
      { label: "Entrar en el fuego", zh: "冲进火里", detail: "Take 10 damage. Gain a random spell of this floor's tier.", effects: [{ kind: "damage", amount: 10 }, { kind: "card" }] },
      { label: "Rescatar un libro pequeño", zh: "救出一本小书", detail: "Gain a random tier-1 spell, safely.", effects: [{ kind: "card", tier: 1 }] },
      { label: "Mirar cómo arde", zh: "看它燃烧", detail: "+15 ink from the melted bindings.", effects: [{ kind: "ink", amount: 15 }] },
    ],
  },
  {
    id: "ermitano", title: "El ermitaño", titleZh: "隐士",
    body: "An old mage who has stopped speaking entirely. He offers to take a word out of your book, or to teach you how to breathe before you cast.",
    options: [
      { label: "Olvidar una palabra", zh: "忘掉一个词", detail: "Remove a card from your deck.", effects: [{ kind: "remove" }] },
      { label: "Aprender a respirar", zh: "学习呼吸", detail: "Trial: a phrase at 90%+. Success: +1 max breath. Failure: nothing but his silence.", trial: { level: 2, threshold: 0.9, success: [{ kind: "breath", amount: 1 }], failure: [] } },
      { label: "Dejarlo en paz", zh: "让他独处", detail: "Leave.", effects: [{ kind: "leave" }] },
    ],
  },
  {
    id: "fuente", title: "La fuente clara", titleZh: "清泉",
    body: "Clear water in a stone basin. A sign in a dozen tongues says: speak your thanks before you drink.",
    options: [
      { label: "Dar las gracias y beber", zh: "道谢后饮水", detail: "Trial: a word at 70%+. Success: heal 40% and +6 max life. Failure: heal 15%.", trial: { level: 1, threshold: 0.7, success: [{ kind: "heal", pct: 0.4 }, { kind: "maxhp", amount: 6 }], failure: [{ kind: "heal", pct: 0.15 }] } },
      { label: "Beber en silencio", zh: "默默喝水", detail: "Heal 20%.", effects: [{ kind: "heal", pct: 0.2 }] },
      { label: "Llenar el tintero", zh: "装满墨水瓶", detail: "+20 ink. The water is good for ink, too.", effects: [{ kind: "ink", amount: 20 }] },
    ],
  },
  {
    id: "mensajero", title: "El cuervo mensajero", titleZh: "信使乌鸦",
    body: "A crow lands with a sealed letter and waits. The seal is your own. You do not remember writing it.",
    options: [
      { label: "Abrir la carta", zh: "打开信", detail: "Inside, a spell you once knew: gain a random tier-2 spell.", effects: [{ kind: "card", tier: 2 }] },
      { label: "Vender el sello", zh: "卖掉印章", detail: "+35 ink.", effects: [{ kind: "ink", amount: 35 }] },
      { label: "Quemarla sin leer", zh: "不看就烧掉", detail: "Trial: a sentence at 80%+. Success: a relic falls from the ashes. Failure: the smoke chokes you for 8.", trial: { level: 3, threshold: 0.8, success: [{ kind: "relic" }], failure: [{ kind: "damage", amount: 8 }] } },
    ],
  },
];

export const eventById = (id: string) => events.find((e) => e.id === id)!;
export const eventTitle = (e: EventDef, lang: string) => (lang === "zh" ? e.titleZh : e.title);
