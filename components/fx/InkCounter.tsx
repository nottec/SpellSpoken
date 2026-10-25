"use client";

import { useEffect, useRef, useState } from "react";

export type InkCounterProps = { value: number; delta?: number; className?: string };

/** Ink (currency) with a brief +N / −N whenever `delta` is set and the value or delta changes. */
export default function InkCounter({ value, delta, className = "" }: InkCounterProps) {
  const [pop, setPop] = useState<{ id: number; v: number } | null>(null);
  const seq = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (!delta) return;
    const id = ++seq.current;
    setPop({ id, v: delta });
    const t = setTimeout(() => setPop((p) => (p?.id === id ? null : p)), 1300);
    return () => clearTimeout(t);
  }, [value, delta]);

  return (
    <span className={`relative inline-flex items-center gap-1.5 font-display text-base text-vellum ${className}`} title={`${value} ink`} aria-label={`${value} ink`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
        <path d="M8 1.2C6 4.6 3.6 7 3.6 10.2a4.4 4.4 0 0 0 8.8 0C12.4 7 10 4.6 8 1.2Z" fill="#b19ad9" />
        <path d="M6 10.6a2 2 0 0 0 1.4 1.9" stroke="#ece2cd" strokeWidth="1" strokeLinecap="round" fill="none" opacity=".7" />
      </svg>
      <span className="tabular-nums">{value}</span>
      {pop && (
        <span key={pop.id} className={`fx-pop font-display text-sm font-semibold ${pop.v > 0 ? "text-moss" : "text-blood"}`} aria-hidden>
          {pop.v > 0 ? `+${pop.v}` : `−${Math.abs(pop.v)}`}
        </span>
      )}
    </span>
  );
}
