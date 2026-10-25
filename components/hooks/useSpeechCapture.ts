"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureCast, type Capture, type CaptureHandle, type CaptureOpts } from "@/lib/speech";

/** What a screen may tune per capture. The hook owns `onLevel` and `onInterim` (they feed `level` and `heard`). */
export type SpeechCaptureOpts = Pick<CaptureOpts, "timeoutMs" | "maxMs" | "idleMs" | "accept">;

/**
 * One mic capture at a time for a screen. `start()` resolves with a `Capture`; read `reason`
 * before scoring ("silence"/"timeout" are not a cast). A second `start()` while listening
 * returns the pending promise; `stop()` ends listening now and still delivers what was heard.
 * `heard` is the live interim transcript while listening and "" otherwise.
 * Unmounting stops the capture (tracks released) and drops late state updates.
 */
export function useSpeechCapture(): {
  listening: boolean;
  level: number;
  heard: string;
  start(lang: string, opts?: SpeechCaptureOpts): Promise<Capture>;
  stop(): void;
} {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const active = useRef<CaptureHandle | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.stop();
      active.current = null;
    };
  }, []);

  const start = useCallback((lang: string, opts: SpeechCaptureOpts = {}) => {
    if (active.current) return active.current.result;
    if (!mounted.current) return Promise.resolve<Capture>({ alts: [], ms: 0, reason: "silence", early: false, peak: 0, audio: null }); // screen is gone: never open the mic
    setListening(true); setLevel(0); setHeard("");
    const raw = captureCast(lang, {
      ...opts,
      onLevel: (v) => {
        if (!mounted.current) return;
        const q = Math.round(v * 50) / 50; // 0.02 steps: silence frames don't re-render the screen
        setLevel((prev) => (prev === q ? prev : q));
      },
      onInterim: (text) => {
        if (!mounted.current) return;
        setHeard((prev) => (prev === text ? prev : text));
      },
    });
    const handle: CaptureHandle = {
      stop: raw.stop,
      result: raw.result.then((c) => {
        if (active.current === handle) active.current = null;
        if (mounted.current) { setListening(false); setLevel(0); setHeard(""); }
        return c;
      }),
    };
    active.current = handle;
    return handle.result;
  }, []);

  const stop = useCallback(() => { active.current?.stop(); }, []);

  return { listening, level, heard, start, stop };
}
