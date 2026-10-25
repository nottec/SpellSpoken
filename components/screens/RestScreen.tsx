"use client";

/** A rest site: heal, study (upgrade a card) or forget (remove one). Each choice leaves the room. */
import { useState } from "react";
import { DOOR_META, Ruby } from "@/components/fx";
import { rest, REST_HEAL, type Run } from "@/lib/engine";
import { LANGS, REST_LABEL, localName, type LangId } from "@/lib/lang";
import RunHeader from "./RunHeader";
import DeckPicker from "./DeckPicker";

export type RestScreenProps = { run: Run; lang: LangId; onRun: (next: Run) => void };

export default function RestScreen({ run, lang, onRun }: RestScreenProps) {
  const L = LANGS[lang];
  const [picker, setPicker] = useState<"study" | "forget" | null>(null);
  const heal = Math.max(0, Math.min(Math.round(run.maxHp * REST_HEAL), run.maxHp - run.hp));
  const canStudy = run.deck.some((c) => !c.up);
  const canForget = run.deck.length > 1;

  const choices: { key: string; title: string; line: string; ok: boolean; onClick: () => void }[] = [
    { key: "heal", title: "Heal", line: heal > 0 ? `Sleep by the fire. Recover ${heal} life (${run.hp} → ${run.hp + heal}).` : "Sleep by the fire. You are already whole.", ok: true, onClick: () => onRun(rest(run, "heal")) },
    { key: "study", title: "Study", line: canStudy ? "Read one card again: +30% power, and a stronger status on it." : "Every card is already upgraded.", ok: canStudy, onClick: () => setPicker("study") },
    { key: "forget", title: "Forget", line: canForget ? "Tear one card out of your book for good." : "You cannot forget your last card.", ok: canForget, onClick: () => setPicker("forget") },
  ];

  return (
    <div className="animate-reveal">
      <RunHeader run={run} lang={lang} />

      <section className="mt-10 text-center">
        <svg
          viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          className="mx-auto text-moss animate-flicker" style={{ filter: "drop-shadow(0 0 10px rgba(143,185,138,.55))" }} aria-hidden
        >
          {DOOR_META.rest.icon}
        </svg>
        <h2 className="mt-3 font-display text-4xl font-light text-vellum"><Ruby text={localName(REST_LABEL, lang)} lang={lang} italic={L.italic} /></h2>
        <p className="mt-2 text-sm text-vellum2">A quiet room with a fire.</p>
      </section>

      <div className="mx-auto mt-8 grid max-w-2xl gap-3 md:grid-cols-3">
        {choices.map((c) => (
          <button
            key={c.key} type="button" disabled={!c.ok} onClick={c.onClick}
            className="panel flex flex-col items-start p-5 text-left transition hover:bg-dusk2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-dusk/80"
          >
            <span className="font-display text-2xl italic text-vellum">{c.title}</span>
            <span className="mt-2 text-sm text-vellum2">{c.line}</span>
          </button>
        ))}
      </div>

      {picker === "study" && (
        <DeckPicker
          run={run} lang={lang} title="Study which card?" filter={(c) => !c.up} filteredHint="already +"
          onPick={(uid) => onRun(rest(run, "study", uid))} onClose={() => setPicker(null)}
        />
      )}
      {picker === "forget" && (
        <DeckPicker
          run={run} lang={lang} title="Forget which card?"
          onPick={(uid) => onRun(rest(run, "forget", uid))} onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
