"use client";

/**
 * The quiet strip every non-battle screen shares: route so far, floor, life, ink, breath,
 * relics (hover for the rule), and on the map a Deck button.
 */
import { HpBar, InkCounter, PathStrip, Ruby, SfxToggle } from "@/components/fx";
import { FLOORS, relicsOf, type Run } from "@/lib/engine";
import { LANGS, type LangId } from "@/lib/lang";
import { relicName } from "@/data/relics";

export type RunHeaderProps = {
  run: Run;
  lang: LangId;
  /** Show "Floor N of 8" next to the strip (off when the screen has its own floor heading). */
  floorLabel?: boolean;
  /** Pops +N / −N beside the ink when it changes (merchant). */
  inkDelta?: number;
  /** Renders a "Deck (n)" button when given. */
  onDeck?: () => void;
};

export default function RunHeader({ run, lang, floorLabel = true, inkDelta, onDeck }: RunHeaderProps) {
  const L = LANGS[lang];
  const relics = relicsOf(run);
  return (
    <header className="flex flex-col gap-2 text-xs text-vellum2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <PathStrip floors={run.map.map((f) => f.map((n) => n.kind))} path={run.path} floor={run.floor} />
          {floorLabel && <span>Floor {Math.min(run.floor + 1, FLOORS)} of {FLOORS}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <HpBar value={run.hp} max={run.maxHp} label="Life" className="w-44" />
          <InkCounter value={run.ink} delta={inkDelta} />
          <span title="breath per turn"><span className="font-display text-base text-vellum">{run.maxBreath}</span> breath</span>
          <SfxToggle />
        </div>
      </div>
      {(relics.length > 0 || onDeck) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {relics.map((x) => (
            <span key={x.id} title={x.desc} className="cursor-help">
              <span aria-hidden>{x.emoji}</span>{" "}
              <Ruby text={relicName(x, lang)} lang={lang} italic={L.italic} className="font-display text-sm text-vellum" />
            </span>
          ))}
          {onDeck && (
            <button type="button" onClick={onDeck} className="btn-quiet ml-auto px-3 py-1 text-xs">Deck ({run.deck.length})</button>
          )}
        </div>
      )}
    </header>
  );
}
