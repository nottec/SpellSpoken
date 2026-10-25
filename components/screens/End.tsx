"use client";

/** Won or dead: the headline, the numbers, and every word the run put in your mouth. */
import { FLOORS, type Run } from "@/lib/engine";
import { FINAL_FLOOR } from "@/lib/map";
import { LANGS, type LangId } from "@/lib/lang";
import { isWordMastered, wordAvg, type WordStats } from "@/lib/lexicon";
import { enemyById, enemyName } from "@/data/enemies";
import type { Vocab } from "@/data/vocab";

export type EndProps = { run: Run; lang: LangId; words: WordStats; lexicon: Vocab[]; onAgain: () => void };

export default function End({ run, lang, words, lexicon, onAgain }: EndProps) {
  const L = LANGS[lang];
  const won = run.phase === "won";
  const s = run.stats;
  const acc = s.casts ? Math.round((s.scoreSum / s.casts) * 100) : 0;
  const finalId = run.map[FINAL_FLOOR]?.[0]?.enemyId;
  const final = run.enemy ?? (finalId ? enemyById(finalId) : undefined);
  const floors = won ? FLOORS : Math.min(run.floor + 1, FLOORS);
  const seen = run.wordsSeen.map((id) => lexicon.find((v) => v.id === id)).filter((v): v is Vocab => !!v);

  const stats: [string, string | number][] = [
    ["floors reached", `${floors} / ${FLOORS}`],
    ["words practiced", run.wordsSeen.length],
    ["average accuracy", `${acc}%`],
    ["perfect casts", s.perfect],
    ["backfires", s.backfires],
    ["longest chain", s.maxChain],
    ["reactions", s.reactions],
    ["ink earned", s.inkEarned],
    ["elites beaten", s.elites],
  ];

  const headline = won ? `${final ? enemyName(final, lang) : "The Forgetting"} is silenced` : "The run ends";

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center animate-reveal">
      <p className="text-sm text-vellum2">{won ? "The last word was yours." : `Floor ${floors} kept you.`}</p>
      <h1 className={`mt-2 text-balance font-display text-5xl font-light text-vellum md:text-6xl ${won && !L.italic ? "" : "italic"}`}>{headline}</h1>

      <div className="mt-10 flex max-w-2xl flex-wrap justify-center gap-x-8 gap-y-5">
        {stats.map(([k, v]) => (
          <div key={k} className="min-w-[88px]">
            <p className="font-display text-3xl text-vellum">{v}</p>
            <p className="text-xs text-vellum2">{k}</p>
          </div>
        ))}
      </div>

      <button type="button" onClick={onAgain} className="btn-ember mt-10 px-8 py-3 text-base">Run again</button>

      {seen.length > 0 && (
        <ul className="mt-10 w-full max-w-md text-left text-sm" aria-label="Words this run">
          {seen.map((v) => {
            const grudge = run.grudges.includes(v.id);
            const mastered = isWordMastered(words, v.id);
            return (
              <li key={v.id} className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2">
                <span className={`min-w-0 font-display text-base text-vellum ${L.italic ? "italic" : ""}`}>
                  {v.text}
                  {v.reading && <span className="ml-2 text-sm not-italic text-ember/80">{v.reading}</span>}
                  <span className="ml-2 text-xs not-italic text-vellum2">{v.en}</span>
                </span>
                <span className={`shrink-0 ${grudge ? "text-blood" : mastered ? "text-light" : "text-vellum2"}`}>
                  {grudge ? "still beats you" : mastered ? "mastered" : `${Math.round(wordAvg(words, v.id) * 100)}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
