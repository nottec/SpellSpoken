"use client";

/**
 * Browser speech for the cast flow: Web Speech recognition, a MediaRecorder clip for Gemini,
 * an RMS level meter, and TTS.
 *
 * `captureCast(lang, opts)` listens once and resolves with what was heard, *why* listening
 * ended, how long it took, and the recorded clip. It never throws speech away: `stop()` and
 * both timeouts call `recognition.stop()` and wait up to GRACE_MS for the recognizer's final
 * result instead of resolving empty. Every exit path (result, silence, timeout, stop, error,
 * exception) releases the mic tracks and the AudioContext before the promise resolves, and
 * the promise resolves exactly once.
 *
 * `recognize()` and `recordDuring()` remain as compatibility wrappers for the old battle screen.
 */

export type Alt = { transcript: string; confidence: number };
export type CaptureReason = "result" | "silence" | "timeout" | "stopped" | "error" | "unsupported";
export type Capture = { alts: Alt[]; ms: number; reason: CaptureReason; error?: string; audio: { b64: string; mime: string } | null };
export type CaptureOpts = { timeoutMs?: number; maxMs?: number; onLevel?: (v: number) => void };
export type CaptureHandle = { result: Promise<Capture>; stop(): void };

/** Budget to *start* speaking. Once speech is detected, listening may run on until maxMs. */
export const DEFAULT_TIMEOUT_MS = 7000;
/** maxMs defaults to timeoutMs + EXTRA_MAX_MS: room for a level-3 sentence that started late. */
export const EXTRA_MAX_MS = 6000;
/** After recognition.stop(), how long to wait for the final result before settling with what we have. */
export const GRACE_MS = 2500;

const UNSUPPORTED_TEXT = "This browser can't hear you. Open Chrome, or type the incantation.";
const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Microphone blocked. Allow the mic in the address bar, then try again.",
  "service-not-allowed": "Speech recognition is blocked by this browser or an extension. Try Chrome, or type the incantation.",
  "audio-capture": "No microphone found. Plug one in, or pick one in the browser's site settings.",
  network: "Speech recognition needs the network (Chrome sends audio to Google). Check the connection, or type instead.",
  "language-not-supported": "This browser can't recognise that language. Type the incantation instead.",
  "bad-grammar": "The recognizer rejected the request. Try again.",
  "start-failed": "The recognizer couldn't start. Wait a moment and try again.",
};
const errorText = (code: string) => ERROR_TEXT[code] ?? `Speech recognition failed (${code}). Try again, or type the incantation.`;

/* ---------- minimal Web Speech typings (not in lib.dom) ---------- */

