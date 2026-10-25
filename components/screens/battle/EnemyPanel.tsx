"use client";

import type { ReactElement, RefObject } from "react";
import type { Element, Enemy } from "@/lib/engine";
import { enemyName, enemyTaunt } from "@/data/enemies";
import { LANGS, elementLabel, type LangId } from "@/lib/lang";
import { EnemySprite, Burst, HpBar, StatusBadge, Sigil } from "@/components/fx";
import { EL_TEXT, intentLine } from "./copy";

export type EnemyPanelProps = {
  enemy: Enemy;
  lang: LangId;
  hurt: boolean;
  dead: boolean;
  burst: { element: Element; n: number };
  /** From useFloatText(): the panel is the host so damage numbers rise over the enemy. */
  host: RefObject<HTMLDivElement | null>;
  layer: ReactElement;
};

const TONE = { blood: "text-blood", shadow: "text-shadow", ember: "text-ember" } as const;

export default function EnemyPanel({ enemy: e, lang, hurt, dead, burst, host, layer }: EnemyPanelProps) {
  const L = LANGS[lang];
  const intent = intentLine(e);
  const kindTag = e.kind === "final" ? "final boss" : e.kind === "boss" ? "boss" : e.kind === "elite" ? "elite" : null;
  return (
    <section ref={host} className="panel relative mt-5 flex flex-col items-center gap-4 px-5 py-5 sm:flex-row sm:gap-6" aria-label="enemy">
      <div className="relative shrink-0">
        <EnemySprite id={e.id} kind={e.kind} hurt={hurt} charged={e.charged} dead={dead} className={e.kind === "minion" ? "" : "h-[150px] w-[150px] sm:h-auto sm:w-auto"} />
        <Burst element={burst.element} trigger={burst.n} />
      </div>
      <div className="min-w-0 flex-1 text-center sm:text-left">
        <div className="flex flex-wrap items-baseline justify-center gap-x-3 sm:justify-start">
          <h2 lang={L.speech} className={`font-display text-2xl font-medium ${L.italic ? "italic" : ""}`}>{enemyName(e, lang)}</h2>
          <span className="text-sm text-vellum2">{e.gloss}{kindTag ? ` · ${kindTag}` : ""}</span>
        </div>
        <p lang={L.speech} className={`mt-0.5 font-display text-sm text-vellum2 ${L.italic ? "italic" : ""}`}>{enemyTaunt(e, lang)}</p>
        <HpBar value={e.hpNow} max={e.hp} color="blood" className="mt-3" />
        {e.statuses.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {e.statuses.map((s) => <StatusBadge key={s.id} id={s.id} stacks={s.stacks} turns={s.turns} />)}
          </div>
        )}
        <p className="mt-2 text-sm">
          <span className={TONE[intent.tone]}>Next, it {intent.text}.</span>
          {intent.note && <span className="text-vellum2"> — {intent.note}.</span>}
        </p>
        <p className="mt-1 text-xs text-vellum2">
          Weak to <Sigil element={e.weak} size={13} /> <span lang={L.speech} className={EL_TEXT[e.weak]}>{elementLabel(e.weak, lang)}</span>
          {e.resist && <> · resists <Sigil element={e.resist} size={13} /> <span lang={L.speech} className={EL_TEXT[e.resist]}>{elementLabel(e.resist, lang)}</span></>}
          {e.minTier && e.minTier > 1 ? <> · shrugs off spells below tier {e.minTier}</> : null}
        </p>
      </div>
      {layer}
    </section>
  );
}
