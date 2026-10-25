"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ELEMENT_HEX, rgba, seeded, type Element } from "./types";

export type BurstProps = { element: Element; trigger: number; className?: string };

type Particle = { id: number; dx: number; dy: number; size: number; spark: boolean; delay: number; pale: boolean; angle: number };

const COUNT = 12;

/**
 * Short CSS-only particle burst in the element colour, fired every time `trigger` changes
 * (not on mount). Absolutely positioned over its `relative` parent, pointer-events none.
 */
export default function Burst({ element, trigger, className = "" }: BurstProps) {
  const [parts, setParts] = useState<Particle[]>([]);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const rnd = seeded(trigger * 7919 + 17);
    const ps: Particle[] = Array.from({ length: COUNT }, (_, i) => {
      const a = (i / COUNT) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
      const d = 42 + rnd() * 40;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d - 12;
      return { id: i, dx, dy, size: 6 + rnd() * 6, spark: rnd() < 0.4, delay: rnd() * 80, pale: rnd() < 0.3, angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90 };
    });
    setParts(ps);
    const t = setTimeout(() => setParts([]), 760);
    return () => clearTimeout(t);
  }, [trigger]);

  if (parts.length === 0) return null;
  const c = ELEMENT_HEX[element];
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden>
      <span
        className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle, ${rgba(c, 0.55)}, transparent 70%)`, animation: "fxRings .55s ease-out forwards" }}
      />
      {parts.map((p) => (
        <span
          key={`${trigger}-${p.id}`} className="fx-particle"
          style={{
            "--dx": `${p.dx}px`, "--dy": `${p.dy}px`,
            width: p.spark ? 4 : p.size, height: p.spark ? p.size * 2.2 : p.size,
            borderRadius: p.spark ? 2 : 9999,
            background: p.pale ? "#fff4e0" : `radial-gradient(circle at 40% 40%, #fff4e0 0%, ${c} 45%)`,
            boxShadow: `0 0 10px ${rgba(c, 0.9)}`,
            animationDelay: `${p.delay}ms`,
            rotate: p.spark ? `${p.angle}deg` : undefined,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
