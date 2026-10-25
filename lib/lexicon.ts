"use client";

import type { Vocab } from "@/data/vocab";
import { vocabEs } from "@/data/vocab.es";
import { vocabZh } from "@/data/vocab.zh";
import type { LangId } from "./lang";

/** Base lexicon plus any entries Gemini generated for this player (localStorage). */
export const baseVocab: Record<LangId, Vocab[]> = { es: vocabEs, zh: vocabZh };

const extraKey = (lang: LangId) => `incantation.lexicon.extra.${lang}`;

export function loadExtra(lang: LangId): Vocab[] { try { return JSON.parse(localStorage.getItem(extraKey(lang)) ?? "[]"); } catch { return []; } }
export function saveExtra(lang: LangId, list: Vocab[]) { try { localStorage.setItem(extraKey(lang), JSON.stringify(list)); } catch {} }
export function fullLexicon(lang: LangId): Vocab[] {
  const base = baseVocab[lang];
  const extra = loadExtra(lang);
  const seen = new Set(base.map((v) => v.id));
  return [...base, ...extra.filter((e) => !seen.has(e.id))];
}

/**
 * Merge freshly generated entries into the stored extras. The store is capped;
 * when it overflows, the oldest entries go first, but words the player struggled
 * with (grudges) or has mastered are never dropped.
 */
export const EXTRA_CAP = 400;
export function mergeExtra(lang: LangId, fresh: Vocab[], keep: Set<string>): Vocab[] {
  const extra = loadExtra(lang);
  const ids = new Set([...baseVocab[lang], ...extra].map((e) => e.id));
  let merged = [...extra, ...fresh.filter((e) => !ids.has(e.id))];
  if (merged.length > EXTRA_CAP) {
    const protectedOnes = merged.filter((e) => keep.has(e.id));
    const rest = merged.filter((e) => !keep.has(e.id));
    merged = [...rest.slice(rest.length - (EXTRA_CAP - protectedOnes.length)), ...protectedOnes];
  }
  saveExtra(lang, merged);
  return fullLexicon(lang);
}

/* word mastery, across runs */
export type WordStats = Record<string, { casts: number; sum: number }>;
const wordsKey = (lang: LangId) => `incantation.words.${lang}`;
export function loadWords(lang: LangId): WordStats { try { return JSON.parse(localStorage.getItem(wordsKey(lang)) ?? "{}"); } catch { return {}; } }
export function saveWords(lang: LangId, w: WordStats) { try { localStorage.setItem(wordsKey(lang), JSON.stringify(w)); } catch {} }
export function isWordMastered(w: WordStats, id: string) { const x = w[id]; return !!x && x.casts >= 3 && x.sum / x.casts >= 0.85; }
export function wordAvg(w: WordStats, id: string) { const x = w[id]; return x && x.casts ? x.sum / x.casts : 0; }
