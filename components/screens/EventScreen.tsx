"use client";

/**
 * An encounter. Options resolve at once, except trials: a pronunciation check that draws a
 * phrase at the option's level, listens (or reads a typed answer), scores it with the same
 * scorer as a cast, and only then calls `resolveEvent` with the score. Silence is free.
 * Stage "pick" chooses a card for a pending remove/upgrade; stage "done" shows the outcome and
 * the Continue button calls `advance` (the engine leaves that to the UI so the text can be read).
 */
import { useState } from "react";
import { ListeningRing, VuMeter, Ruby, withPinyin } from "@/components/fx";
import { useSpeechCapture } from "@/components/hooks/useSpeechCapture";
import { advance, drawPhrase, eventOptionAvailable, pickEventCard, resolveEvent, type Run } from "@/lib/engine";
import { LANGS, type LangId } from "@/lib/lang";
import type { WordStats } from "@/lib/lexicon";
import { bestMatch, grade, similarityTyped } from "@/lib/scoring";
import { speak, type Capture } from "@/lib/speech";
import { needsFallback, transcribeClip, withFallback } from "@/lib/transcribe";
import { eventById, eventTitle, type EventOption } from "@/data/events";
import type { Vocab } from "@/data/vocab";
import RunHeader from "./RunHeader";
import DeckPicker from "./DeckPicker";

import { TIMEOUT_BY_LEVEL, IDLE_BY_LEVEL, ACCEPT_AT } from "@/lib/speech";   // same capture policy as the battle (SPEECH_GEMINI.md §1)

const LEVEL_WORD = { 1: "word", 2: "phrase", 3: "sentence" } as const;

export type EventScreenProps = {
  run: Run;
  lang: LangId;
  lexicon: Vocab[];
  words: WordStats;
  useTyping: boolean;
  onUseTyping: (v: boolean) => void;
  onRun: (next: Run) => void;
  onWords: (w: WordStats) => void;
};

type Trial = { idx: number; phrase: Vocab };
type TrialResult = { phrase: Vocab; heard: string; score: number; passed: boolean };

const optLabel = (opt: EventOption, lang: LangId) => (lang === "zh" ? opt.zh : opt.label);

/** Why `eventOptionAvailable` said no, in the player's words. */
function whyUnavailable(run: Run, opt: EventOption): string {
  const fx = opt.effects ?? [];
  const cost = fx.reduce((a, f) => a + (f.kind === "ink" && f.amount < 0 ? -f.amount : 0), 0);
  if (cost > run.ink) return "not enough ink";
  if (fx.some((f) => f.kind === "remove") && run.deck.length <= 1) return "nothing to remove";
  if (fx.some((f) => f.kind === "upgrade") && !run.deck.some((c) => !c.up)) return "nothing to upgrade";
  return "unavailable";
}

function ScoreLine({ result, lang }: { result: TrialResult; lang: LangId }) {
  const L = LANGS[lang];
  const pct = Math.round(result.score * 100);
  const g = grade(result.score, lang);
  const ring = pct >= 90 ? "#e9d27c" : result.passed ? "#f0a35e" : "#c8494c";
  return (
    <div className="mx-auto flex max-w-md items-center gap-4 text-left animate-reveal">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={ring} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-lg text-vellum">{pct}</span>
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg"><Ruby text={`${g.label}.`} lang={lang} className={g.color} italic={L.italic} /></p>
        <p className="text-sm text-vellum2">
          For <span lang={L.speech} className={`text-vellum ${L.italic ? "italic" : ""}`}>“{withPinyin(result.phrase.text, lang)}”</span> it heard “{result.heard ? withPinyin(result.heard, lang) : "nothing"}”.
        </p>
      </div>
    </div>
  );
}

