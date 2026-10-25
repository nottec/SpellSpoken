"use client";

import type { ReactElement, RefObject } from "react";
import type { Element, Enemy } from "@/lib/engine";
import { enemyName, enemyTaunt } from "@/data/enemies";
import { LANGS, elementLabel, intentName, type LangId } from "@/lib/lang";
import { EnemySprite, Burst, HpBar, StatusBadge, Sigil, IntentBadge, Ruby, withPinyin } from "@/components/fx";
import { EL_TEXT, intentLine } from "./copy";

export type EnemyPanelProps = {
  enemy: Enemy;
  lang: LangId;
  hurt: boolean;
  dead: boolean;
  burst: { element: Element; n: number };
  /** From useFloatText() / useStageFx(): the section is the host (it shakes); the layer sits over the sprite. */
  host: RefObject<HTMLDivElement | null>;
  layer: ReactElement;
  /** Your shield and armor (`run.shield`, `stacksOf(run.statuses, "armor")`): the intent badge says what gets through. */
  shield?: number;
  armor?: number;
};

export default function EnemyPanel({ enemy: e, lang, hurt, dead, burst, host, layer, shield, armor }: EnemyPanelProps) {
  const L = LANGS[lang];
  const intent = intentLine(e);
  const kindTag = e.kind === "final" ? "final boss" : e.kind === "boss" ? "boss" : e.kind === "elite" ? "elite" : null;
  return (
    <section ref={host} className="panel relative mt-5 flex flex-col items-center gap-4 px-5 py-5 sm:flex-row sm:gap-6" aria-label="enemy">
      <div className="fx-stage-sprite relative shrink-0">
        <EnemySprite id={e.id} kind={e.kind} hurt={hurt} charged={e.charged} dead={dead} className={e.kind === "minion" ? "" : "h-[150px] w-[150px] sm:h-auto sm:w-auto"} />
        <Burst element={burst.element} trigger={burst.n} />
        {layer}
      </div>
      <div className="min-w-0 flex-1 text-center sm:text-left">
        <div className="flex flex-wrap items-baseline justify-center gap-x-3 sm:justify-start">
          <h2 className="font-display text-2xl font-medium"><Ruby text={enemyName(e, lang)} lang={lang} italic={L.italic} /></h2>
          <span className="text-sm text-vellum2">{e.gloss}{kindTag ? ` · ${kindTag}` : ""}</span>
        </div>
        <p lang={L.speech} className={`mt-0.5 font-display text-sm text-vellum2 ${L.italic ? "italic" : ""}`}>{withPinyin(enemyTaunt(e, lang), lang)}</p>
        <HpBar value={e.hpNow} max={e.hp} color="blood" className="mt-3" />
        {e.statuses.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {e.statuses.map((s) => <StatusBadge key={s.id} id={s.id} stacks={s.stacks} turns={s.turns} />)}
          </div>
        )}
        <IntentBadge
          intent={intent.intent} amount={intent.amount} charged={e.charged} shield={shield} armor={armor}
          note={intent.note} title={intentName(intent.intent, lang)} lang={lang} pulseKey={`${e.id}:${e.step}:${e.charged ? "c" : ""}`}
          className="mt-3"
        />
        <p className="mt-2 text-xs text-vellum2">
          Weak to <Sigil element={e.weak} size={13} /> <Ruby text={elementLabel(e.weak, lang)} lang={lang} className={EL_TEXT[e.weak]} />
          {e.resist && <> · resists <Sigil element={e.resist} size={13} /> <Ruby text={elementLabel(e.resist, lang)} lang={lang} className={EL_TEXT[e.resist]} /></>}
          {e.minTier && e.minTier > 1 ? <> · shrugs off spells below tier {e.minTier}</> : null}
        </p>
      </div>
    </section>
  );
}
