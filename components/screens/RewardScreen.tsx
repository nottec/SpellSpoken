"use client";

/** After a won battle: one spell (three offered), then for elites and bosses one relic. The engine advances by itself. */
import { useEffect } from "react";
import { SpellCard } from "@/components/fx";
import { advance, pendingReward, takeCard, takeRelic, type Run } from "@/lib/engine";
import { LANGS, type LangId } from "@/lib/lang";
import { spellName } from "@/data/spells";
import { relicName } from "@/data/relics";
import RunHeader from "./RunHeader";

export type RewardScreenProps = { run: Run; lang: LangId; onRun: (next: Run) => void };

export default function RewardScreen({ run, lang, onRun }: RewardScreenProps) {
  const L = LANGS[lang];
  const stage = pendingReward(run);
  const rw = run.rewards;
  const count = stage === "card" ? rw?.cards.length ?? 0 : stage === "relic" ? rw?.relics.length ?? 0 : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (!(n >= 1 && n <= count)) return;
      if (stage === "card") onRun(takeCard(run, n - 1));
      else if (stage === "relic") onRun(takeRelic(run, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, stage, count, onRun]);

  return (
    <div className="animate-reveal">
      <RunHeader run={run} lang={lang} />

      <p className="mt-10 text-center text-sm text-vellum2">
        {run.enemy ? `The ${run.enemy.gloss} is gone.` : "The enemy is gone."}{rw?.ink ? ` +${rw.ink} ink.` : ""}
      </p>

      {stage === "card" && rw && (
        <>
          <h2 className="mt-1 text-center font-display text-4xl font-light italic text-vellum">Take one spell.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {rw.cards.map((s, i) => (
              <SpellCard
                key={`${s.id}-${i}`}
                name={spellName(s, lang)} desc={s.desc} element={s.element} kind={s.kind} tier={s.tier} cost={s.cost}
                power={s.power || undefined} italic={L.italic} hint={s.rarity !== "common" ? s.rarity : undefined}
                hotkey={String(i + 1)} onClick={() => onRun(takeCard(run, i))}
              />
            ))}
          </div>
          <div className="mt-6 text-center">
            <button type="button" onClick={() => onRun(takeCard(run, null))} className="btn-quiet">Take none</button>
          </div>
        </>
      )}

      {stage === "relic" && rw && (
        <>
          <h2 className="mt-1 text-center font-display text-4xl font-light italic text-vellum">Take one relic.</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {rw.relics.map((x, i) => (
              <button
                key={x.id} type="button" onClick={() => onRun(takeRelic(run, i))}
                className="panel flex flex-col p-5 text-left transition hover:bg-dusk2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70"
              >
                <span className="flex items-baseline justify-between text-xs text-vellum2">
                  <span>Relic</span>
                  <kbd className="rounded border border-white/15 px-1 font-sans text-[10px] leading-4">{i + 1}</kbd>
                </span>
                <span className={`mt-1 font-display text-2xl text-vellum ${L.italic ? "italic" : ""}`}>
                  <span aria-hidden>{x.emoji}</span> {relicName(x, lang)}
                </span>
                <span className="text-xs text-vellum2">{x.gloss}</span>
                <span className="mt-2 text-sm text-vellum">{x.desc}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 text-center">
            <button type="button" onClick={() => onRun(takeRelic(run, null))} className="btn-quiet">Take none</button>
          </div>
        </>
      )}

      {!stage && (
        <div className="mt-6 text-center">
          <button type="button" onClick={() => onRun(advance(run))} className="btn-ember px-8 py-3 text-base">Continue</button>
        </div>
      )}
    </div>
  );
}
