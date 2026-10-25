"use client";

/** The first thing judges see. Calm: a title, a language, one paragraph, one button. */
import type { Run } from "@/lib/engine";
import { FLOORS } from "@/lib/engine";
import { LANGS, type LangId } from "@/lib/lang";
import { isWordMastered, type WordStats } from "@/lib/lexicon";
import type { Vocab } from "@/data/vocab";

export type TitleProps = {
  lang: LangId;
  onLang: (l: LangId) => void;
  lexicon: Vocab[];
  words: WordStats;
  /** A run saved for this language, if any. */
  saved: Run | null;
  onContinue: () => void;
  onBegin: () => void;
  micOk: boolean;
  useTyping: boolean;
  onUseTyping: (v: boolean) => void;
};

const HOW_TO = [
  "Each turn you have 3 breath. Cards cost breath; say the words to cast, and the better you say them, the harder they hit.",
  "Chain one element for +15% a step, or pair them: fire after wind is wildfire, water after fire is steam.",
  "Words that beat you come back until you beat them; three clean casts master a word for good.",
];

export default function Title({ lang, onLang, lexicon, words, saved, onContinue, onBegin, micOk, useTyping, onUseTyping }: TitleProps) {
  const L = LANGS[lang];
  const ids = Object.keys(words);
  const practiced = ids.length;
  const mastered = ids.filter((id) => isWordMastered(words, id)).length;
  const savedFloor = saved ? Math.min(saved.floor + 1, FLOORS) : 0;

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center text-center animate-reveal">
      <h1 className="font-display text-6xl font-light italic tracking-tight text-vellum animate-flicker md:text-8xl">Incantation</h1>
      <p className="mt-5 max-w-md text-balance text-vellum2">
        Spells are effects. The words are drawn fresh from a lexicon of {lexicon.length} {L.english} entries, and it grows as you fight.
        Say them well and they hit hard. Mumble and they burn you. Eight floors, one life.
      </p>

      <div className="mt-8 flex gap-2" role="radiogroup" aria-label="Language">
        {(Object.keys(LANGS) as LangId[]).map((l) => (
          <button
            key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => onLang(l)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${lang === l ? "bg-vellum text-ink" : "bg-white/5 text-vellum2 hover:bg-white/10"}`}
          >
            {LANGS[l].label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {saved && (
          <button type="button" onClick={onContinue} className="btn-ember px-8 py-3 text-base">
            Continue the run (floor {savedFloor})
          </button>
        )}
        <button type="button" onClick={onBegin} className={`${saved ? "btn-quiet" : "btn-ember"} px-8 py-3 text-base`}>Begin the run</button>
      </div>

      <div className="mt-12 grid max-w-md gap-2 text-sm text-vellum2">
        {HOW_TO.map((line) => <p key={line}>{line}</p>)}
      </div>

      <div className="mt-8 grid gap-2 text-sm text-vellum2">
        {practiced > 0 && (
          <p className="text-vellum">{practiced} {practiced === 1 ? "word" : "words"} practiced, {mastered} mastered.</p>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2">
          <input type="checkbox" className="accent-ember" checked={useTyping} onChange={(e) => onUseTyping(e.target.checked)} disabled={!micOk} />
          type instead of speak
        </label>
        {!micOk && <p className="text-ember">This browser can&apos;t hear you. Typing mode is on; open Chrome for voice.</p>}
      </div>
    </div>
  );
}
