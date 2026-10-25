"use client";

/** A "?" that opens the Handbook from any screen. It raises a window event so headers need no callback plumbing; Game.tsx listens. */
export const HANDBOOK_EVENT = "incantation:handbook";

export function openHandbook() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(HANDBOOK_EVENT));
}

/** "Back to the title" from any run screen; Game.tsx listens. The run is autosaved, so nothing is lost. */
export const MENU_EVENT = "incantation:menu";
export function MenuButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button" onClick={() => window.dispatchEvent(new CustomEvent(MENU_EVENT))} aria-label="Back to the title"
      title="Back to the title. The run is saved; Continue picks it up."
      className={`inline-flex h-7 items-center justify-center rounded-full bg-white/5 px-2.5 text-xs font-semibold text-vellum2 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-vellum focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${className}`}
    >
      Menu
    </button>
  );
}

export type HelpButtonProps = { label?: string; className?: string };

export default function HelpButton({ label, className = "" }: HelpButtonProps) {
  return (
    <button
      type="button" onClick={openHandbook} aria-label="Open the handbook" title="Handbook: symbols, resources, the map (?)"
      className={`inline-flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-full bg-white/5 px-2 text-xs font-semibold text-vellum2 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-vellum focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${className}`}
    >
      <span className="font-display text-sm leading-none" aria-hidden>?</span>
      {label && <span>{label}</span>}
    </button>
  );
}
