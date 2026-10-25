"use client";

import { useEffect, useState } from "react";
import { onSfxMuted, setSfxMuted, sfxMuted } from "@/lib/sfx";

export type SfxToggleProps = { className?: string };

/** Speaker button that mutes/unmutes the synthesized cues (persisted in localStorage `incantation.sfx`). */
export default function SfxToggle({ className = "" }: SfxToggleProps) {
  // Start unmuted on the server and read the real value after mount so SSR markup matches.
  const [muted, setMuted] = useState(false);
  useEffect(() => { setMuted(sfxMuted()); return onSfxMuted(setMuted); }, []);
  return (
    <button
      type="button" onClick={() => setSfxMuted(!muted)} aria-pressed={muted}
      aria-label={muted ? "Sound is off — turn sound on" : "Sound is on — turn sound off"} title={muted ? "Sound off" : "Sound on"}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${muted ? "text-vellum2/70" : "text-vellum"} ${className}`}
    >
      <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}
