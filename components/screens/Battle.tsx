"use client";

/**
 * The battle screen. CONTRACT (phase 2): these props are fixed; Game.tsx renders this when
 * `run.phase === "battle"` and switches screens itself whenever `onRun` delivers a run whose
 * phase changed ("reward" | "won" | "dead"). This file is a placeholder until the battle
 * agent replaces it; keep the exported names and prop types.
 */
import type { Run } from "@/lib/engine";
import type { LangId } from "@/lib/lang";
import type { Vocab } from "@/data/vocab";
import type { WordStats } from "@/lib/lexicon";

/** What Eco (the mentor) is told about the last cast. */
export type CastInfo = {
  word: Vocab;            // the phrase that was attempted
  heard: string;          // recognizer transcript ("" in typing mode means nothing typed)
  score: number;          // final score 0..1 after relics/focus
  backfire: boolean;
  spellName: string;      // localized card name, e.g. "Chispa+" / "火花+"
  reading?: string;       // pinyin when the language has one
  tip?: string;           // coach sentence once it arrived
};

export type BattleProps = {
  run: Run;                               // phase "battle"
  lang: LangId;
  lexicon: Vocab[];
  words: WordStats;
  useTyping: boolean;
  onUseTyping: (v: boolean) => void;
  onRun: (next: Run) => void;             // commit engine state (after castCard / endTurn / useRedraw)
  onWords: (w: WordStats) => void;        // mastery stats after every scored cast (caller persists)
  onCast: (info: CastInfo) => void;       // after every scored cast; call again when the tip arrives
};

export default function Battle({ run, lang }: BattleProps) {
  return (
    <div className="panel mt-6 p-6 text-center text-vellum2">
      Battle screen placeholder — floor {run.floor + 1}, {run.enemy?.name ?? "no enemy"}, {lang}.
    </div>
  );
}
