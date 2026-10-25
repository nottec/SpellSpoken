/** Everything that differs between target languages lives here. */
import { ELEMENT_LABEL, spells, type Element } from "@/data/spells";
import { enemies, type Intent } from "@/data/enemies";
import { relics } from "@/data/relics";
import { events } from "@/data/events";
import type { NodeKind } from "./map";

export type LangId = "es" | "zh";

export type LangConfig = {
  id: LangId;
  label: string;          // shown on the picker, in the language itself
  english: string;        // how prompts refer to it
  speech: string;         // BCP-47 for recognition and TTS
  tokens: "word" | "char"; // how similarity is measured
  hasReading: boolean;    // show a romanization under the text (pinyin)
  italic: boolean;        // italic display type looks wrong on CJK
  levelDesc: string;      // used when Gemini generates vocabulary
  coachHint: string;      // what the pronunciation coach should attend to
  readingName?: string;
};

export const LANGS: Record<LangId, LangConfig> = {
  es: {
    id: "es", label: "Español", english: "Spanish", speech: "es-ES", tokens: "word", hasReading: false, italic: true,
    levelDesc: "7 single words (level 1), 4 short phrases of 2-4 words (level 2), 4 complete simple sentences of 5-9 words (level 3). Everyday Castilian Spanish, A1-A2 level, no proper nouns.",
    coachHint: "pure short vowels, tapped vs rolled r, soft b/v, silent h, ll/y, syllable stress",
  },
  zh: {
    id: "zh", label: "中文", english: "Mandarin Chinese", speech: "zh-CN", tokens: "char", hasReading: true, italic: false, readingName: "pinyin",
    levelDesc: "7 single words of 1-2 characters (level 1), 4 short phrases of 3-4 characters (level 2), 4 complete simple sentences of 5-9 characters (level 3). Simplified characters, everyday Mandarin, HSK 1-2 level, no proper nouns. Include pinyin with tone marks in the reading field.",
    coachHint: "the four tones and the neutral tone, retroflex zh/ch/sh vs z/c/s, the ü vowel, aspirated p/t/k, tone sandhi on 不 and 一",
  },
};

export const DEFAULT_LANG: LangId = "es";
const KEY = "incantation.lang";
export function loadLang(): LangId { try { const v = localStorage.getItem(KEY); return v === "zh" || v === "es" ? v : DEFAULT_LANG; } catch { return DEFAULT_LANG; } }
export function saveLang(l: LangId) { try { localStorage.setItem(KEY, l); } catch {} }

/* ---------- in-world names (every data record carries `name` (es) and `zh`) ---------- */

/** The localized in-world name of any record with `name` (Spanish) and `zh`. */
export const localName = (x: { name: string; zh: string }, lang: LangId) => (lang === "zh" ? x.zh : x.name);

export const ELEMENT_LABELS: Record<LangId, Record<Element, string>> = {
  es: ELEMENT_LABEL,
  zh: { fire: "火", water: "水", wind: "风", shadow: "影", light: "光" },
};
export const elementLabel = (el: Element, lang: LangId) => ELEMENT_LABELS[lang][el];

/** Map node kinds: in-world labels (`name` es / `zh`) plus the English UI word. */
export const NODE_LABEL: Record<NodeKind, { name: string; zh: string; en: string }> = {
  fight:    { name: "Combate",    zh: "战斗", en: "Fight" },
  elite:    { name: "Élite",      zh: "精英", en: "Elite" },
  rest:     { name: "Descansar",  zh: "休息", en: "Rest" },
  event:    { name: "Suceso",     zh: "奇遇", en: "Event" },
  merchant: { name: "Mercader",   zh: "商人", en: "Merchant" },
  boss:     { name: "Jefe",       zh: "首领", en: "Boss" },
  final:    { name: "El final",   zh: "终局", en: "Final" },
};
export const nodeLabel = (kind: NodeKind, lang: LangId) => localName(NODE_LABEL[kind], lang);
export const REST_LABEL = NODE_LABEL.rest;

/** Enemy intents as in-world words (the IntentBadge shows them small under the English line). */
export const INTENT_NAMES: Record<Intent, { name: string; zh: string }> = {
  attack:  { name: "Golpe",       zh: "攻击" },
  double:  { name: "Doble golpe", zh: "连击" },
  charge:  { name: "Carga",       zh: "蓄力" },
  curse:   { name: "Maldición",   zh: "诅咒" },
  silence: { name: "Silencio",    zh: "沉默" },
  heal:    { name: "Curación",    zh: "治疗" },
  block:   { name: "Bloqueo",     zh: "格挡" },
};
export const intentName = (i: Intent, lang: LangId) => localName(INTENT_NAMES[i], lang);

/* ---------- log localisation ---------- */

type NameDict = { re: RegExp; map: Map<string, string> };
let nameDict: NameDict | null = null;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every Spanish in-world name the engine can put in a log line → its Chinese, longest first. Built once. */
function buildNameDict(): NameDict {
  const map = new Map<string, string>();
  const add = (es: string, zh: string) => { if (es && zh && es !== zh && !map.has(es)) map.set(es, zh); };
  for (const s of spells) { add(`${s.name}+`, `${s.zh}+`); add(s.name, s.zh); }
  for (const e of enemies) add(e.name, e.zh);
  for (const x of relics) add(x.name, x.zh);
  for (const ev of events) { add(ev.title, ev.titleZh); for (const o of ev.options) add(o.label, o.zh); }
  for (const n of Object.values(NODE_LABEL)) add(n.name, n.zh);
  for (const el of Object.keys(ELEMENT_LABEL) as Element[]) add(ELEMENT_LABEL[el], ELEMENT_LABELS.zh[el]);
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  // whole words only (no letter or digit on either side), case-sensitive, longest alternative first so "Chispa+" beats "Chispa"
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  return { re, map };
}

/**
 * The pure engine writes `run.log` in English with Spanish in-world names whatever the language.
 * For "zh" this swaps every known spell (with its "+"), enemy, relic, event, door and element name
 * for its Chinese; for "es" the line comes back unchanged. Pair with `withPinyin` to show readings.
 */
export function localizeLine(line: string, lang: LangId): string {
  if (lang !== "zh" || !line) return line;
  const d = nameDict ?? (nameDict = buildNameDict());
  return line.replace(d.re, (m) => d.map.get(m) ?? m);
}
