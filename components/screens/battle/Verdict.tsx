"use client";

import type { Card, CastResult, Spell } from "@/lib/engine";
import type { Vocab } from "@/data/vocab";
import { LANGS, type LangId } from "@/lib/lang";
import { grade } from "@/lib/scoring";
import { castSentence, MODE_TAG, WHY_TEXT } from "./copy";

export type CastVerdict = {
  seq: number;
  card: Card;
  spell: Spell;
  phrase: Vocab;
  heard: string;
  typed: boolean;          // typing mode: "you typed" instead of "it heard"
  result: CastResult;
  tip: string | null;
  pending: boolean;        // waiting for /api/feedback
  mode: string | null;     // "gemini" | "gemini-text" | "template"
  why: string | null;      // GeminiWhy when the coach did not answer
};

export type VerdictState = { cast: CastVerdict | null; enemyTurn: string | null };

function ScoreRing({ score, backfire }: { score: number; backfire: boolean }) {
  const pct = Math.round(score * 100);
  const ring = backfire ? "#c8494c" : pct >= 90 ? "#e9d27c" : "#f0a35e";
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`score ${pct} of 100`}>
      <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={ring} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} className="transition-[stroke-dasharray] duration-500" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-lg tabular-nums">{pct}</span>
    </div>
  );
}

/** The result of the last cast (kept until the next cast starts) and, after End turn, what the enemy did. */
export default function Verdict({ verdict, lang }: { verdict: VerdictState; lang: LangId }) {
  const L = LANGS[lang];
  const c = verdict.cast;
  const g = c ? grade(c.result.score, lang) : null;
  const why = c?.why ? WHY_TEXT[c.why] ?? "coach unavailable" : null;
  const tag = c?.mode ? MODE_TAG[c.mode] : null;
  return (
    <section className="panel mt-5 px-5 py-4 animate-reveal" aria-live="polite">
      {c && g && (
        <div className="flex items-center gap-5">
          <ScoreRing score={c.result.score} backfire={c.result.backfire} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-snug">
              <span lang={L.speech} className={`${g.color} ${L.italic ? "italic" : ""}`}>{g.label}.</span> {castSentence(c.result, c.card, c.spell, lang)}
            </p>
            <p className="mt-1 text-sm text-vellum2">
              For <span lang={L.speech} className="text-vellum">“{c.phrase.text}”</span> {c.typed ? "you typed" : "it heard"} <span lang={L.speech} className="text-vellum">“{c.heard || "nothing"}”</span>.
              {c.result.grudge && <span className="text-blood"> This word will return.</span>}
            </p>
            <p className="mt-1 text-sm text-shadow">
              {c.pending ? <span className="text-vellum2/80">Coach is listening…</span> : c.tip}
              {tag && <span className="ml-1 text-xs text-vellum2/70">{tag}</span>}
              {why && <span className="ml-1 text-xs text-vellum2/70">· {why}</span>}
            </p>
          </div>
        </div>
      )}
      {verdict.enemyTurn && (
        <p className={`font-display text-base text-vellum ${c ? "mt-3 border-t border-white/5 pt-3" : ""}`}>{verdict.enemyTurn}</p>
      )}
    </section>
  );
}