export default function EventScreen({ run, lang, lexicon, words, useTyping, onUseTyping, onRun, onWords }: EventScreenProps) {
  const L = LANGS[lang];
  const ev = run.event ? eventById(run.event.id) : undefined;
  const stage = run.event?.stage ?? "choose";
  const mic = useSpeechCapture();
  const [trial, setTrial] = useState<Trial | null>(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [offerTyping, setOfferTyping] = useState(false);
  const [result, setResult] = useState<TrialResult | null>(null);

  function openTrial(idx: number, opt: EventOption) {
    if (!opt.trial) return;
    setTrial({ idx, phrase: drawPhrase(run, { level: opt.trial.level }, lexicon) });
    setNote(null); setTyped(""); setOfferTyping(false);
  }
  function closeTrial() {
    if (mic.listening) mic.stop();
    setTrial(null); setNote(null); setOfferTyping(false);
  }

  /** Trials are practice: the word's mastery record moves, then the engine applies the option. */
  function finish(t: Trial, score: number, heard: string) {
    const threshold = ev?.options[t.idx]?.trial?.threshold ?? 0;
    const prev = words[t.phrase.id];
    onWords({ ...words, [t.phrase.id]: { casts: (prev?.casts ?? 0) + 1, sum: (prev?.sum ?? 0) + score } });
    setResult({ phrase: t.phrase, heard, score, passed: score >= threshold });
    setTrial(null); setNote(null);
    onRun(resolveEvent(run, t.idx, score));
  }

  async function attempt() {
    if (!trial) return;
    if (useTyping) {
      const text = typed.trim();
      if (!text) return;
      finish(trial, similarityTyped(text, trial.phrase.text, L.tokens), text);
      return;
    }
    if (mic.listening) { mic.stop(); return; }   // "press to cast, press again to finish"
    setNote(null);
    const target = trial.phrase;
    let cap: Capture = await mic.start(L.speech, {
      timeoutMs: TIMEOUT_BY_LEVEL[target.level],
      idleMs: IDLE_BY_LEVEL[target.level],
      accept: (alts) => bestMatch(alts, target.text, L.tokens).score >= ACCEPT_AT,
    });
    if (needsFallback(cap)) {
      // same second ear as the battle: Gemini transcribes a voiced clip the recognizer ignored, the scorer decides
      setNote("Chrome missed that short word; Gemini is listening to the clip…");
      const ear = await transcribeClip(cap.audio!, lang);
      setNote(null);
      if (ear.transcript) cap = withFallback(cap, ear.transcript);
    }
    switch (cap.reason) {
      case "silence":
      case "timeout":
        setNote("I didn't hear anything — try again.");
        return;
      case "unsupported":
        onUseTyping(true);
        setNote(cap.error ?? "This browser can't hear you. Type the incantation instead.");
        return;
      case "error":
        setNote(cap.error ?? "The microphone failed.");
        setOfferTyping(true);
        return;
      case "result":
      case "stopped": {
        const best = bestMatch(cap.alts, trial.phrase.text, L.tokens);
        finish(trial, best.score, best.transcript);
      }
    }
  }

  if (!ev || !run.event) {
    return (
      <div className="animate-reveal">
        <RunHeader run={run} lang={lang} />
        <div className="panel mt-10 p-6 text-center text-vellum2">
          Nothing happens here.
          <button type="button" onClick={() => onRun(advance(run))} className="btn-quiet ml-3">Continue</button>
        </div>
      </div>
    );
  }

  const trialOpt = trial ? ev.options[trial.idx] : undefined;

  return (
    <div className="animate-reveal">
      <RunHeader run={run} lang={lang} />

      <section className="mt-10 text-center">
        <p className="text-[10px] uppercase tracking-[.2em] text-shadow">event</p>
        <h2 className="mt-2 text-balance font-display text-4xl font-light text-vellum"><Ruby text={eventTitle(ev, lang)} lang={lang} italic={L.italic} /></h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-vellum2">{ev.body}</p>
      </section>

      {stage === "choose" && !trial && (
        <div className="mx-auto mt-8 grid max-w-xl gap-3">
          {ev.options.map((opt, i) => {
            const ok = eventOptionAvailable(run, i);
            const why = ok ? null : whyUnavailable(run, opt);
            return (
              <button
                key={i} type="button" disabled={!ok}
                onClick={() => (opt.trial ? openTrial(i, opt) : onRun(resolveEvent(run, i)))}
                className="panel flex flex-col items-start gap-1 px-5 py-4 text-left transition hover:bg-dusk2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-dusk/80"
              >
                <span className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-display text-xl text-vellum"><Ruby text={optLabel(opt, lang)} lang={lang} italic={L.italic} /></span>
                  {opt.trial && (
                    <span className="rounded-full bg-shadow/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-shadow">
                      trial · level {opt.trial.level}
                    </span>
                  )}
                </span>
                <span className="text-sm text-vellum2">
                  {opt.detail}
                  {why && <span className="text-blood"> — {why}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {stage === "choose" && trial && trialOpt?.trial && (
        <section className="mx-auto mt-8 max-w-xl text-center">
          <p className="text-xs text-vellum2">
            <Ruby text={optLabel(trialOpt, lang)} lang={lang} italic={L.italic} className="text-vellum" />
            {" · "}say this {LEVEL_WORD[trial.phrase.level]} at {Math.round(trialOpt.trial.threshold * 100)}% or better
            {run.grudges.includes(trial.phrase.id) && <span className="text-blood"> · a word that beat you</span>}
          </p>
          <h3
            key={trial.phrase.id}
            className={`mt-3 text-balance font-display text-5xl font-light leading-tight tracking-tight md:text-6xl ${L.italic ? "italic" : ""} ${mic.listening ? "animate-breathe text-ember" : "text-vellum"}`}
          >
            {trial.phrase.text}
          </h3>
          {trial.phrase.reading && <p className="mt-1 font-display text-xl text-ember/90">{trial.phrase.reading}</p>}
          <p className="mt-2 text-sm text-vellum2">“{trial.phrase.en}”{trial.phrase.focus ? ` · watch the ${trial.phrase.focus}` : ""}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {useTyping ? (
              <form onSubmit={(e) => { e.preventDefault(); void attempt(); }} className="flex w-full max-w-md gap-2">
                <input
                  autoFocus className="input" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type the incantation"
                  placeholder={L.hasReading ? "type the characters, or pinyin like xia4 yu3 le" : "type the incantation"}
                />
                <button type="submit" className="btn-ember" disabled={!typed.trim()}>Cast</button>
              </form>
            ) : (
              <ListeningRing active={mic.listening} level={mic.level}>
                <button type="button" onClick={() => void attempt()} className="btn-ember px-7 py-3 text-base">
                  {mic.listening ? "Stop" : "Cast"}
                </button>
              </ListeningRing>
            )}
            <button type="button" onClick={() => speak(trial.phrase.text, L.speech)} className="btn-quiet">Hear it</button>
            <button type="button" onClick={closeTrial} className="btn-quiet">Back</button>
          </div>

          {!useTyping && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <VuMeter level={mic.level} active={mic.listening} />
              <p className={`h-4 text-xs ${mic.heard ? "text-ember/80" : "text-vellum2"}`} role="status" aria-live="polite">
                {mic.listening ? (mic.heard ? `hearing: ${mic.heard} …` : "Listening — say it now; it stops by itself, or press Stop.") : ""}
              </p>
            </div>
          )}
          {note && (
            <p className="mt-3 text-sm text-ember" role="status">
              {note}
              {offerTyping && (
                <button type="button" onClick={() => { onUseTyping(true); setOfferTyping(false); setNote(null); }} className="btn-quiet ml-3 px-3 py-1 text-xs">
                  Type instead
                </button>
              )}
            </p>
          )}
        </section>
      )}

      {stage === "pick" && run.event.pending && (
        <DeckPicker
          run={run} lang={lang}
          title={run.event.pending === "remove" ? "Forget which card?" : "Upgrade which card?"}
          note={run.event.outcome}
          filter={run.event.pending === "upgrade" ? (c) => !c.up : undefined}
          filteredHint="already +"
          onPick={(uid) => onRun(pickEventCard(run, uid))}
        />
      )}

      {stage === "done" && (
        <section className="mx-auto mt-8 max-w-xl text-center">
          {result && <div className="mb-5"><ScoreLine result={result} lang={lang} /></div>}
          <p className="panel px-6 py-5 font-display text-xl text-vellum">{withPinyin(run.event.outcome ?? "Nothing happens.", lang)}</p>
          <button type="button" onClick={() => onRun(advance(run))} className="btn-ember mt-6 px-8 py-3 text-base">Continue</button>
        </section>
      )}
    </div>
  );
}
