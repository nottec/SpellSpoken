"use client";

/** Browser speech: recognition (Web Speech API), optional audio capture for Gemini feedback, and TTS. */

export type Alt = { transcript: string; confidence: number };

export function speechSupported() {
  return typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/** Listen once. Resolves with recognizer alternatives and elapsed time; empty list on silence/timeout. */
export function recognize(lang: string, timeoutMs = 7000): Promise<{ alts: Alt[]; ms: number }> {
  return new Promise((resolve) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return resolve({ alts: [], ms: 0 });
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    const t0 = performance.now();
    let done = false;
    const finish = (alts: Alt[]) => { if (done) return; done = true; try { rec.stop(); } catch {} resolve({ alts, ms: performance.now() - t0 }); };
    rec.onresult = (e: any) => {
      const res = e.results[0];
      const alts: Alt[] = [];
      for (let i = 0; i < res.length; i++) alts.push({ transcript: res[i].transcript, confidence: res[i].confidence ?? 0 });
      finish(alts);
    };
    rec.onerror = () => finish([]);
    rec.onend = () => finish([]);
    setTimeout(() => finish([]), timeoutMs);
    try { rec.start(); } catch { finish([]); }
  });
}

/** Record mic audio for the duration of a callback. Returns base64 webm or null. */
export async function recordDuring<T>(work: () => Promise<T>): Promise<{ result: T; audio: { b64: string; mime: string } | null }> {
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start();
  } catch { recorder = null; }

  const result = await work();

  let audio: { b64: string; mime: string } | null = null;
  if (recorder) {
    await new Promise<void>((res) => { recorder!.onstop = () => res(); recorder!.stop(); });
    stream?.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType });
    if (blob.size > 0) {
      const buf = await blob.arrayBuffer();
      let bin = ""; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      audio = { b64: btoa(bin), mime: recorder.mimeType.split(";")[0] };
    }
  }
  return { result, audio };
}

export function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.9;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.split("-")[0]));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}
