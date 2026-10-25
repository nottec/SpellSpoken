"use client";

/**
 * The deck as a modal grid of SpellCards. Used to pick a card (rest: study / forget, events,
 * merchant services) and, without `onPick`, to simply look at the deck from the map.
 * Cards failing `filter` stay visible but dimmed, so the player always sees the whole book.
 */
import { useEffect } from "react";
import { SpellCard } from "@/components/fx";
import { cardDesc, cardName, effectivePower, spellOfCard, type Card, type Run } from "@/lib/engine";
import { LANGS, type LangId } from "@/lib/lang";

export type DeckPickerProps = {
  run: Run;
  lang: LangId;
  /** "Your deck", "Study which card?", "Forget which card?" */
  title: string;
  /** Small line next to the title; defaults to a count. */
  note?: string;
  /** Cards failing it are dimmed and cannot be picked. */
  filter?: (card: Card) => boolean;
  /** Badge on the cards the filter excludes, e.g. "already +". */
  filteredHint?: string;
  /** Omit for view-only. */
  onPick?: (uid: string) => void;
  /** Omit when the choice cannot be cancelled (an event has already taken its price). */
  onClose?: () => void;
};

export default function DeckPicker({ run, lang, title, note, filter, filteredHint, onPick, onClose }: DeckPickerProps) {
  const L = LANGS[lang];

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cards = run.deck.map((card) => ({ card, spell: spellOfCard(card), ok: filter ? filter(card) : true }));
  const pickable = cards.filter((c) => c.ok).length;
  const n = run.deck.length;

  return (
    <div
      role="dialog" aria-modal="true" aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm animate-reveal"
      onClick={onClose}
    >
      <div className="panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-2xl font-light italic text-vellum">{title}</h2>
          <p className="text-xs text-vellum2">
            {note ?? (onPick ? `${pickable} of ${n} card${n === 1 ? "" : "s"} can be chosen` : `${n} card${n === 1 ? "" : "s"}`)}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {cards.map(({ card, spell, ok }) => (
            <SpellCard
              key={card.uid}
              name={cardName(card, lang)} desc={cardDesc(card)} element={spell.element} kind={spell.kind}
              tier={spell.tier} cost={spell.cost} power={effectivePower(card) || undefined} up={card.up} italic={L.italic} lang={lang}
              disabled={!ok} hint={!ok ? filteredHint : undefined}
              onClick={ok && onPick ? () => onPick(card.uid) : undefined}
              className={onPick ? "" : "cursor-default"}
            />
          ))}
        </div>
        {onClose && (
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onClose} className="btn-quiet">{onPick ? "Cancel" : "Close"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