type SRAlternative = { transcript: string; confidence: number };
type SRResult = { isFinal: boolean; length: number; [i: number]: SRAlternative };
type SRResultList = { length: number; [i: number]: SRResult };
type SRResultEvent = { resultIndex: number; results: SRResultList };
type SRErrorEvent = { error?: string; message?: string };
type SR = {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onstart: ((e: unknown) => void) | null;
  onresult: ((e: SRResultEvent) => void) | null;
  onnomatch: ((e: SRResultEvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
};

function recognitionCtor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechSupported() {
  return recognitionCtor() !== null;
}

/** Final results → alternatives (joined across results if the recognizer split the utterance); interim → one alt. */
function collectAlts(results: SRResultList): { finals: Alt[]; interim: Alt[] } {
  const list: SRResult[] = [];
  for (let i = 0; i < results.length; i++) if (results[i]) list.push(results[i]);
  const finals = list.filter((r) => r.isFinal);
  const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
  if (finals.length) {
    const n = Math.max(...finals.map((r) => r.length));
    const alts: Alt[] = [];
    for (let i = 0; i < n; i++) {
      const picks = finals.map((r) => r[Math.min(i, r.length - 1)]);
      const transcript = tidy(picks.map((a) => a?.transcript ?? "").join(" "));
      if (!transcript) continue;
      const confidence = Math.min(...picks.map((a) => (typeof a?.confidence === "number" && Number.isFinite(a.confidence) ? a.confidence : 0)));
      alts.push({ transcript, confidence });
    }
    return { finals: alts, interim: [] };
  }
  const transcript = tidy(list.map((r) => r[0]?.transcript ?? "").join(" "));
  return { finals: [], interim: transcript ? [{ transcript, confidence: 0 }] : [] };
}

/* ---------- mic stream: recorder for the Gemini clip + analyser for the meter ---------- */

type Media = { close(): Promise<{ b64: string; mime: string } | null> };

function openMedia(wantAudio: boolean, onLevel?: (v: number) => void): Media {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  let ctx: AudioContext | null = null;
  let meter: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const ready: Promise<MediaStream> =
    typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ audio: true })
      : Promise.reject(new Error("no mediaDevices"));

  ready
    .then((s) => {
      if (closed) { s.getTracks().forEach((t) => t.stop()); return; } // we finished before the mic opened
      stream = s;
      if (wantAudio && typeof MediaRecorder !== "undefined") {
        try {
          const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
          recorder = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
          recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
          recorder.start();
        } catch { recorder = null; }
      }
      if (onLevel) {
        try {
          const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AC) {
            ctx = new AC();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            ctx.createMediaStreamSource(s).connect(analyser);
            const buf = new Uint8Array(analyser.fftSize);
            meter = setInterval(() => {
              analyser.getByteTimeDomainData(buf);
              let sum = 0;
              for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
              // RMS of normal speech sits around 0.1–0.25; ×3 puts it mid-meter, clamped to 1.
              onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
            }, 33);
            void ctx.resume?.().catch(() => {});
          }
        } catch { /* meter is optional */ }
      }
    })
    .catch(() => { /* no mic stream: recognition alone still works; audio stays null */ });

  return {
    close() {
      if (closed) return Promise.resolve(null);
      closed = true;
      if (meter) { clearInterval(meter); meter = null; }
      if (ctx) { void ctx.close().catch(() => {}); ctx = null; }
      onLevel?.(0);
      const rec = recorder;
      const stopped = new Promise<void>((res) => {
        if (!rec || rec.state === "inactive") return res();
        rec.onstop = () => res();
        try { rec.stop(); } catch { res(); }
        setTimeout(res, 1500); // never hang the cast on a recorder that won't flush
      });
      // Stop the tracks now: the browser's mic indicator must go off with the result, not after the encode.
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      return stopped.then(async () => {
        if (!rec || !chunks.length) return null;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) return null;
        const b64 = await toBase64(blob);
        return b64 ? { b64, mime: (rec.mimeType || "audio/webm").split(";")[0] } : null;
      });
    },
  };
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((res) => {
    try {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(",")[1] ?? "");
      fr.onerror = () => res("");
      fr.readAsDataURL(blob);
    } catch { res(""); }
  });
}

/* ---------- the capture state machine ---------- */

