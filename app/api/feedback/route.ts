import { NextResponse } from "next/server";
import { callGemini, isGeminiLive, type GeminiPart } from "@/lib/gemini";
import { LANGS, type LangId } from "@/lib/lang";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow Gemini retries to finish (hobby default is 10s)

/**
 * Pronunciation feedback. With GEMINI_API_KEY and an audio clip, Gemini listens
 * to the actual recording and names the one sound to fix. Without it, a
 * template tip is built from the recognizer transcript. The game's damage is
 * already decided before this runs; feedback never changes the score.
 */
export async function POST(req: Request) {
  const { target, reading, focus, transcript, score, audio, lang = "es" } = (await req.json()) as {
    target: string; reading?: string; focus?: string; transcript: string; score: number; audio?: { b64: string; mime: string } | null; lang?: LangId;
  };
  const L = LANGS[lang] ?? LANGS.es;
  const fallback = template(target, focus, transcript, score);
  if (!isGeminiLive()) return NextResponse.json({ tip: fallback, mode: "template" });

  const hasAudio = Boolean(audio?.b64);
  const prompt = `You are a friendly ${L.english} pronunciation coach inside a game. The learner tried to say: "${target}"${reading ? ` (${reading})` : ""}. The speech recognizer heard: "${transcript || "(nothing)"}" (similarity ${Math.round(score * 100)}%).${focus ? ` This phrase trains: ${focus}.` : ""} Things that matter in ${L.english}: ${L.coachHint}.
${hasAudio ? "Listen to the audio." : "No audio is available; judge from the transcript."} In ONE sentence (max 20 words), name the single most important sound to fix and how, or praise one specific thing they did right if it was good. No preamble.`;

  const parts: GeminiPart[] = [{ text: prompt }];
  if (hasAudio) parts.push({ inline_data: { mime_type: audio!.mime, data: audio!.b64 } });

  const tip = await callGemini([{ parts }], { temperature: 0.5, maxOutputTokens: 200 });
  return NextResponse.json({ tip: tip || fallback, mode: tip ? (hasAudio ? "gemini" : "gemini-text") : "template" });
}

function template(target: string, focus: string | undefined, transcript: string, score: number) {
  if (score >= 0.9) return `Clean cast. ${focus ? `Your ${focus} was on point.` : "Keep that rhythm."}`;
  if (!transcript) return "I didn't catch anything. Speak right after the glow, a little louder.";
  if (score >= 0.75) return `Close: I heard "${transcript}". ${focus ? `Focus on the ${focus}.` : "Slow down on the vowels."}`;
  return `I heard "${transcript}" instead of "${target}". ${focus ? `Work on the ${focus}.` : "Say each syllable with equal weight."}`;
}
