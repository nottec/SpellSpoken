import { NextResponse } from "next/server";
import { callGemini, isGeminiLive, type GeminiPart, type GeminiWhy } from "@/lib/gemini";
import { LANGS, type LangId } from "@/lib/lang";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow Gemini retries to finish (hobby default is 10s)

/** A cast clip is a few seconds of opus; anything bigger is not a cast (base64 characters). */
const MAX_B64 = 2_000_000;

type Body = { audio?: { b64?: string; mime?: string } | null; lang?: LangId };
type Reply = { transcript: string; mode: "gemini" | "none"; why?: GeminiWhy | "bad-audio"; model?: string };

/**
 * Gemini as a second ear (lib/transcribe.ts). Called only when Chrome's recognizer returned no words
 * for a clip the meter says has a voice in it, typically a lone syllable said once. Gemini transcribes
 * the clip verbatim; the deterministic scorer in lib/scoring.ts then decides the cast exactly as it
 * would for recognizer words. The target phrase is deliberately NOT sent, so Gemini cannot echo it.
 *
 * POST { audio: { b64, mime }, lang }  →  { transcript, mode: "gemini" | "none", why?, model? }
 */
export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const b64 = body.audio?.b64, mime = body.audio?.mime;
  if (typeof b64 !== "string" || !b64 || typeof mime !== "string" || !/^audio\//.test(mime)) {
    return NextResponse.json<Reply>({ transcript: "", mode: "none", why: "bad-audio" }, { status: 400 });
  }
  if (b64.length > MAX_B64) return NextResponse.json<Reply>({ transcript: "", mode: "none", why: "bad-audio" }, { status: 413 });
  if (!isGeminiLive()) return NextResponse.json<Reply>({ transcript: "", mode: "none", why: "nokey" });
  const L = LANGS[body.lang ?? "es"] ?? LANGS.es;

  // No target phrase here, on purpose: the model must report what it hears, not what the game hopes for.
  const prompt = L.id === "zh"
    ? "Transcribe the speech in this audio clip verbatim as simplified Chinese characters. The speaker is a learner saying one Mandarin word or short phrase; it may be a single syllable. Output only the characters you hear: no pinyin, no punctuation, no translation, no commentary. If there is no intelligible speech, output exactly NONE."
    : `Transcribe the speech in this audio clip verbatim in ${L.english}. The speaker is a learner saying one word or short phrase; it may be a single short word. Output only the words you hear, in lowercase, with no punctuation, no translation and no commentary. If there is no intelligible speech, output exactly NONE.`;
  const parts: GeminiPart[] = [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }];

  const r = await callGemini([{ parts }], { temperature: 0, maxOutputTokens: 64 });
  const transcript = clean(r.text);
  if (!transcript) return NextResponse.json<Reply>({ transcript: "", mode: "none", why: r.why ?? "empty", model: r.model });
  return NextResponse.json<Reply>({ transcript, mode: "gemini", model: r.model });
}

/** First non-empty line, labels and quotes stripped; NONE → "". */
function clean(text: string | null): string {
  if (!text) return "";
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const t = line.replace(/^(transcript|transcription)\s*[:：]\s*/i, "").replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "").trim();
  if (!t || /^none[.。]?$/i.test(t)) return "";
  return t.slice(0, 160);
}
