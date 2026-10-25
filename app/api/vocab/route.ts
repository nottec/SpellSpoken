import { NextResponse } from "next/server";
import { pinyin } from "pinyin-pro";
import { callGemini, isGeminiLive, type GeminiWhy } from "@/lib/gemini";
import { THEMES, makeVocab, type Theme, type Vocab } from "@/data/vocab";
import { LANGS, type LangId } from "@/lib/lang";
import { normalize } from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow Gemini retries to finish (hobby default is 10s)

const WANT = 15;
const MAX_TEXT = 40;
const CJK = /[㐀-䶿一-鿿豈-﫿]/;
const LATIN_LETTER = /[A-Za-z]/;
const LATIN_ONLY = /^[\p{Script=Latin}\p{P}\s]+$/u;

type RawEntry = { text?: unknown; reading?: unknown; en?: unknown; level?: unknown; focus?: unknown };
type Reply = { entries: Vocab[]; mode: "gemini" | "template"; why?: GeminiWhy };

/**
 * Grows the lexicon: Gemini (lite model first) writes new entries for a theme. Entries are
 * validated here so a hallucinated or malformed one never reaches the draw pool.
 *
 * POST { theme, exclude: string[], lang }  →  { entries: Vocab[], mode: "gemini" | "template", why? }
 * 400 for an unknown theme or language.
 */
export async function POST(req: Request) {
  let body: { theme?: Theme; exclude?: unknown; lang?: LangId };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const { theme } = body;
  const lang = body.lang ?? "es";
  if (!theme || !THEMES.includes(theme) || !LANGS[lang]) return NextResponse.json({ error: "bad theme or lang" }, { status: 400 });
  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((x): x is string => typeof x === "string") : [];
  const L = LANGS[lang];
  if (!isGeminiLive()) return NextResponse.json<Reply>({ entries: [], mode: "template", why: "nokey" });

  const prompt = `Write ${WANT} ${L.english} vocabulary entries for a learner, theme "${theme}": ${L.levelDesc}
Do NOT use any of these: ${exclude.slice(0, 200).join(", ") || "(nothing excluded)"}.
Return ONLY a JSON array of objects: {"text": string, "reading": string, "en": string, "level": 1|2|3, "focus": string}. "text" is in ${L.english}${L.hasReading ? " (Chinese characters only, no pinyin or Latin letters in it)" : " (Latin letters only)"}; "reading" is ${L.hasReading ? `${L.readingName} with tone marks` : "an empty string"}; "en" is the English meaning; "focus" is the one pronunciation point to watch (${L.coachHint}), max 6 words.`;

  const r = await callGemini([{ parts: [{ text: prompt }] }], { temperature: 0.9, maxOutputTokens: 1600, responseMimeType: "application/json" }, { prefer: "lite" });
  if (!r.text) return NextResponse.json<Reply>({ entries: [], mode: "template", why: r.why ?? "error" });

  const entries = validate(parseArray(r.text), lang, theme, exclude);
  if (!entries.length) return NextResponse.json<Reply>({ entries: [], mode: "template", why: "empty" });
  return NextResponse.json<Reply>({ entries, mode: "gemini" });
}

/** Tolerates ```json fences and an object wrapper around the array. */
function parseArray(text: string): RawEntry[] {
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    const j = JSON.parse(stripped);
    if (Array.isArray(j)) return j;
    if (j && typeof j === "object") { const inner = Object.values(j).find(Array.isArray); if (inner) return inner as RawEntry[]; }
  } catch { /* fall through */ }
  return [];
}

function validate(raw: RawEntry[], lang: LangId, theme: Theme, exclude: string[]): Vocab[] {
  const mode = LANGS[lang].tokens;
  const seen = new Set(exclude.map((x) => normalize(x, mode)));
  const out: Vocab[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const text = String(e.text ?? "").replace(/\s+/g, " ").trim();
    const en = String(e.en ?? "").replace(/\s+/g, " ").trim();
    const level = Number(e.level);
    if (!text || !en || text.length > MAX_TEXT || en.length > 80 || ![1, 2, 3].includes(level)) continue;
    let reading = typeof e.reading === "string" ? e.reading.trim() : "";
    if (lang === "zh") {
      if (!CJK.test(text) || LATIN_LETTER.test(text)) continue;
      if (!reading) { try { reading = pinyin(text).trim(); } catch { reading = ""; } }
      if (!reading) continue;
    } else {
      if (!LATIN_ONLY.test(text) || !/\p{L}/u.test(text)) continue;
      reading = "";
    }
    const key = normalize(text, mode);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const focus = typeof e.focus === "string" && e.focus.trim() ? e.focus.trim().slice(0, 60) : undefined;
    out.push(makeVocab(lang, theme, level as 1 | 2 | 3, text, en, lang === "zh" ? reading : undefined, focus));
    if (out.length >= WANT) break;
  }
  return out;
}
