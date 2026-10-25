/** Pronunciation scoring from a speech-recognition transcript. Pure functions, no DOM. */
import { pinyin } from "pinyin-pro";

/** Mandarin: syllables with tone numbers, e.g. 石头 → ["shi2","tou0"]. Handles 不/一 sandhi and polyphones by context. */
export function syllables(zh: string): string[] {
  return pinyin(zh, { toneType: "num", type: "array", nonZh: "removed" }).filter((x) => /^[a-zü]+\d$/.test(x));
}

/** Edit distance over syllables: same syllable, wrong tone costs 0.5; different syllable costs 1. */
function syllableDistance(a: string[], b: string[]) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const sa = a[i - 1], sb = b[j - 1];
      const sub = sa === sb ? 0 : sa.slice(0, -1) === sb.slice(0, -1) ? 0.5 : 1;
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
    const sim = 1 - syllableDistance(sa, sb) / Math.max(sa.length, sb.length);
    const n = sb.length;
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

/** Pick the best of several recognizer alternatives. */
export function bestMatch(alternatives: { transcript: string; confidence: number }[], target: string, mode: TokenMode = "word") {
  let best = { transcript: "", score: 0, confidence: 0 };
  for (const alt of alternatives) {
    const s = similarity(alt.transcript, target, mode);
    if (s > best.score) best = { transcript: alt.transcript, score: s, confidence: alt.confidence };
  }
  // The recognizer's own confidence trims a mumbled-but-lucky match a little (max −8%).
  if (best.confidence > 0) best.score *= 0.92 + 0.08 * Math.min(1, best.confidence);
  return best;
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

/** A hint based on which target words were missed. */
export function missedWords(said: string, target: string, mode: TokenMode = "word") {
  if (mode === "char") { const sc = new Set(syllables(normalize(said, "char")).map((x) => x.slice(0, -1))); return [...normalize(target, "char")].filter((c) => !sc.has(syllables(c)[0]?.slice(0, -1))); }
  const sw = new Set(normalize(said).split(" "));
  return normalize(target).split(" ").filter((w) => !sw.has(w));
}
