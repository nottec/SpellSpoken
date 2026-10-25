"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureCast, type Capture, type CaptureHandle } from "@/lib/speech";

export type SpeechCaptureOpts = { timeoutMs?: number; maxMs?: number };

/**
 * One mic capture at a time for a screen. `start()` resolves with a `Capture`; read `reason`
 * before scoring ("silence"/"timeout" are not a cast). A second `start()` while listening
 * returns the pending promise; `stop()` ends listening now and still delivers what was heard.
 * Unmounting stops the capture (tracks released) and drops late state updates.
 */
export function useSpeechCapture(): {
  listening: boolean;
  level: number;
  start(lang: string, opts?: SpeechCaptureOpts): Promise<Capture>;
  stop(): void;
} {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
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
    if (!mounted.current) return Promise.resolve<Capture>({ alts: [], ms: 0, reason: "silence", audio: null }); // screen is gone: never open the mic
    setListening(true); setLevel(0);
    const raw = captureCast(lang, {
      ...opts,
      onLevel: (v) => {
        if (!mounted.current) return;
        const q = Math.round(v * 50) / 50; // 0.02 steps: silence frames don't re-render the screen
        setLevel((prev) => (prev === q ? prev : q));
      },
    });
    const handle: CaptureHandle = {
      stop: raw.stop,
      result: raw.result.then((c) => {
        if (active.current === handle) active.current = null;
        if (mounted.current) { setListening(false); setLevel(0); }
        return c;
      }),
    };
    active.current = handle;
    return handle.result;
  }, []);

  const stop = useCallback(() => { active.current?.stop(); }, []);

  return { listening, level, start, stop };
}
