"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement, type RefObject } from "react";

export type FloatItem = { id: number; text: string; cls: string; dx: number };

/** Renders the rising numbers. Place it inside the `relative` host that `useFloatText` gives you. */
export function FloatLayer({ floats }: { floats: FloatItem[] }) {
  return (
    <>
      {floats.map((f) => (
        <div key={f.id} className={`fx-float font-display text-4xl font-semibold ${f.cls}`} style={{ left: `calc(50% + ${f.dx}px)` }} aria-hidden>
          {f.text}
        </div>
      ))}
    </>
  );
}

export type FloatTextApi = {
  /** Attach to a `relative` container (the battle stage). */
  host: RefObject<HTMLDivElement | null>;
  /** Show `text` rising from the host's upper third. `cls` is a Tailwind colour class (default "text-ember"). */
  float: (text: string, cls?: string) => void;
  /** Render this inside the host. */
  layer: ReactElement;
};

const LIFETIME = 1150;

/**
 * React-state replacement for the old document.createElement float hack.
 *
 *   const { host, float, layer } = useFloatText();
 *   <section ref={host} className="relative">…{layer}</section>
 *   float("−12", "text-blood");
 *
 * Near-simultaneous floats fan out horizontally so they do not overlap.
 */
export function useFloatText(): FloatTextApi {
  const host = useRef<HTMLDivElement>(null);
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const seq = useRef(0);
  const live = useRef<number[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const float = useCallback((text: string, cls = "text-ember") => {
    const id = ++seq.current;
    const n = live.current.length;
    const dx = n === 0 ? 0 : (n % 2 ? 1 : -1) * 72 * Math.ceil(n / 2);
    live.current.push(id);
    setFloats((f) => [...f, { id, text, cls, dx }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      live.current = live.current.filter((x) => x !== id);
      setFloats((f) => f.filter((x) => x.id !== id));
    }, LIFETIME);
    timers.current.add(t);
  }, []);

  return { host, float, layer: <FloatLayer floats={floats} /> };
}
