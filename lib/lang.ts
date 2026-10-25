/** Everything that differs between target languages lives here. */
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
