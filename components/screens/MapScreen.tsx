"use client";

/** The map: the route so far, this floor's doors (hotkeys 1–3), and a look at the deck. */
import { useEffect, useState } from "react";
import { DoorCard } from "@/components/fx";
import { chooseNode, FLOORS, type MapNode, type Run } from "@/lib/engine";
import { BOSS_FLOOR, FINAL_FLOOR } from "@/lib/map";
import { LANGS, nodeLabel, type LangId } from "@/lib/lang";
import { enemyById, enemyName } from "@/data/enemies";
import { eventById, eventTitle } from "@/data/events";
import RunHeader from "./RunHeader";
import DeckPicker from "./DeckPicker";

export type MapScreenProps = { run: Run; lang: LangId; onRun: (next: Run) => void };

function door(node: MapNode, lang: LangId): { title: string; subtitle?: string } {
  switch (node.kind) {
    case "fight":
    case "elite":
    case "boss":
    case "final": {
      const e = node.enemyId ? enemyById(node.enemyId) : undefined;
      if (!e) return { title: nodeLabel(node.kind, lang) };
      const tag = node.kind === "elite" ? " · elite" : node.kind === "boss" ? " · boss" : node.kind === "final" ? " · the end" : "";
      return { title: enemyName(e, lang), subtitle: `${e.gloss}${tag}` };
    }
    case "rest":
      return { title: nodeLabel("rest", lang), subtitle: "heal, study or forget" };
    case "event": {
      const ev = node.eventId ? eventById(node.eventId) : undefined;
      return { title: ev ? eventTitle(ev, lang) : nodeLabel("event", lang), subtitle: "an encounter" };
    }
    case "merchant":
      return { title: nodeLabel("merchant", lang), subtitle: "spend ink" };
  }
}

function floorLine(floor: number, doors: number): string {
  if (floor === 0) return "One door, and a fight behind it. Every run begins the same way.";
  if (floor === BOSS_FLOOR) return "Something large waits.";
  if (floor === FINAL_FLOOR) return "The last door. Behind it, everything you have learned is tested.";
  if (doors <= 1) return "One door.";
  return `${doors === 2 ? "Two" : "Three"} doors. Choose one; the others close behind you.`;
}

export default function MapScreen({ run, lang, onRun }: MapScreenProps) {
  const L = LANGS[lang];
  const [deckOpen, setDeckOpen] = useState(false);
  const doors = run.map[run.floor] ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (deckOpen || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const n = Number(e.key);
      if (n >= 1 && n <= doors.length) onRun(chooseNode(run, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, doors.length, deckOpen, onRun]);

  return (
    <div className="animate-reveal">
      <RunHeader run={run} lang={lang} floorLabel={false} onDeck={() => setDeckOpen(true)} />

      <section className="mt-10 text-center">
        <h2 className="font-display text-4xl font-light italic text-vellum">Floor {Math.min(run.floor + 1, FLOORS)} of {FLOORS}</h2>
        <p className="mt-2 text-sm text-vellum2">{floorLine(run.floor, doors.length)}</p>
      </section>

      <section className="mt-8 flex flex-wrap items-start justify-center gap-5" aria-label="Doors">
        {doors.map((node, i) => {
          const d = door(node, lang);
          return (
            <div key={i} className="flex flex-col items-center gap-2">
              <DoorCard kind={node.kind} title={d.title} subtitle={d.subtitle} italic={L.italic} lang={lang} onClick={() => onRun(chooseNode(run, i))} />
              <kbd className="rounded border border-white/15 px-1.5 font-sans text-[10px] leading-4 text-vellum2" aria-label={`hotkey ${i + 1}`}>{i + 1}</kbd>
            </div>
          );
        })}
      </section>

      {deckOpen && <DeckPicker run={run} lang={lang} title="Your deck" onClose={() => setDeckOpen(false)} />}
    </div>
  );
}
