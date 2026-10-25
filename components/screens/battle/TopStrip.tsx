"use client";

import { FLOORS, relicsOf, type Run } from "@/lib/engine";
import { relicName } from "@/data/relics";
import type { LangId } from "@/lib/lang";
import { HpBar, InkCounter, StatusBadge, Ruby, SfxToggle, HelpButton, MenuButton, ResetButton } from "@/components/fx";

/** Floor, turn, ink, your life (+ shield and statuses) and the relic row. */
export default function TopStrip({ run, lang }: { run: Run; lang: LangId }) {
  const relics = relicsOf(run);
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-vellum2">
        <div className="flex items-center gap-3">
          <span className="cursor-help font-display text-base text-vellum" title={`${FLOORS} floors, one life: the boss waits on floor 4, the last door is floor ${FLOORS}.`}>Floor {run.floor + 1} of {FLOORS}</span>
          <span className="cursor-help" title={`Turn ${run.turn} of this battle. End your turn (E) when you are done: the enemy acts, your breath refills and you draw a new hand.`}>turn {run.turn}</span>
          <InkCounter value={run.ink} />
          <SfxToggle />
          <HelpButton />
          <MenuButton />
          <ResetButton />
        </div>
        <div className="flex min-w-[14rem] flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-1 sm:max-w-sm">
          <HpBar value={run.hp} max={run.maxHp} label="Your life" className="min-w-[10rem] flex-1" />
          {run.shield > 0 && (
            <span className="shrink-0 font-semibold tabular-nums text-light" title={`${run.shield} shield: absorbs damage before life, halves each enemy turn`}>⛨ {run.shield}</span>
          )}
          {run.statuses.map((s) => <StatusBadge key={s.id} id={s.id} stacks={s.stacks} turns={s.turns} target="self" />)}
        </div>
      </div>
      {relics.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-vellum2" aria-label="relics">
          {relics.map((x) => <span key={x.id} title={x.desc}>{x.emoji} <Ruby text={relicName(x, lang)} lang={lang} /></span>)}
        </div>
      )}
    </header>
  );
}
