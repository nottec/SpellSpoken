"use client";

import type { ReactElement, RefObject } from "react";
import { cardName, previewCast, resonanceAt, REACTION_TEXT, type Card, type Run, type Spell } from "@/lib/engine";
import type { Vocab } from "@/data/vocab";
import { isWordMastered, type WordStats } from "@/lib/lexicon";
import { LANGS, elementLabel, type LangId } from "@/lib/lang";
import { ListeningRing, VuMeter, Sigil, Ruby } from "@/components/fx";
import { syllables } from "@/lib/scoring";
import { EL_TEXT } from "./copy";

export type Notice = { text: string; offerTyping?: boolean };

export type IncantationProps = {
  run: Run;
  lang: LangId;
  card: Card | null;
  spell: Spell | null;
  phrase: Vocab | null;
  words: WordStats;
  listening: boolean;
  level: number;
  /** Live interim transcript while listening (useSpeechCapture().heard); "" when nothing yet. */
  heard: string;
  busy: boolean;
  /** Why the selected card cannot be cast right now (castBlocker), or null. */
  blocker: string | null;
  useTyping: boolean;
  onUseTyping: (v: boolean) => void;
  typed: string;
  onTyped: (s: string) => void;
  onCast: () => void;
  onStop: () => void;
  onHear: () => void;
  onRedraw: () => void;
  notice: Notice | null;
  /** From useFloatText(): shield / heal / self-damage numbers rise here. */
  host: RefObject<HTMLDivElement | null>;
  layer: ReactElement;
};

const Key = ({ k }: { k: string }) => <kbd className="rounded border border-white/15 px-1 font-sans text-[10px] leading-4 text-vellum2">{k}</kbd>;

