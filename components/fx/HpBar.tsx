export type HpBarProps = {
  value: number;
  max: number;
  color?: "moss" | "blood" | "light";
  label?: string;
  /** Trailing pale segment that lingers where life just was (default true). */
  ghost?: boolean;
  className?: string;
};

const FILL = { moss: "bg-moss", blood: "bg-blood", light: "bg-light" } as const;

/** Animated life/armor bar. The fill snaps in 300 ms; the ghost follows 900 ms later, so recent damage reads as a pale tail. */
export default function HpBar({ value, max, color = "moss", label, ghost = true, className = "" }: HpBarProps) {
  const v = Math.max(0, Math.min(value, max));
  const pct = max > 0 ? (v / max) * 100 : 0;
  const low = max > 0 && v / max <= 0.25;
  return (
    <div className={`flex items-center gap-2 text-xs text-vellum2 ${className}`}>
      {label && <span className="shrink-0">{label}</span>}
      <div
        className="relative h-2 min-w-[64px] flex-1 overflow-hidden rounded-full bg-black/40"
        role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={max} aria-label={label ?? "life"}
      >
        {ghost && <div className="absolute inset-y-0 left-0 rounded-full bg-vellum/40 transition-[width] delay-300 duration-[900ms] ease-out" style={{ width: `${pct}%` }} />}
        <div className={`absolute inset-y-0 left-0 rounded-full ${FILL[color]} transition-[width] duration-300 ease-out`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`shrink-0 tabular-nums ${low && color === "moss" ? "text-blood" : "text-vellum"}`}>
        {Math.round(v)}<span className="text-vellum2"> / {max}</span>
      </span>
    </div>
  );
}
