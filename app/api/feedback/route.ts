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
  /** With an audio clip: rate the accent 0–100 under the strict rubric and return it with the tip (lib/judge.ts). */
  judge?: boolean;
};
type Reply = { tip: string; mode: "gemini" | "gemini-text" | "template"; why?: GeminiWhy; rating?: number | null };

/**
 * Pronunciation feedback, and the accent judge. With GEMINI_API_KEY and an audio clip, Gemini
 * listens to the recording, names the one sound to fix and, when `judge` is set, rates the
 * pronunciation of the target 0–100 under a strict rubric (English vowels, an English r, a
 * pronounced h, flattened or wrong tones all cap the rating). The client folds that rating into
 * the transcript score with the pure `judged()` in lib/scoring.ts; without a rating (no key,
 * timeout, unusable answer) the transcript score stands. Without a key, or when Gemini fails, a
 * template tip is built from the recognizer transcript.
 *
 * POST { target, reading?, focus?, transcript, score, audio?, lang?, judge? }
 *  →   { tip, mode: "gemini" | "gemini-text" | "template", why?, rating?: 0–100 | null }
 */
export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const { target, reading, focus, audio } = body;
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  const score = Number(body.score);
  if (typeof target !== "string" || !target.trim() || !Number.isFinite(score)) return NextResponse.json({ error: "target (string) and score (number) are required" }, { status: 400 });
  const L = LANGS[body.lang ?? "es"] ?? LANGS.es;

  const hasAudio = Boolean(audio?.b64 && audio?.mime);
  const judge = body.judge === true && hasAudio;
  const fallback = template(L, target, reading, focus, transcript, score);
  if (!judge && score >= PRAISE_AT) return NextResponse.json<Reply>({ tip: fallback, mode: "template" });
  if (!isGeminiLive()) return NextResponse.json<Reply>({ tip: fallback, mode: "template", why: "nokey", rating: null });

  const habits = L.id === "zh"
    ? " Learners often carry English habits: a flat or English-like tone contour, a stressed syllable instead of a tone, an English r for zh/ch/sh/r, or ü said as oo. If you hear one, name that syllable with its tone number and the shape the pitch should trace."
    : " Learners often read Spanish as if it were English: gliding or reduced vowels (\"ay\" for e, \"oh\" for o, a schwa in unstressed syllables), an English r or dark l, a pronounced h, or aspirated p/t/k. If the audio sounds like English pronunciation of Spanish, say so plainly and name the one vowel or consonant to fix.";

  if (judge) {
    const prompt = judgePrompt(L, target, reading, focus, transcript, habits);
    const parts: GeminiPart[] = [{ text: prompt }, { inline_data: { mime_type: audio!.mime, data: audio!.b64 } }];
    const r = await callGemini([{ parts }], { temperature: 0.2, maxOutputTokens: 260, responseMimeType: "application/json" });
    const parsed = parseJudge(r.text);
    if (parsed) {
      // Mandarin: the model names the tones it heard before it compares; a tone that differs from the
      // target caps the rating in code, because models are generous with tones on lone syllables.
      const cap = L.id === "zh" ? toneCap(target, parsed.heard) : null;
      const rating = cap !== null ? Math.min(parsed.rating, cap) : parsed.rating;
      return NextResponse.json<Reply & { heard?: string }>({ tip: parsed.tip || fallback, mode: "gemini", rating, heard: parsed.heard || undefined });
    }
    if (r.text?.trim()) return NextResponse.json<Reply>({ tip: r.text.trim(), mode: "gemini", rating: null });   // answered, but not as JSON: coaching without a rating
    return NextResponse.json<Reply>({ tip: fallback, mode: "template", why: r.why ?? "error", rating: null });
  }

  // Coaching only (typing mode, or no clip): the score is already final.
  const prompt = `You are a friendly ${L.english} pronunciation coach inside a game. The learner tried to say: "${target}"${reading ? ` (${L.readingName ?? "reading"}: ${reading})` : ""}. The speech recognizer heard: "${transcript || "(nothing)"}" (similarity ${Math.round(score * 100)}%).${focus ? ` This phrase trains: ${focus}.` : ""} Things that matter in ${L.english}: ${L.coachHint}.${habits}
${hasAudio ? "Listen to the audio." : "No audio is available; judge from the transcript."} In ONE sentence (max 20 words), name the single most important sound to fix and how${L.hasReading ? " (name tones by number when relevant)" : ""}, or praise one specific thing they did right if it was good. No preamble.`;

  const parts: GeminiPart[] = [{ text: prompt }];
  if (hasAudio) parts.push({ inline_data: { mime_type: audio!.mime, data: audio!.b64 } });

  const r = await callGemini([{ parts }], { temperature: 0.5, maxOutputTokens: 200 });
  if (r.text) return NextResponse.json<Reply>({ tip: r.text, mode: hasAudio ? "gemini" : "gemini-text" });
  return NextResponse.json<Reply>({ tip: fallback, mode: "template", why: r.why ?? "error" });
}

