"use client";

import { handCards, cardName, cardDesc, castBlocker, effectivePower, type Run } from "@/lib/engine";
import { LANGS, type LangId } from "@/lib/lang";
import { SpellCard, BreathPips } from "@/components/fx";
import { cardHint } from "./copy";

export type HandProps = {
  run: Run;
  lang: LangId;
  selected: string | null;
  onSelect: (uid: string) => void;
  /** Listening: clicks are ignored (cards keep their look). */
  locked: boolean;
  onEndTurn: () => void;
  endDisabled: boolean;
};

export default function Hand({ run, lang, selected, onSelect, locked, onEndTurn, endDisabled }: HandProps) {
  const L = LANGS[lang];
  const hand = handCards(run);
  return (
    <section className="mt-6" aria-label="your hand">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-lg">Your hand</h3>
          <BreathPips current={run.breath} max={run.maxBreath} />
          <span className="text-xs text-vellum2">{run.breath} of {run.maxBreath} breath</span>
        </div>
        <button type="button" onClick={onEndTurn} disabled={endDisabled} className="btn-quiet" title="End your turn (E)">
          End turn <kbd className="rounded border border-white/15 px-1 font-sans text-[10px] leading-4 text-vellum2">E</kbd>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-3 sm:justify-start">
        {hand.map(({ card, spell }, i) => (
          <SpellCard
            key={card.uid}
            name={cardName(card, lang)}
            desc={cardDesc(card)}
            element={spell.element}
            kind={spell.kind}
            tier={spell.tier}
            cost={spell.cost}
            power={spell.power > 0 ? effectivePower(card) : undefined}
            up={card.up}
            italic={L.italic}
            hotkey={i < 9 ? String(i + 1) : undefined}
            selected={selected === card.uid}
            disabled={!!castBlocker(run, card.uid)}
            hint={cardHint(run, card, spell)}
            onClick={() => { if (!locked) onSelect(card.uid); }}
          />
        ))}
        {hand.length === 0 && <p className="text-sm text-vellum2">Your hand is empty.</p>}
      </div>
    </section>
  );
}