function capture(lang: string, opts: CaptureOpts, wantAudio: boolean): CaptureHandle {
  const timeoutMs = Math.max(500, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxMs = Math.max(timeoutMs, opts.maxMs ?? timeoutMs + EXTRA_MAX_MS);
  let stopFn: () => void = () => {};

  const result = new Promise<Capture>((resolve) => {
    const Ctor = recognitionCtor();
    if (!Ctor) { resolve({ alts: [], ms: 0, reason: "unsupported", error: UNSUPPORTED_TEXT, audio: null }); return; }
    let rec: SR;
    try { rec = new Ctor(); } catch { resolve({ alts: [], ms: 0, reason: "unsupported", error: UNSUPPORTED_TEXT, audio: null }); return; }

    const media = wantAudio || opts.onLevel ? openMedia(wantAudio, opts.onLevel) : null;

    let done = false;          // promise settled (or settling)
    let ended = false;         // recognizer fired onend
    let stopping = false;      // recognition.stop() requested, waiting for the final result
    let userStopped = false;   // stop() came from the UI
    let hardCapHit = false;    // maxMs elapsed
    let speechStarted = false;
    let finalAlts: Alt[] = [];
    let interimAlts: Alt[] = [];
    let t0 = 0;
    let resultAt: number | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const after = (ms: number, fn: () => void) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

    const finish = (reason: CaptureReason, error?: string) => {
      if (done) return;
      done = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      rec.onstart = null; rec.onresult = null; rec.onnomatch = null; rec.onerror = null; rec.onend = null; rec.onspeechstart = null;
      if (!ended) { try { rec.abort(); } catch { /* already stopped */ } }
      const alts = (finalAlts.length ? finalAlts : interimAlts).filter((a) => a.transcript.trim());
      const ms = t0 ? Math.max(0, Math.round((resultAt ?? performance.now()) - t0)) : 0;
      const base = { alts, ms, reason, ...(error ? { error } : {}) };
      (media ? media.close() : Promise.resolve(null)).then(
        (audio) => resolve({ ...base, audio }),
        () => resolve({ ...base, audio: null }),
      );
    };

    /** Decide the reason from what we have. Heard speech always wins; only then do we classify the failure. */
    const settle = (errorCode?: string) => {
      const heard = (finalAlts.length ? finalAlts : interimAlts).some((a) => a.transcript.trim());
      if (heard) return finish(userStopped ? "stopped" : "result");
      if (errorCode && errorCode !== "no-speech" && errorCode !== "aborted") return finish("error", errorText(errorCode));
      if (hardCapHit && speechStarted) return finish("timeout");
      return finish("silence");
    };

    const requestStop = (why: "user" | "soft" | "hard") => {
      if (done || stopping) return;
      stopping = true;
      if (why === "user") userStopped = true;
      if (why === "hard") hardCapHit = true;
      try { rec.stop(); } catch { settle(); return; }
      after(GRACE_MS, () => settle()); // the final result usually lands well inside this
    };
    stopFn = () => requestStop("user");

    rec.lang = lang;
    rec.interimResults = true;   // so we know speech has begun and never lose in-flight words
    rec.maxAlternatives = 5;
    rec.continuous = false;

    const onResults = (e: SRResultEvent) => {
      if (done) return;
      try {
        const { finals, interim } = collectAlts(e.results);
        if (finals.length) { finalAlts = finals; resultAt = performance.now(); settle(); }
        else if (interim.length) interimAlts = interim;
      } catch { settle(); } // a malformed event must never leave the promise hanging
    };
    rec.onspeechstart = () => { speechStarted = true; };
    rec.onresult = (e) => { speechStarted = true; onResults(e); };
    rec.onnomatch = onResults;
    rec.onerror = (e) => { if (!done) settle(e?.error || "unknown"); };
    rec.onend = () => { ended = true; if (!done) settle(); };

    // Budget to start speaking; once speech is detected the hard cap takes over.
    after(timeoutMs, () => { if (!done && !stopping && !speechStarted) requestStop("soft"); });
    after(maxMs, () => { if (!done && !stopping) requestStop("hard"); });

    t0 = performance.now();
    try { rec.start(); } catch { finish("error", errorText("start-failed")); }
  });

  return { result, stop: () => stopFn() };
}

/**
 * Listen for one incantation. `timeoutMs` is the budget to start speaking (default 7 s); once
 * speech is detected, listening continues up to `maxMs` (default timeoutMs + 6 s). `onLevel`
 * gets an RMS level 0..1 about 30×/s for a meter. `stop()` ends listening now and still
 * returns what was heard.
 */
export function captureCast(lang: string, opts: CaptureOpts = {}): CaptureHandle {
  return capture(lang, opts, true);
}

/* ---------- compatibility wrappers for the old battle screen ---------- */

/** @deprecated use captureCast. Listen once; empty alts on silence (the caller cannot tell silence from a miss). */
export function recognize(lang: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ alts: Alt[]; ms: number; reason: CaptureReason }> {
  return capture(lang, { timeoutMs }, false).result.then((c) => ({ alts: c.alts, ms: c.ms, reason: c.reason }));
}

/** @deprecated captureCast records the clip itself. Record mic audio for the duration of a callback. */
export async function recordDuring<T>(work: () => Promise<T>): Promise<{ result: T; audio: { b64: string; mime: string } | null }> {
  const media = openMedia(true);
  let result: T;
  try { result = await work(); }
  catch (e) { await media.close(); throw e; }
  const audio = await media.close();
  return { result, audio };
}

/* ---------- TTS ---------- */

/** Pick a voice: exact tag (zh-CN), then the same language (zh, cmn), else let the browser choose by u.lang. */
function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const norm = (s: string) => s.toLowerCase().replace(/_/g, "-");
  const want = norm(lang);
  const primary = want.split("-")[0];
  const families = primary === "zh" ? ["zh", "cmn"] : [primary];
  const same = voices.filter((v) => families.includes(norm(v.lang).split("-")[0]));
  return (
    same.find((v) => norm(v.lang) === want) ??
    (primary === "zh" ? same.find((v) => /cn|hans/.test(norm(v.lang))) : undefined) ??
    same.find((v) => v.default) ??
    same[0] ??
    null
  );
}

export function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  const go = () => {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    const voice = pickVoice(synth.getVoices(), lang);
    if (voice) u.voice = voice;
    synth.speak(u);
  };
  if (synth.getVoices().length) { go(); return; }
  // Chrome loads voices asynchronously; wait for them briefly, then speak with the default voice.
  let fired = false;
  const once = () => { if (fired) return; fired = true; synth.removeEventListener("voiceschanged", once); go(); };
  synth.addEventListener("voiceschanged", once);
  setTimeout(once, 500);
}
