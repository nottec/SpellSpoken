export type LogPanelProps = { lines: string[]; max?: number; className?: string };

/** The last few battle-log lines, newest last and brightest. Quiet type. */
export default function LogPanel({ lines, max = 5, className = "" }: LogPanelProps) {
  const shown = lines.slice(-max);
  const offset = lines.length - shown.length;
  return (
    <div className={`rounded-xl bg-black/25 px-3 py-2 ring-1 ring-white/5 ${className}`} role="log" aria-live="polite">
      {shown.length === 0 && <p className="text-xs leading-relaxed text-vellum2/60">Nothing has happened yet.</p>}
      {shown.map((l, i) => {
        const newest = i === shown.length - 1;
        const age = shown.length - 1 - i;
        return (
          <p key={`${offset + i}-${l}`} className={`text-xs leading-relaxed ${newest ? "animate-reveal text-vellum" : "text-vellum2"}`} style={newest ? undefined : { opacity: Math.max(0.3, 0.8 - age * 0.15) }}>
            {l}
          </p>
        );
      })}
    </div>
  );
}
