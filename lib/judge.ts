"use client";

/**
 * The accent judge. Chrome's recognizer is accent-tolerant: an English-vowel "gato" comes back as
 * "gato" with high confidence, so the transcript score cannot see an accent. For every spoken cast
 * (and event trial) the clip goes to /api/feedback with `judge: true`; Gemini rates the pronunciation
 * of the target 0–100 against a strict rubric and writes the coaching tip in the same call.
 * `judged()` in lib/scoring.ts folds the rating into the score deterministically. No key, a timeout
 * or an unusable answer → rating null, and the transcript score stands as before.
 */
import type { LangId } from "./lang";

/** How long a cast waits for the judge; after that the transcript score stands and the tip arrives later or not at all. */
export const JUDGE_TIMEOUT_MS = 9000;

export type Judgement = { rating: number | null; tip: string | null; mode: string | null; why: string | null; /** Mandarin: the pinyin tones a blind ear heard (dev log). */ heard: string | null };

export async function judgePronunciation(args: {
  target: string; reading?: string; focus?: string; transcript: string; score: number; audio: { b64: string; mime: string }; lang: LangId;
}): Promise<Judgement> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), JUDGE_TIMEOUT_MS);
  try {
    const res = await fetch("/api/feedback", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...args, judge: true }), signal: ctrl.signal,
    });
    if (!res.ok) return { rating: null, tip: null, mode: null, why: `http ${res.status}`, heard: null };
    const d = (await res.json()) as { rating?: unknown; tip?: unknown; mode?: unknown; why?: unknown; heard?: unknown };
    const rating = typeof d.rating === "number" && Number.isFinite(d.rating) ? Math.max(0, Math.min(100, Math.round(d.rating))) : null;
    return {
      rating,
      tip: typeof d.tip === "string" && d.tip.trim() ? d.tip.trim() : null,
      mode: typeof d.mode === "string" ? d.mode : null,
      why: typeof d.why === "string" ? d.why : null,
      heard: typeof d.heard === "string" && d.heard.trim() ? d.heard.trim() : null,
    };
  } catch {
    return { rating: null, tip: null, mode: null, why: ctrl.signal.aborted ? "timeout" : "error", heard: null };
  } finally {
    clearTimeout(timer);
  }
}