/** The hero: the phrase to say, its reading and meaning, the Cast / Stop / Hear it / Redraw controls, resonance and chain. */
export default function Incantation(p: IncantationProps) {
  const { run, lang, card, spell, phrase, words, listening, level, heard, busy, blocker, useTyping, typed, notice } = p;
  const L = LANGS[lang];
  const at = resonanceAt(run);
  const preview = spell ? previewCast(run, spell) : null;
  const ready = !!card && !!spell && !!phrase;

  return (
    <section ref={p.host} className="relative mt-3 text-center" aria-label="the incantation">
      {ready && card && spell && phrase ? (
        <div key={`${card.uid}:${phrase.id}`} className="animate-reveal">
          {/* One row: the card being cast, then the tag. The phrase below is upright, so it never reads like the card's italic name. */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-vellum2">
            <p>
              casting <Ruby text={cardName(card, lang)} lang={lang} italic={L.italic} className="font-display text-sm text-vellum" />
              {run.cursed && <span className="text-shadow"> · cursed, one level harder</span>}
              {run.grudges.includes(phrase.id) && <span className="text-blood"> · a word that beat you</span>}
              {isWordMastered(words, phrase.id) && <span className="text-light"> · mastered</span>}
            </p>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-ember/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.22em] text-ember ring-1 ring-ember/30">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><rect x="5.5" y="1.5" width="5" height="8" rx="2.5" /><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2M5.5 14.5h5" /></svg>
              say this to cast
            </p>
          </div>
          <h1
            lang={L.speech}
            className={`mt-1 text-balance font-display text-4xl font-normal leading-tight tracking-tight md:text-5xl ${listening ? "animate-breathe text-ember" : "text-vellum"}`}
          >
            {phrase.text}
          </h1>
          {phrase.reading && <p className="mt-0.5 font-display text-lg text-ember/90">{phrase.reading}</p>}
          <p className="mt-1 text-sm text-vellum2">“{phrase.en}”{phrase.focus ? ` · watch the ${phrase.focus}` : ""}</p>
          {!useTyping && L.hasReading && syllables(phrase.text).length === 1 && (
            <p className="mt-1 text-xs text-vellum2/80">
              one syllable: Chrome hears it best said twice, <span lang={L.speech} className="text-vellum">{phrase.text} {phrase.text}</span>, which scores as once
            </p>
          )}
          {listening && !useTyping && (
            <p className="mt-2 min-h-5 text-sm text-ember/80" role="status" aria-live="polite">
              {heard ? <>hearing: <span lang={L.speech} className={`text-ember ${L.italic ? "italic" : ""}`}>{heard}</span> …</> : "listening…"}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            {useTyping ? (
              <form onSubmit={(e) => { e.preventDefault(); p.onCast(); }} className="flex w-full max-w-md gap-2">
                <input
                  autoFocus
                  className="input"
                  value={typed}
                  onChange={(e) => p.onTyped(e.target.value)}
                  placeholder={L.hasReading ? "type the characters, or pinyin like xia4 yu3 le" : "type the incantation"}
                  aria-label="Type the incantation"
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  lang={L.speech}
                />
                <button type="submit" className="btn-ember" disabled={busy || !!blocker || !typed.trim()} title={blocker ?? "Cast (Enter)"}>Cast</button>
              </form>
            ) : (
              <ListeningRing active={listening} level={level}>
                {listening ? (
                  <button type="button" onClick={p.onStop} className="btn-ember px-7 py-3 text-base" title="Stop listening and score what was heard (Space)">Stop</button>
                ) : (
                  <button type="button" onClick={p.onCast} disabled={busy || !!blocker} className="btn-ember px-7 py-3 text-base" title={blocker ?? "Cast (Space)"}>Cast</button>
                )}
              </ListeningRing>
            )}
            <button type="button" onClick={p.onHear} disabled={listening} className="btn-quiet" title="Hear it (H)">Hear it</button>
            <button type="button" onClick={p.onRedraw} disabled={busy || listening || run.redrawsLeft <= 0} className="btn-quiet" title="Draw a different incantation, no penalty (R)">
              Redraw ({run.redrawsLeft} left)
            </button>
            {listening && <VuMeter level={level} active={listening} />}   {/* not rendered while idle, so the Cast · Hear it · Redraw row stays centred */}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-vellum2">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="accent-ember" checked={useTyping} onChange={(e) => p.onUseTyping(e.target.checked)} disabled={listening} /> type instead of speak
            </label>
            <span className="hidden sm:inline"><Key k="?" /> handbook and keys</span>
          </div>

          {notice && (
            <p className="mt-2 text-sm text-ember" role="status">
              {notice.text}
              {notice.offerTyping && <button type="button" className="ml-2 underline decoration-ember/60 underline-offset-2 hover:text-vellum" onClick={() => p.onUseTyping(true)}>Type instead</button>}
            </p>
          )}
        </div>
      ) : (
        <p className={`py-10 font-display text-2xl text-vellum2 ${L.italic ? "italic" : ""}`}>
          {card ? "The grimoire turns its page…" : run.hand.length ? "Nothing left to cast — end your turn." : "Choose a card from your hand."}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-vellum2">
        <span className="inline-flex items-center gap-2">
          Resonance
          <span className="inline-flex gap-1" role="meter" aria-valuenow={Math.min(run.resonance, at)} aria-valuemin={0} aria-valuemax={at} aria-label={`${Math.min(run.resonance, at)} of ${at} resonance`}>
            {Array.from({ length: at }, (_, i) => <span key={i} className={`h-2 w-6 rounded-full transition ${i < run.resonance ? "bg-ember" : "bg-white/10"}`} />)}
          </span>
          <span>{run.resonance >= at ? "charged: next cast crits" : `${at} good casts charge a crit`}</span>
        </span>
        {run.chain >= 2 && run.lastElement && (
          <span className={`inline-flex items-center gap-1 ${EL_TEXT[run.lastElement]}`}>
            · Chain ×{run.chain} <Sigil element={run.lastElement} size={12} /> <Ruby text={elementLabel(run.lastElement, lang)} lang={lang} />
          </span>
        )}
        {preview?.reaction && <span className="text-light">· {REACTION_TEXT[preview.reaction]}</span>}
        {run.discount > 0 && <span className="text-wind">· Tailwind: your next card costs {run.discount} less</span>}
      </div>
      {p.layer}
    </section>
  );
}
