import type { ReactNode } from "react";

export type VuMeterProps = { level: number; active: boolean; className?: string };
export type ListeningRingProps = { active: boolean; level: number; className?: string; children?: ReactNode };

const BELL = [0.35, 0.55, 0.78, 0.92, 1, 0.92, 0.78, 0.55, 0.35];
const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Nine ember bars following `level` (0..1); CSS transitions do the smoothing. Dim when inactive. */
export function VuMeter({ level, active, className = "" }: VuMeterProps) {
  const l = clamp(level);
  return (
    <span
      className={`inline-flex h-7 items-end gap-[3px] transition-opacity duration-300 ${active ? "" : "opacity-40"} ${className}`}
      role="img" aria-label={active ? `input level ${Math.round(l * 100)}%` : "microphone idle"}
    >
      {BELL.map((b, i) => {
        const wobble = 1 + 0.12 * Math.sin(i * 2.3 + l * 40);
        const v = active ? Math.min(1, l * 1.6 * b * wobble) : 0;
        return (
          <span
            key={i} className="w-1.5 rounded-full bg-ember transition-[height,opacity] duration-150 ease-out"
            style={{ height: `${12 + 88 * v}%`, opacity: active ? 0.4 + 0.6 * v : 0.35 }}
          />
        );
      })}
    </span>
  );
}

/**
 * Two ember rings that swell with the mic level. Without children it renders only the rings
 * (absolute, inset-0) for you to drop inside a `relative` wrapper around your button; with
 * children it wraps them for you.
 */
export function ListeningRing({ active, level, className = "", children }: ListeningRingProps) {
  const l = clamp(level);
  const rings = (
    <>
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-full border-2 border-ember/70 transition-[transform,opacity] duration-100 ease-out ${active ? "opacity-100" : "opacity-0"}`}
        style={{ transform: `scale(${1.04 + l * 0.22})` }}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-full border border-ember/30 transition-[transform,opacity,box-shadow] duration-150 ease-out ${active ? "opacity-100" : "opacity-0"}`}
        style={{ transform: `scale(${1.12 + l * 0.55})`, boxShadow: `0 0 ${12 + l * 30}px rgba(240,163,94,${0.15 + l * 0.35})` }}
      />
    </>
  );
  if (children === undefined) return rings;
  return (
    <span className={`relative inline-flex ${className}`}>
      {rings}
      <span className="relative">{children}</span>
    </span>
  );
}
