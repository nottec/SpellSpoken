"use client";

/**
 * The first thing judges see. A sky of the lexicon's own words drifting up behind a glowing wordmark,
 * a fan of real spell cards from the deck, one language, one button. Everything moves a little; with
 * `prefers-reduced-motion` the sky is gone and the rest holds still (see the title block in globals.css).
 */
import { FLOORS, cardDesc, cardName, cardTags, spellOfCard, type Card, type Run } from "@/lib/engine";
import { LANGS, type LangId } from "@/lib/lang";
import { isWordMastered, type WordStats } from "@/lib/lexicon";
import type { Vocab } from "@/data/vocab";
import { spells } from "@/data/spells";
import { enemies } from "@/data/enemies";
import { relics } from "@/data/relics";
import { EnemySprite, Ruby, Sigil, SpellCard, HelpButton, type Element } from "@/components/fx";

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

const WORDMARK = "SpellSpoken";

/** Five of the forty spells, one per element, fanned like a hand. The outer two hide on narrow screens. */
const FAN: { spell: string; rot: number; dy: number; outer?: boolean }[] = [
  { spell: "susurro", rot: -16, dy: 28, outer: true },
  { spell: "brisa", rot: -8, dy: 10 },
  { spell: "hoguera", rot: 0, dy: 0 },
  { spell: "tempano", rot: 8, dy: 10 },
  { spell: "destello", rot: 16, dy: 28, outer: true },
];
const demoCard = (spell: string): Card => ({ uid: `title-${spell}`, spell, up: false });