/* ---------- the judge ---------- */

function judgePrompt(L: LangConfig, target: string, reading: string | undefined, focus: string | undefined, transcript: string, habits: string): string {
  const zh = L.id === "zh";
  return `You are a strict ${L.english} pronunciation examiner inside a game. The learner tried to say: "${target}"${reading ? ` (${L.readingName ?? "reading"}: ${reading})` : ""}.${focus ? ` This phrase trains: ${focus}.` : ""}
Listen to the audio and rate the pronunciation of exactly that phrase from 0 to 100 as a demanding native teacher would:
95-100 native-like · 80-94 correct with a slight accent · 60-79 understandable but noticeably foreign (one vowel, consonant${zh ? " or tone" : ""} off) · 35-59 an English-style reading (${zh ? "tones flattened or missing, English stress instead of tone, an English r for r/zh/ch/sh, ü said as oo" : "gliding or reduced vowels, an English r or dark l, a pronounced h, aspirated p/t/k"}) · 0-34 a different word, a missing syllable, or unintelligible.
${zh ? "Every syllable must carry its tone: any wrong tone caps the rating at 65; flat or missing tones cap it at 50. Decide each tone from the pitch contour you actually hear, before comparing with the target: 1 high and level, 2 rising, 3 dipping then rising, 4 falling sharply; a syllable spoken with English statement intonation (level or falling) is NOT a third tone." : "Spanish vowels are short, pure and equal: an English diphthong on any vowel caps the rating at 55; an English r caps it at 60."}
The speech recognizer's transcript was "${transcript || "(nothing)"}", but it is accent-tolerant: judge only what you hear. Things that matter in ${L.english}: ${L.coachHint}.${habits}
Reply with JSON only: {${zh ? '"heard": "<pinyin with tone numbers of exactly what you heard, syllables separated by spaces, e.g. ta4 or xia4 yu3 le5>", ' : ""}"rating": <integer 0-100>, "tip": "<one sentence, at most 20 words: the single most important sound to fix and how${L.hasReading ? ", naming tones by number" : ""}, or specific praise if it was good>"}`;
}

/** Accepts clean JSON, fenced JSON, or prose that still carries "rating": N. */
function parseJudge(text: string | null): { rating: number; tip: string; heard: string } | null {
  if (!text) return null;
  const raw = text.replace(/```(?:json)?/gi, "").trim();
  let rating: unknown, tip: unknown, heard: unknown;
  try { const j = JSON.parse(raw) as { rating?: unknown; tip?: unknown; heard?: unknown }; rating = j.rating; tip = j.tip; heard = j.heard; }
  catch {
    const m = raw.match(/"rating"\s*:\s*(\d{1,3})/); if (!m) return null;
    rating = Number(m[1]);
    tip = raw.match(/"tip"\s*:\s*"([^"]{0,300})"/)?.[1] ?? "";
    heard = raw.match(/"heard"\s*:\s*"([^"]{0,120})"/)?.[1] ?? "";
  }
  const n = typeof rating === "number" ? rating : Number(rating);
  if (!Number.isFinite(n)) return null;
  return { rating: Math.max(0, Math.min(100, Math.round(n))), tip: typeof tip === "string" ? tip.trim() : "", heard: typeof heard === "string" ? heard.trim() : "" };
}

/**
 * Mandarin: compare the tones the model says it heard (pinyin with tone numbers) with the target's.
 * Same syllables, one tone off → cap 60; two or more off, or a flat reading → cap 45. Unparsable or a
 * different syllable count → no cap (the rating stands). Tone 5 is neutral (pinyin-pro's 0).
 */
function toneCap(target: string, heard: string): number | null {
  const want = syllables(target);
  const got = heard.toLowerCase().replace(/v/g, "ü").split(/[\s'’,/]+/).map((s) => s.replace(/5$/, "0")).filter((s) => /^[a-zü]+\d$/.test(s));
  if (!want.length || got.length !== want.length) return null;
  let off = 0;
  for (let i = 0; i < want.length; i++) {
    if (want[i].slice(0, -1) !== got[i].slice(0, -1)) return null;   // a different syllable: not a tone question, leave it to the rating
    if (want[i] !== got[i]) off++;
  }
  return off === 0 ? null : off === 1 ? 60 : 45;
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
