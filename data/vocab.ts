import type { LangId } from "@/lib/lang";

export type Theme = "nature" | "weather" | "animals" | "body" | "food" | "emotions" | "time" | "places" | "actions" | "light" | "numbers" | "objects";
export const THEMES: Theme[] = ["nature", "weather", "animals", "body", "food", "emotions", "time", "places", "actions", "light", "numbers", "objects"];

/**
 * One lexicon entry. `text` is what the player must say; `reading` is a
 * romanization shown under it when the script needs one (pinyin for Chinese).
 */
export type Vocab = {
  id: string;
  lang: LangId;
  text: string;
  reading?: string;
  en: string;
  level: 1 | 2 | 3;
  theme: Theme;
  focus?: string;
};

export const makeVocab = (lang: LangId, theme: Theme, level: 1 | 2 | 3, text: string, en: string, reading?: string, focus?: string): Vocab =>
  ({ id: `${lang}:${theme}:${text.trim()}`, lang, theme, level, text: text.trim(), en, reading, focus });

