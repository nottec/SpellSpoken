import { NextResponse } from "next/server";
import { callGemini, isGeminiLive } from "@/lib/gemini";
import { THEMES, makeVocab, type Theme, type Vocab } from "@/data/vocab";
import { LANGS, type LangId } from "@/lib/lang";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow Gemini retries to finish (hobby default is 10s)

/** Grows the lexicon: Gemini writes new entries for a theme. Returns [] without a key. */
export async function POST(req: Request) {
  const { theme, exclude, lang = "es" } = (await req.json()) as { theme: Theme; exclude: string[]; lang?: LangId };
  if (!THEMES.includes(theme) || !LANGS[lang]) return NextResponse.json({ error: "bad theme or lang" }, { status: 400 });
  const L = LANGS[lang];
  if (!isGeminiLive()) return NextResponse.json({ entries: [], mode: "template" });

  const prompt = `Write 15 ${L.english} vocabulary entries for a learner, theme "${theme}": ${L.levelDesc}
Do NOT use any of these: ${exclude.slice(0, 200).join(", ")}.
Return ONLY a JSON array of objects: {"text": string, "reading": string, "en": string, "level": 1|2|3, "focus": string}. "text" is in ${L.english}; "reading" is ${L.hasReading ? L.readingName + " with tone marks" : "an empty string"}; "focus" is the one pronunciation point to watch (${L.coachHint}), max 6 words.`;

  const raw = await callGemini([{ parts: [{ text: prompt }] }], { temperature: 0.9, maxOutputTokens: 1200, responseMimeType: "application/json" });
  if (!raw) return NextResponse.json({ entries: [], mode: "template" });
  try {
    const arr = JSON.parse(raw) as { text: string; reading?: string; en: string; level: number; focus?: string }[];
    const entries: Vocab[] = arr
      .filter((e) => e.text && e.en && [1, 2, 3].includes(e.level))
      .map((e) => makeVocab(lang, theme, e.level as 1 | 2 | 3, e.text, e.en.trim(), L.hasReading ? e.reading?.trim() : undefined, e.focus));
    return NextResponse.json({ entries, mode: "gemini" });
  } catch {
    return NextResponse.json({ entries: [], mode: "template" });
  }
}
