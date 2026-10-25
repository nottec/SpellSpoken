/** Pronunciation scoring from a speech-recognition transcript. Pure functions, no DOM. */
import { pinyin } from "pinyin-pro";

/** Mandarin: syllables with tone numbers, e.g. 石头 → ["shi2","tou0"]. Handles 不/一 sandhi and polyphones by context. */
export function syllables(zh: string): string[] {
  return pinyin(zh, { toneType: "num", type: "array", nonZh: "removed" }).filter((x) => /^[a-zü]+\d$/.test(x));
}

/** Edit distance over syllables: same syllable, wrong tone costs 0.35; different syllable costs 1. */
function syllableDistance(a: string[], b: string[]) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const sa = a[i - 1], sb = b[j - 1];
      const sub = sa === sb ? 0 : sa.slice(0, -1) === sb.slice(0, -1) ? 0.35 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
    }
    prev = cur;
  }
  return prev[n];
}

export type TokenMode = "word" | "char";

const ZH_DIGITS: Record<string, string> = { "0": "零", "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "七", "8": "八", "9": "九", "10": "十", "100": "一百", "1000": "一千" };

export function normalize(s: string, mode: TokenMode = "word") {
  if (mode === "char") {
    // Recognizers often return digits for spoken numbers; map them back to characters.
    const withDigits = s.replace(/\d+/g, (d) => ZH_DIGITS[d] ?? d);
    return withDigits.replace(/[\s，。！？、：；“”‘’"',.!?:;…·\-]/g, "").trim();
  }
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[¡!¿?.,;:'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** 0..1 similarity between what was said and the target phrase. */
export function similarity(said: string, target: string, mode: TokenMode = "word") {
  const a = normalize(said, mode), b = normalize(target, mode);
  if (!a) return 0;
  if (a === b) return 1;
  const charSim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  if (mode === "char") {
    // Compare what was heard to the target as pinyin syllables, so homophones
    // (十/石, both shí) count as correct and a wrong tone costs half a syllable.
    const sa = syllables(a), sb = syllables(b);
    if (!sa.length || !sb.length) return Math.max(0, charSim);
    const n = sb.length;
    // An isolated syllable gives the recognizer nothing to hear a tone with: it returns its most
    // likely character for that syllable, so 信 for 心 says more about its language model than
    // about the learner's tone. Right syllable, other tone → Bien (0.8), never a backfire; tones
    // are judged on phrases, where context makes the recognizer's character choice meaningful.
    if (n === 1 && sa.length === 1 && sa[0].slice(0, -1) === sb[0].slice(0, -1)) return sa[0] === sb[0] ? 1 : 0.8;
    const sim = 1 - syllableDistance(sa, sb) / Math.max(sa.length, sb.length);
    const exp = n <= 2 ? 1.6 : n <= 4 ? 1.3 : 1.1;   // short targets are strict, sentences forgive a little
    return Math.max(0, Math.min(1, Math.pow(Math.max(0, sim), exp)));
  }
  const tw = b.split(" "), sw = a.split(" ");
  if (tw.length === 1) {
    // Single words are strict: one wrong letter in a 5-letter word is a real mistake,
    // and a wrong opening consonant (juego/fuego) is a different word entirely.
    let s = Math.pow(Math.max(0, charSim), 1.8);
    if (a[0] !== b[0]) s -= 0.2;
    return Math.max(0, Math.min(1, s));
  }
  // word-level: each target word gets credit for its closest spoken word
  const wordSim = tw.reduce((acc, w) => acc + Math.max(...sw.map((s) => 1 - levenshtein(w, s) / Math.max(w.length, s.length))), 0) / tw.length;
  // length penalty: dropping or adding whole words costs something
  const lenPen = Math.min(1, Math.min(tw.length, sw.length) / Math.max(tw.length, sw.length));
  return Math.max(0, Math.min(1, (0.5 * charSim + 0.5 * wordSim) * (0.7 + 0.3 * lenPen)));
}

/** Typing fallback for Mandarin: accept pinyin (with or without tone numbers) when no IME is available. */
export function similarityTyped(typed: string, target: string, mode: TokenMode) {
  if (mode !== "char" || /[\u4e00-\u9fff]/.test(typed)) return similarity(typed, target, mode);
  const t = typed.toLowerCase().replace(/[^a-zü0-9]/g, "").replace(/v/g, "ü");
  if (!t) return 0;
  const hasTones = /\d/.test(t);
  const want = pinyin(normalize(target, "char"), { toneType: hasTones ? "num" : "none", type: "array", nonZh: "removed" }).join("").toLowerCase().replace(/0/g, "");
  const sim = 1 - levenshtein(t, want) / Math.max(t.length, want.length);
  return Math.max(0, Math.min(1, Math.pow(Math.max(0, sim), 1.3)));
}

/* ---------- repetition / window tolerant matching ---------- */

export type MatchDetail = {
  score: number;                           // 0..1
  matched: string;                         // the part of `said` that matched best (the whole transcript when no window won)
  leftover: "none" | "repeat" | "other";   // what surrounded the matched window
};

/** Tokens for window matching: characters of the normalized string (char mode) or words (word mode). */
function tokensOf(s: string, mode: TokenMode): string[] {
  const n = normalize(s, mode);
  if (!n) return [];
  return mode === "char" ? Array.from(n) : n.split(" ");
}
const joinTokens = (t: string[], mode: TokenMode) => (mode === "char" ? t.join("") : t.join(" "));

/** A leftover chunk still reads as the target when every block of the target's length scores at least this ("Bien"). */
const REPEAT_AT = 0.75;
/** Extra material around the matched window that is not a repetition costs this much. */
const OTHER_MATERIAL = 0.9;

/** True when `chunk` is empty or splits into whole target-length blocks that each still read as the target. */
function isRepetition(chunk: string[], k: number, target: string, mode: TokenMode) {
  if (!chunk.length) return true;
  if (chunk.length % k !== 0) return false;
  for (let i = 0; i < chunk.length; i += k) {
    if (similarity(joinTokens(chunk.slice(i, i + k), mode), target, mode) < REPEAT_AT) return false;
  }
  return true;
}

/**
 * Repetition- and window-tolerant match: the best of the plain `similarity` and the best sliding
 * window of the target's token length over the heard tokens. The recognizer often keeps the mic
 * open until a short word is said twice ("心心" for 心, "hola hola" for hola); such leftovers are
 * free when they are themselves repetitions of the target, and other surrounding material
 * ("un el gato negro" for "el gato") costs ×0.9. Windows are re-read on their own, so pinyin
 * context (tone sandhi, 了) matches how the target itself is read.
 */
export function matchDetail(said: string, target: string, mode: TokenMode = "word"): MatchDetail {
  const plain = similarity(said, target, mode);
  const heard = tokensOf(said, mode), want = tokensOf(target, mode);
  const k = want.length;
  let best: MatchDetail = { score: plain, matched: said.trim(), leftover: "none" };
  if (!k || heard.length <= k) return best;
  for (let i = 0; i + k <= heard.length; i++) {
    const windowText = joinTokens(heard.slice(i, i + k), mode);
    const s = similarity(windowText, target, mode);
    if (s <= 0) continue;
    const repeat = isRepetition(heard.slice(0, i), k, target, mode) && isRepetition(heard.slice(i + k), k, target, mode);
    const score = repeat ? s : s * OTHER_MATERIAL;
    if (score > best.score) best = { score, matched: windowText, leftover: repeat ? "repeat" : "other" };
  }
  return best;
}

/** 0..1: `matchDetail(...).score`. Use this, not `similarity`, for anything a recognizer produced. */
export function matchScore(said: string, target: string, mode: TokenMode = "word") {
  return matchDetail(said, target, mode).score;
}

/* ---------- picking among recognizer alternatives ---------- */

/** A recognizer alternative. `early` marks the interim snapshot that early-accept stopped on (lib/speech.ts). */
export type Alternative = { transcript: string; confidence: number; early?: boolean };
export type Match = {
  transcript: string;   // the chosen alternative, whole ("心心" even when only one 心 matched)
  score: number;        // 0..1 after rank and confidence factors
  confidence: number;   // the chosen alternative's recognizer confidence (0 = unknown / interim)
  rank: number;         // 0 = the recognizer's top guess (or the early snapshot)
  matched: string;      // the window of the transcript that matched (for display)
};

/**
 * Rank factor by the alternative's position in the recognizer's list. The target being only the
 * recognizer's third guess means the audio sounded more like two other things first.
 */
const RANK_FACTOR = [1, 0.88, 0.82, 0.78];
/**
 * Chrome reports confidence on final results only; interims and non-top alternatives carry 0 =
 * unknown → no factor. Spanish leans on it (the es-ES recognizer snaps anglicised words to the
 * nearest real word, so its confidence is the only evidence left); Mandarin is already judged by
 * initials and tones and its confidence runs lower on short words, so there it only trims a little.
 */
const confidenceFactor = (c: number, mode: TokenMode) =>
  c > 0 ? (mode === "char" ? 0.85 + 0.15 * Math.min(1, c) : 0.75 + 0.25 * Math.min(1, c)) : 1;

/**
 * Pick the best of several recognizer alternatives. Each is scored with `matchDetail`, then
 * multiplied by its rank factor (1 / 0.88 / 0.82 / 0.78 for the 1st / 2nd / 3rd / later guess;
 * an early-accept snapshot counts as rank 0) and, when the recognizer gave a confidence, by
 * 0.75 + 0.25 × confidence (Spanish) or 0.85 + 0.15 × confidence (Mandarin).
 *
 * Resulting bands for a perfect transcript (grade: Perfecto ≥ 0.9, Bien ≥ 0.75, backfire < 0.45):
 *   top guess, confidence ≥ 0.6 (or unknown)  → ≥ 0.90  Perfecto   (Mandarin: any confidence ≥ 0.34)
 *   top guess, confidence 0.5 / 0.3 / 0.1     → 0.875 / 0.825 / 0.775  Bien   (Mandarin: 0.925 / 0.895 / 0.865)
 *   2nd guess, confidence unknown             → 0.88   Bien (a second guess is never Perfecto); with confidence 0.8 → 0.836
 *   3rd guess                                 → ≤ 0.82 Bien (never Perfecto)
 *   4th+ guess                                → ≤ 0.78 Bien
 * The confidence factor alone never backfires a perfect transcript (minimum 0.75); it only takes
 * the shine off a word the recognizer had to guess at. The rank factor can push a lucky 3rd/4th
 * guess that only half-matched (0.55) onto the backfire line (0.45 / 0.43).
 */
export function bestMatch(alternatives: Alternative[], target: string, mode: TokenMode = "word"): Match {
  let best: Match | null = null;
  let listed = 0;
  for (const alt of alternatives) {
    const rank = alt.early ? 0 : listed++;
    const d = matchDetail(alt.transcript, target, mode);
    const s = Math.min(1, d.score * RANK_FACTOR[Math.min(rank, RANK_FACTOR.length - 1)] * confidenceFactor(alt.confidence, mode));
    if (!best || s > best.score) best = { transcript: alt.transcript, score: s, confidence: alt.confidence, rank, matched: d.matched };
  }
  return best ?? { transcript: "", score: 0, confidence: 0, rank: 0, matched: "" };
}

export const BACKFIRE_BELOW = 0.45;

const GRADES: Record<string, [string, string, string, string]> = {
  es: ["Perfecto", "Bien", "Más o menos", "¡Fallo!"],
  zh: ["完美", "很好", "马马虎虎", "失败！"],
};
export function grade(score: number, lang = "es"): { label: string; color: string } {
  const g = GRADES[lang] ?? GRADES.es;
  if (score >= 0.9) return { label: g[0], color: "text-light" };
  if (score >= 0.75) return { label: g[1], color: "text-wind" };
  if (score >= BACKFIRE_BELOW) return { label: g[2], color: "text-fire" };
  return { label: g[3], color: "text-blood" };
}

/**
 * A hint based on which target words (syllables in char mode) were missed. Looks at the window
 * of the transcript that `matchDetail` matched, so a repeated word ("心心" for 心) misses nothing.
 */
export function missedWords(said: string, target: string, mode: TokenMode = "word") {
  const heardText = matchDetail(said, target, mode).matched || said;
  if (mode === "char") {
    // Read the target as one string so context readings (了 → le, 不/一 sandhi) match what
    // `syllables()` produced for the transcript; a lone character would read differently.
    const t = normalize(target, "char");
    const heard = new Set(syllables(normalize(heardText, "char")).map((x) => x.slice(0, -1)));
    const chars = [...t], syl = syllables(t);
    return chars.filter((c, i) => {
      const s = syl.length === chars.length ? syl[i] : syllables(c)[0];
      return !!s && !heard.has(s.slice(0, -1));
    });
  }
  const sw = new Set(normalize(heardText).split(" "));
  return normalize(target).split(" ").filter((w) => !sw.has(w));
}
