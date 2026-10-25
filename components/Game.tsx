"use client";

/**
 * TEMPORARY orchestrator so the project builds while the screens are rebuilt (phase 2).
 * It starts a run, walks straight into the first fight and renders <Battle>; every other phase
 * is a bare "Continue" button. The screens agent replaces this file wholesale.
 */
import { useEffect, useState } from "react";
import { newRun, chooseNode, takeCard, takeRelic, advance, rest, leaveShop, resolveEvent, pendingReward, type Run } from "@/lib/engine";
import { LANGS, loadLang, saveLang, type LangId } from "@/lib/lang";
import { fullLexicon, loadWords, saveWords, type WordStats } from "@/lib/lexicon";
import { speechSupported } from "@/lib/speech";
import type { Vocab } from "@/data/vocab";
import Battle, { type CastInfo } from "./screens/Battle";

export default function Game() {
  const [run, setRun] = useState<Run | null>(null);
  const [lang, setLang] = useState<LangId>("es");
  const [lexicon, setLexicon] = useState<Vocab[]>([]);
  const [words, setWords] = useState<WordStats>({});
  const [useTyping, setUseTyping] = useState(false);
  const [, setLast] = useState<CastInfo | null>(null);

  useEffect(() => {
    const l = loadLang(); setLang(l); setLexicon(fullLexicon(l)); setWords(loadWords(l));
    if (!speechSupported()) setUseTyping(true);
  }, []);

  function switchLang(l: LangId) { setLang(l); saveLang(l); setLexicon(fullLexicon(l)); setWords(loadWords(l)); }
  function start() { setRun(chooseNode(newRun(), 0)); }

  if (!run) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
        <h1 className="font-display text-6xl font-light italic">Incantation</h1>
        <div className="flex gap-2">
          {(Object.keys(LANGS) as LangId[]).map((l) => (
            <button key={l} onClick={() => switchLang(l)} className={lang === l ? "btn-ember" : "btn-quiet"}>{LANGS[l].label}</button>
          ))}
        </div>
        <button onClick={start} className="btn-ember px-8 py-3 text-base">Begin the run</button>
      </div>
    );
  }

  if (run.phase === "battle") {
    return (
      <Battle run={run} lang={lang} lexicon={lexicon} words={words} useTyping={useTyping} onUseTyping={setUseTyping}
        onRun={setRun} onWords={(w) => { setWords(w); saveWords(lang, w); }} onCast={setLast} />
    );
  }

  // every other phase: a bare continue so a dev loop can keep going
  const next = () => {
    if (run.phase === "reward") { const p = pendingReward(run); setRun(p === "card" ? takeCard(run, 0) : p === "relic" ? takeRelic(run, 0) : advance(run)); }
    else if (run.phase === "map") setRun(chooseNode(run, 0));
    else if (run.phase === "rest") setRun(rest(run, "heal"));
    else if (run.phase === "merchant") setRun(leaveShop(run));
    else if (run.phase === "event") setRun(run.event?.stage === "done" ? advance(run) : resolveEvent(run, run.event?.stage === "choose" ? 1 : 0));
    else setRun(null);
  };
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-vellum2">phase: {run.phase} · floor {run.floor + 1} · hp {run.hp}/{run.maxHp} · ink {run.ink}</p>
      <button onClick={next} className="btn-ember">{run.phase === "dead" || run.phase === "won" ? "Back to title" : "Continue"}</button>
    </div>
  );
}
