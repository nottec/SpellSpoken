import { NextResponse } from "next/server";
import { callGemini, isGeminiLive, type GeminiPart, type GeminiWhy } from "@/lib/gemini";
import { LANGS, type LangConfig, type LangId } from "@/lib/lang";
import { syllables } from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow Gemini retries to finish (hobby default is 10s)

/** Above this the cast was clean: template praise, no Gemini request (saves quota). */
const PRAISE_AT = 0.97;

type Body = {
  target: string; reading?: string; focus?: string; transcript?: string; score: number;
  audio?: { b64: string; mime: string } | null; lang?: LangId;
};
type Reply = { tip: string; mode: "gemini" | "gemini-text" | "template"; why?: GeminiWhy };

/**
 * Pronunciation feedback. With GEMINI_API_KEY and an audio clip, Gemini listens to the
 * recording and names the one sound to fix. Without it (or when Gemini fails) a template tip is
 * built from the recognizer transcript. The game's damage is already decided before this runs;
 * feedback never changes the score.
 *
 * POST { target, reading?, focus?, transcript, score, audio?, lang? }
 *  →   { tip, mode: "gemini" | "gemini-text" | "template", why? }
 */
export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const { target, reading, focus, audio } = body;
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  const score = Number(body.score);
  if (typeof target !== "string" || !target.trim() || !Number.isFinite(score)) return NextResponse.json({ error: "target (string) and score (number) are required" }, { status: 400 });
  const L = LANGS[body.lang ?? "es"] ?? LANGS.es;

  const fallback = template(L, target, reading, focus, transcript, score);
  if (score >= PRAISE_AT) return NextResponse.json<Reply>({ tip: fallback, mode: "template" });
  if (!isGeminiLive()) return NextResponse.json<Reply>({ tip: fallback, mode: "template", why: "nokey" });

  const hasAudio = Boolean(audio?.b64 && audio?.mime);
  // Coaching only: the score above is already final and Gemini's answer never changes it.
  const habits = L.id === "zh"
    ? " Learners often carry English habits: a flat or English-like tone contour, a stressed syllable instead of a tone, an English r for zh/ch/sh/r, or ü said as oo. If you hear one, name that syllable with its tone number and the shape the pitch should trace."
    : " Learners often read Spanish as if it were English: gliding or reduced vowels (\"ay\" for e, \"oh\" for o, a schwa in unstressed syllables), an English r or dark l, a pronounced h, or aspirated p/t/k. If the audio sounds like English pronunciation of Spanish, say so plainly and name the one vowel or consonant to fix.";
  const prompt = `You are a friendly ${L.english} pronunciation coach inside a game. The learner tried to say: "${target}"${reading ? ` (${L.readingName ?? "reading"}: ${reading})` : ""}. The speech recognizer heard: "${transcript || "(nothing)"}" (similarity ${Math.round(score * 100)}%).${focus ? ` This phrase trains: ${focus}.` : ""} Things that matter in ${L.english}: ${L.coachHint}.${habits}
${hasAudio ? "Listen to the audio." : "No audio is available; judge from the transcript."} In ONE sentence (max 20 words), name the single most important sound to fix and how${L.hasReading ? " (name tones by number when relevant)" : ""}, or praise one specific thing they did right if it was good. No preamble.`;

  const parts: GeminiPart[] = [{ text: prompt }];
  if (hasAudio) parts.push({ inline_data: { mime_type: audio!.mime, data: audio!.b64 } });

  const r = await callGemini([{ parts }], { temperature: 0.5, maxOutputTokens: 200 });
  if (r.text) return NextResponse.json<Reply>({ tip: r.text, mode: hasAudio ? "gemini" : "gemini-text" });
  return NextResponse.json<Reply>({ tip: fallback, mode: "template", why: r.why ?? "error" });
}

/* ---------- templates ---------- */

const TONE_SHAPE: Record<string, string> = { "1": "high and flat", "2": "rising like a question", "3": "dipping low then up", "4": "falling sharply", "0": "light and short" };

function initialHint(base: string) {
  if (/^(zh|ch|sh)/.test(base)) return "; curl the tongue tip back for zh, ch, sh";
  if (/^[zcs][^h]/.test(base) || /^[zcs]$/.test(base)) return "; keep the tongue flat behind the teeth for z, c, s";
  if (/ü/.test(base) || /^[jqxy]u/.test(base)) return "; ü is \"ee\" with rounded lips";
  if (/^r/.test(base)) return "; the r is a soft buzz with the tongue curled back";
  if (/^[ptk]/.test(base)) return "; p, t, k puff air onto your palm";
  return "";
}

/** Mandarin: name the first syllable with the right sound but the wrong tone, else the first syllable that never arrived. */
function zhToneHint(target: string, heard: string): string | null {
  const t = syllables(target), h = syllables(heard);
  if (!t.length || !h.length) return null;
  if (t.length === h.length) {
    for (let i = 0; i < t.length; i++) {
      const bt = t[i].slice(0, -1), bh = h[i].slice(0, -1);
      if (bt === bh && t[i] !== h[i]) {
        const want = t[i].slice(-1), got = h[i].slice(-1);
        return `"${bt}" came out as tone ${got}; it wants tone ${want}, ${TONE_SHAPE[want] ?? "held steady"}.`;
      }
    }
  }
  const heardBases = new Set(h.map((s) => s.slice(0, -1)));
  const miss = t.find((s) => !heardBases.has(s.slice(0, -1)));
  if (miss) { const b = miss.slice(0, -1); return `The syllable "${b}" never arrived${initialHint(b)}.`; }
  return null;
}

function template(L: LangConfig, target: string, reading: string | undefined, rawFocus: string | undefined, transcript: string, score: number): string {
  const zh = L.id === "zh";
  const focus = rawFocus?.trim().replace(/^the\s+/i, "") || undefined; // "Your the ü vowel" → "Your ü vowel"
  const shown = reading ? `${target} (${reading})` : `"${target}"`;
  if (score >= PRAISE_AT) {
    return zh
      ? `Clean cast. Every tone of ${reading ?? target} landed.${focus ? ` Your ${focus} was spot on.` : ""}`
      : `Clean cast. Every syllable landed.${focus ? ` Your ${focus} was on point.` : " Keep that rhythm."}`;
  }
  if (score >= 0.9) {
    return zh
      ? `Strong cast. ${reading ? `Keep each tone of ${reading} that deliberate.` : "Keep the tones that deliberate."}`
      : `Clean cast. ${focus ? `Your ${focus} was on point.` : "Keep that rhythm."}`;
  }
  if (!transcript.trim()) return "I didn't catch anything. Speak right after the glow, a little louder.";
  if (zh) {
    const hint = zhToneHint(target, transcript);
    if (score >= 0.75) return `Close: I heard "${transcript}". ${hint ?? `The syllables are there; make every tone of ${reading ?? target} deliberate.`}`;
    return `I heard "${transcript}" instead of ${shown}. ${hint ?? (focus ? `Work on the ${focus}.` : "Check the initials first: zh, ch, sh curl the tongue back; z, c, s stay flat; ü is \"ee\" with rounded lips.")}`;
  }
  if (score >= 0.75) return `Close: I heard "${transcript}". ${focus ? `Focus on the ${focus}.` : "Slow down on the vowels; Spanish vowels are short and never glide."}`;
  return `I heard "${transcript}" instead of "${target}". ${focus ? `Work on the ${focus}.` : "Say each syllable with equal weight."}`;
}
