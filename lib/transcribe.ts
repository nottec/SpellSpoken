"use client";

/**
 * Gemini as a second ear. Chrome's recognizer discards a very short utterance (a lone 塔 or 心 said
 * once: `speechstart`, then no words, or no speech event at all) while the meter and the recorded
 * clip plainly hold a voice. When that happens the clip goes to /api/transcribe, which asks Gemini
 * for a verbatim transcript WITHOUT the target phrase, and the same deterministic scorer decides the
 * cast exactly as it would for recognizer words. Gemini never learns what the player was supposed to
 * say, so it cannot inflate a score; a failed or slow call leaves the capture as it was (not a cast).
 */
import type { Capture } from "./speech";
import type { LangId } from "./lang";

/** Meter peak (0..1) below which a clip counts as silence: room noise sits near 0.05, a syllable at 0.3 and up. */
export const FALLBACK_PEAK = 0.12;
/** How long the screen waits for Gemini before giving up on the clip (the route keeps its own, longer budget). */
export const FALLBACK_TIMEOUT_MS = 8000;
/** Gemini reports no confidence; this keeps a verbatim transcript at Perfecto while staying under the recognizer's best case. */
export const GEMINI_EAR_CONFIDENCE = 0.85;

/** True when the recognizer returned no words but the clip plainly has a voice in it. */
export function needsFallback(cap: Capture): boolean {
  if (!cap.audio || cap.peak < FALLBACK_PEAK) return false;
  if (cap.reason === "silence" || cap.reason === "timeout") return true;
  return (cap.reason === "result" || cap.reason === "stopped") && !cap.alts.some((a) => a.transcript.trim());
}

export type TranscribeReply = { transcript: string; why?: string; model?: string };

/** POST the clip to /api/transcribe. Never throws; an empty transcript means nothing usable came back. */
export async function transcribeClip(audio: { b64: string; mime: string }, lang: LangId): Promise<TranscribeReply> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FALLBACK_TIMEOUT_MS);
  try {
    const res = await fetch("/api/transcribe", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audio, lang }), signal: ctrl.signal,
    });
    if (!res.ok) return { transcript: "", why: `http ${res.status}` };
    const j = (await res.json()) as Partial<TranscribeReply>;
    return { transcript: typeof j.transcript === "string" ? j.transcript.trim() : "", why: j.why, model: j.model };
  } catch {
    return { transcript: "", why: ctrl.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** The capture as if the recognizer had returned Gemini's words: one alternative at rank 0 with a fixed confidence. */
export function withFallback(cap: Capture, transcript: string): Capture {
  return { ...cap, reason: "result", early: false, alts: [{ transcript, confidence: GEMINI_EAR_CONFIDENCE }], via: "gemini" };
}
