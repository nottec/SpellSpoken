export type BreathPipsProps = { current: number; max: number; className?: string };

function Gem({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden className={lit ? "drop-shadow-[0_0_6px_rgba(240,163,94,.6)]" : ""}>
      <path d="M8 1 15 8 8 15 1 8Z" className="transition-colors duration-300" fill={lit ? "#f0a35e" : "none"} stroke="#f0a35e" strokeOpacity={lit ? 1 : 0.4} strokeWidth="1.2" />
      <path d="M8 3.6 12.4 8 8 12.4 3.6 8Z" fill="#fbd3a6" className="transition-opacity duration-300" opacity={lit ? 0.55 : 0} />
    </svg>
  );
}

/** Breath (energy) as ember gems; spent ones are hollow. */
export default function BreathPips({ current, max, className = "" }: BreathPipsProps) {
  const n = Math.max(0, Math.max(max, current));
  return (
    <span
      className={`inline-flex cursor-help items-center gap-1 ${className}`} role="meter"
      aria-valuenow={current} aria-valuemin={0} aria-valuemax={max} aria-label={`${current} of ${max} breath`}
      title={`Breath ${current} of ${max}: every card costs breath (the gem on the card); it refills when the turn ends.`}
    >
      {Array.from({ length: n }, (_, i) => <Gem key={i} lit={i < current} />)}
    </span>
  );
}