/** Real cards, real rules text, fanned like the hand in battle. Clicking one begins the run. */
function DemoFan({ lang, onPick }: { lang: LangId; onPick: () => void }) {
  const L = LANGS[lang];
  return (
    <div className="flex items-end justify-center" role="group" aria-label="Five of the spells">
      {FAN.map((f, i) => {
        const card = demoCard(f.spell);
        const s = spellOfCard(card);
        return (
          <div
            key={f.spell} className={`title-fan-slot ${f.outer ? "hidden sm:block" : ""}`}
            style={{ transform: `rotate(${f.rot}deg) translateY(${f.dy}px)`, zIndex: 5 - Math.abs(i - 2) }}
          >
            <div className="title-fan-bob" style={{ animationDelay: `${i * 0.45}s` }}>
              <SpellCard
                name={cardName(card, lang)} desc={cardDesc(card)} element={s.element} kind={s.kind} tier={s.tier} cost={s.cost} power={s.power}
                tags={cardTags(card)} italic={L.italic} lang={lang} onClick={onPick} className="w-[112px] sm:w-[150px]"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Title({ lang, onLang, lexicon, words, saved, onContinue, onBegin, micOk, useTyping, onUseTyping }: TitleProps) {
  const L = LANGS[lang];
  const ids = Object.keys(words);
  const practiced = ids.length;
  const mastered = ids.filter((id) => isWordMastered(words, id)).length;
  const savedFloor = saved ? Math.min(saved.floor + 1, FLOORS) : 0;
  const rise = (delay: number) => ({ animationDelay: `${delay}s` });

  const stats: { n: number; label: string; el: Element }[] = [
    { n: lexicon.length, label: "words to master", el: "light" },
    { n: spells.length, label: "spells", el: "fire" },
    { n: enemies.length, label: "enemies", el: "shadow" },
    { n: relics.length, label: "relics", el: "water" },
    { n: FLOORS, label: "floors, one life", el: "wind" },
  ];

  return (
    <div className="relative flex min-h-[85vh] flex-col items-center justify-center text-center">

      <p className="title-rise mb-5 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-vellum2 ring-1 ring-white/10 sm:text-[11px] sm:tracking-[.2em]">
        <span className="h-1.5 w-1.5 rounded-full bg-ember shadow-[0_0_8px_#f0a35e]" aria-hidden />
        HackTX 2026 · a pronunciation roguelike
      </p>

      <div className="relative">
        <div className="title-glow" aria-hidden />
        <h1 className="title-wordmark relative font-display text-6xl font-light italic tracking-tight md:text-8xl" aria-label={WORDMARK}>
          {WORDMARK.split("").map((ch, i) => (
            <span key={i} className="title-letter" style={{ animationDelay: `${0.15 + i * 0.06}s` }} aria-hidden>{ch}</span>
          ))}
        </h1>
      </div>

      <p className="title-rise mt-4 font-display text-2xl text-vellum md:text-3xl" style={rise(0.75)}>
        Speak the spell. <span className="text-ember">Say it right</span>, or it <span className="text-blood">backfires</span>.
      </p>
      <p className="title-rise mt-3 max-w-md text-balance text-vellum2" style={rise(0.9)}>
        Every card is a spell and every spell is a phrase in {L.english}: {lexicon.length} of them, drawn fresh each turn, and the lexicon grows as you fight.
        Say it well and it hits hard. Mumble and it burns you.
      </p>

      <div className="title-rise relative mt-9" style={rise(1.05)}>
        <div className="pointer-events-none absolute -left-40 bottom-6 hidden lg:block" aria-hidden>
          <EnemySprite id="lobo" kind="elite" className="h-36 w-36" />
        </div>
        <DemoFan lang={lang} onPick={onBegin} />
        <div className="pointer-events-none absolute -right-44 bottom-8 hidden lg:block" aria-hidden>
          <EnemySprite id="dragon" kind="boss" className="h-44 w-44" />
        </div>
      </div>

      <div className="title-rise mt-8 flex gap-2" role="radiogroup" aria-label="Language" style={rise(1.15)}>
        {(Object.keys(LANGS) as LangId[]).map((l) => (
          <button
            key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => onLang(l)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${lang === l ? "bg-vellum text-ink" : "bg-white/5 text-vellum2 hover:bg-white/10"}`}
          >
            <Ruby text={LANGS[l].label} lang={l} className="font-display text-base leading-none" />
          </button>
        ))}
      </div>

      <div className="title-rise mt-6 flex flex-wrap items-center justify-center gap-3" style={rise(1.25)}>
        {saved && (
          <button type="button" onClick={onContinue} className="btn-ember title-cta px-8 py-3 text-base">
            Continue the run (floor {savedFloor})
          </button>
        )}
        <button type="button" onClick={onBegin} className={`${saved ? "btn-quiet" : "btn-ember title-cta"} px-9 py-3.5 text-base`}>Begin the run</button>
      </div>

      <ul className="title-rise mt-8 flex max-w-xl flex-wrap justify-center gap-2" style={rise(1.35)} aria-label="What is inside">
        {stats.map((s) => (
          <li key={s.label} className="title-pill">
            <Sigil element={s.el} size={14} />
            <b className="font-display text-sm">{s.n}</b> {s.label}
          </li>
        ))}
        <li className="title-pill">
          <span className="h-2 w-2 rounded-full bg-ember shadow-[0_0_6px_#f0a35e]" aria-hidden />
          Gemini coaches, the scorer judges
        </li>
      </ul>

      <div className="title-rise mt-10 grid gap-2 text-sm text-vellum2" style={rise(1.45)}>
        {practiced > 0 && (
          <p className="text-vellum">{practiced} {practiced === 1 ? "word" : "words"} practiced, {mastered} mastered.</p>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2">
          <input type="checkbox" className="accent-ember" checked={useTyping} onChange={(e) => onUseTyping(e.target.checked)} disabled={!micOk} />
          type instead of speak
        </label>
        {!micOk && <p className="text-ember">This browser can&apos;t hear you. Typing mode is on; open Chrome for voice.</p>}
        <div className="mt-2 flex justify-center">
          <HelpButton label="How to play · symbols · the map" className="px-3 py-1.5 text-sm" />
        </div>
      </div>
    </div>
  );
}
