"use client";

/**
 * The battle screen. CONTRACT (phase 2): these props are fixed; Game.tsx renders this when
 * `run.phase === "battle"` and switches screens itself whenever `onRun` delivers a run whose
 * phase changed ("reward" | "won" | "dead").
 *
 * The engine is pure and every call returns a new Run; this component owns only presentation
 * state (selection, the per-turn phrase cache, the verdict panel, sprite flashes) and the cast
 * flow: capture speech (or read the typed text) → score → castCard → commit via onRun → ask
 * /api/feedback for one coaching line. Silence and timeouts are not casts. A `busy` flag keeps
 * casts and end-turns from overlapping, and the auto end-turn only ever acts on the latest run.
 *
 * Capture tuning (docs/SPEECH_GEMINI.md §1): listening ends early as soon as an interim result
 * already matches the phrase (ACCEPT_AT), or IDLE_BY_LEVEL after the player falls silent, so a
 * one-syllable word is never left hanging until it is said twice; the live transcript is shown
 * under the phrase while listening. Scoring is `bestMatch` (repetition-tolerant, rank- and
 * confidence-weighted) and is decided before any Gemini call.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { castCard, endTurn, useRedraw, drawPhrase, castBlocker, canAct, handCards, cardName, stacksOf, type Run, type Card, type Spell, type Enemy } from "@/lib/engine";
import { isDamageKind } from "@/data/spells";
import { LANGS, type LangId } from "@/lib/lang";
import { bestMatch, similarityTyped } from "@/lib/scoring";
import { isWordMastered, type WordStats } from "@/lib/lexicon";
import { speak, TIMEOUT_BY_LEVEL, IDLE_BY_LEVEL, ACCEPT_AT, type Capture } from "@/lib/speech";
import { playSfx } from "@/lib/sfx";
import type { Vocab } from "@/data/vocab";
import { useSpeechCapture } from "@/components/hooks/useSpeechCapture";
import { useStageFx, LogPanel } from "@/components/fx";
import TopStrip from "./battle/TopStrip";
import EnemyPanel from "./battle/EnemyPanel";
import Incantation, { type Notice } from "./battle/Incantation";
import Verdict, { type CastVerdict, type VerdictState } from "./battle/Verdict";
import Hand from "./battle/Hand";
import { castSentence, enemyTurnSentence, praiseText } from "./battle/copy";

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

/** Capture timings and the early-accept threshold come from lib/speech.ts (TIMEOUT_BY_LEVEL, IDLE_BY_LEVEL, ACCEPT_AT). */
/** At or above this the cast was clean: template praise, no feedback request (saves quota). */
const PRAISE_AT = 0.97;
const TYPED_MS = 1500;
const RESULT_PAUSE_MS = 1200;   // let the verdict land before the turn auto-ends
const DISSOLVE_MS = 900;        // EnemySprite `dead` dissolve
const LAST_HIT_MS = 650;        // let a fatal float register before Game switches screens

const EMPTY: Record<string, Vocab> = {};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type HandEntry = { card: Card; spell: Spell };

export default function Battle(props: BattleProps) {
  const { run } = props;
  // Remount per battle so selection, phrase cache, verdict and sprite state never leak between fights.
  const battleId = `${run.floor}:${run.path[run.floor] ?? "?"}:${run.enemy?.id ?? "none"}`;
  return <BattleInner key={battleId} {...props} />;
}

function BattleInner({ run, lang, lexicon, words, useTyping, onUseTyping, onRun, onWords, onCast }: BattleProps) {
  const L = LANGS[lang];
  const mic = useSpeechCapture();
  const enemyFx = useStageFx();   // strikes, numbers, callouts and shake over the enemy; each method plays its own sound
  const selfFx = useStageFx();    // shield sweeps, heals and self-hits over the incantation

  const [selected, setSelected] = useState<string | null>(null);
  const [cache, setCache] = useState<{ key: string; map: Record<string, Vocab> }>({ key: "", map: EMPTY });
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<VerdictState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [hurt, setHurt] = useState(false);
  const [dead, setDead] = useState(false);
  const [staged, setStaged] = useState<Run | null>(null);   // the run after a fatal blow, shown while the sprite dissolves
  const [hintGone, setHintGone] = useState(false);

  const busyRef = useRef(false);
  const castSeq = useRef(0);
  const mounted = useRef(true);
  const runRef = useRef(run);
  const wordsRef = useRef(words);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => { runRef.current = run; }, [run]);
  useEffect(() => { wordsRef.current = words; }, [words]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; timers.current.forEach(clearTimeout); timers.current.clear(); };
  }, []);
  const after = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => { timers.current.delete(t); if (mounted.current) fn(); }, ms);
    timers.current.add(t);
  }, []);

  /* ---------- hand, selection, phrases ---------- */
  const hand = useMemo<HandEntry[]>(() => handCards(run), [run]);
  const sel = useMemo<HandEntry | null>(() => {
    const kept = selected ? hand.find((h) => h.card.uid === selected) : undefined;
    if (kept) return kept;
    return hand.find((h) => !castBlocker(run, h.card.uid)) ?? hand[0] ?? null;
  }, [hand, selected, run]);

  // Phrases are cached per card uid for the turn; the cache also empties when the curse lifts
  // (the first cast of a cursed turn), so the other cards are redrawn at their normal level.
  const cacheKey = `${run.turn}:${run.cursed ? "cursed" : "clear"}`;
  const phrases = cache.key === cacheKey ? cache.map : EMPTY;
  const phrase = sel ? phrases[sel.card.uid] ?? null : null;
  const blocker = sel ? castBlocker(run, sel.card.uid) : "no card";

  const remember = useCallback((uid: string, v: Vocab) => {
    setCache((c) => ({ key: cacheKey, map: { ...(c.key === cacheKey ? c.map : EMPTY), [uid]: v } }));
  }, [cacheKey]);
  const draw = useCallback((from: Run, spell: Spell, exclude: Iterable<Vocab>) => {
    const taken = new Set(Array.from(exclude, (v) => v.id));
    const pool = lexicon.filter((v) => !taken.has(v.id));
    return drawPhrase(from, spell, pool.length ? pool : lexicon);
  }, [lexicon]);

  useEffect(() => {
    if (!sel || phrase || !lexicon.length || run.phase !== "battle") return;
    remember(sel.card.uid, draw(run, sel.spell, Object.values(phrases)));
  }, [sel, phrase, lexicon, run, phrases, remember, draw]);

  const select = useCallback((uid: string) => {
    if (mic.listening) return;
    setSelected(uid);
    setNotice(null);
    playSfx("select");
  }, [mic.listening]);

  function redraw() {
    if (busyRef.current || mic.listening || !sel || run.redrawsLeft <= 0 || !lexicon.length) return;
    const next = useRedraw(run);
    if (next === run) return;
    remember(sel.card.uid, draw(next, sel.spell, Object.values(phrases)));
    setNotice(null);
    onRun(next);
  }

  function hear() {
    if (phrase && !mic.listening) speak(phrase.text, L.speech);
  }

  /* ---------- effects on the stage ---------- */
  const flash = useCallback(() => { setHurt(true); after(400, () => setHurt(false)); }, [after]);

  function castEffects(spell: Spell, r: ReturnType<typeof castCard>["result"]) {
    if (r.backfire) { selfFx.selfHit(r.selfDamage, { backfire: true }); return; }
    if (isDamageKind(spell.kind)) {
      const dmg = r.damage + r.echoDamage + r.armorAbsorbed;
      if (dmg > 0) {
        enemyFx.strike(spell.element, { amount: dmg, crit: r.crit, reaction: r.reaction, weak: r.weak, exposed: r.exposed });
        flash();
      }
      if (r.healed) selfFx.heal(r.healed);
    } else if (spell.kind === "shield") selfFx.shield(r.shielded);
    else if (spell.kind === "heal") selfFx.heal(r.healed);
    else if (r.applied.some((a) => a.target === "enemy")) { enemyFx.strike(spell.element, { reaction: r.reaction }); flash(); }
    if (r.gained.breath) selfFx.float(`+${r.gained.breath} breath`, "text-ember");
  }

  function turnEffects(t: ReturnType<typeof endTurn>["result"]) {
    if (t.burnDamage) { enemyFx.strike("fire", { amount: t.burnDamage }); flash(); }
    if (t.enemyHit) selfFx.selfHit(t.enemyHit);
    else if (t.hits && (t.blocked || t.armorAbsorbed)) { selfFx.shield(0); selfFx.float("⛨ held", "text-light"); }
    if (t.thorns) { enemyFx.strike("wind", { amount: t.thorns }); flash(); }
    if (t.enemyHealed) enemyFx.heal(t.enemyHealed);
    if (t.regen) selfFx.heal(t.regen);
  }

  /* ---------- coaching ---------- */
  function requestTip(word: Vocab, heard: string, score: number, audio: Capture["audio"], seq: number, info: CastInfo) {
    const patch = (p: Partial<CastVerdict>) =>
      setVerdict((v) => (v?.cast && v.cast.seq === seq ? { ...v, cast: { ...v.cast, ...p } } : v));
    fetch("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: word.text, reading: word.reading, focus: word.focus, transcript: heard, score, audio, lang }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`feedback ${r.status}`))))
      .then((d: { tip?: unknown; mode?: unknown; why?: unknown }) => {
        if (!mounted.current || castSeq.current !== seq) return;   // another cast started: drop it
        const tip = typeof d.tip === "string" && d.tip.trim() ? d.tip.trim() : null;
        patch({ tip, pending: false, mode: typeof d.mode === "string" ? d.mode : null, why: typeof d.why === "string" ? d.why : null });
        if (tip) onCast({ ...info, tip });
      })
      .catch(() => { if (mounted.current && castSeq.current === seq) patch({ tip: null, pending: false, mode: "template", why: "error" }); });
  }

  /* ---------- the cast ---------- */
  async function resolveCast(cur: Run, h: HandEntry, word: Vocab, heard: string, raw: number, ms: number, audio: Capture["audio"], viaTyping: boolean, seq: number) {
    const mastered = isWordMastered(wordsRef.current, word.id);
    const { run: next, result } = castCard(cur, h.card.uid, word, raw, ms, mastered);

    const prev = wordsRef.current[word.id];
    const w: WordStats = { ...wordsRef.current, [word.id]: { casts: (prev?.casts ?? 0) + 1, sum: (prev?.sum ?? 0) + result.score } };
    wordsRef.current = w;
    onWords(w);

    castEffects(h.spell, result);
    const info: CastInfo = { word, heard, score: result.score, backfire: result.backfire, spellName: cardName(h.card, lang), reading: word.reading };
    onCast(info);
    const clean = result.score >= PRAISE_AT;
    const tip = clean ? praiseText(L, word) : null;
    setVerdict({ cast: { seq, card: h.card, spell: h.spell, phrase: word, heard, typed: viaTyping, result, tip, pending: !clean, mode: clean ? "template" : null, why: null }, enemyTurn: null });
    if (clean) onCast({ ...info, tip: tip! });
    else requestTip(word, heard, result.score, audio, seq, info);

    if (next.phase !== "battle") {
      // the enemy fell (reward/won) or your own words undid you (dead): let it be seen, then hand off
      setStaged(next);
      if (result.killed) { setDead(true); await sleep(DISSOLVE_MS); } else await sleep(LAST_HIT_MS);
      if (mounted.current) onRun(next);
      return;
    }
    onRun(next);
    if (!canAct(next)) {
      await sleep(RESULT_PAUSE_MS);
      if (!mounted.current) return;
      const latest = runRef.current;
      if (latest.phase === "battle" && !canAct(latest)) await runEnemyTurn(latest);
    }
  }

  async function cast() {
    if (busyRef.current || mic.listening) return;
    const cur = runRef.current;
    if (!sel || !phrase || cur.phase !== "battle") return;
    const why = castBlocker(cur, sel.card.uid);
    if (why) {
      setNotice({ text: why === "silenced" ? "You are silenced: no tier-3 spells this turn." : why === "not enough breath" ? "Not enough breath for that card." : why });
      return;
    }
    busyRef.current = true; setBusy(true);
    const seq = ++castSeq.current;
    try {
      if (useTyping) {
        const t = typed.trim();
        if (!t) return;
        setNotice(null); setVerdict(null); setTyped("");
        await resolveCast(cur, sel, phrase, t, similarityTyped(t, phrase.text, L.tokens), TYPED_MS, null, true, seq);
        return;
      }
      setNotice(null); setVerdict(null);
      const target = phrase;   // the phrase this capture is scored against, even if the hand re-renders meanwhile
      playSfx("listen");
      const cap = await mic.start(L.speech, {
        timeoutMs: TIMEOUT_BY_LEVEL[target.level] ?? TIMEOUT_BY_LEVEL[2],
        idleMs: IDLE_BY_LEVEL[target.level] ?? IDLE_BY_LEVEL[2],
        accept: (alts) => bestMatch(alts, target.text, L.tokens).score >= ACCEPT_AT,
      });
      if (!mounted.current) return;   // the screen is gone: the hook already released the mic; nothing to score
      switch (cap.reason) {
        // Not casts: no breath, no damage, no grudge. The card stays selected for another try.
        case "silence": setNotice({ text: "I didn't hear anything — try again." }); return;
        case "timeout": setNotice({ text: "I heard you start but couldn't make it out — try again." }); return;
        case "error": setNotice({ text: cap.error ?? "The microphone failed. Try again, or type the incantation.", offerTyping: true }); return;
        case "unsupported": onUseTyping(true); setNotice({ text: cap.error ?? "This browser can't hear you. Typing mode is on." }); return;
        // Casts: "result" (final, early accept or idle stop) and "stopped" (the Stop button / Space) both score what was heard.
        case "result":
        case "stopped": {
          const best = bestMatch(cap.alts, target.text, L.tokens);
          if (!cap.alts.length || !best.transcript.trim()) { setNotice({ text: "I didn't hear anything — try again." }); return; }
          const latest = runRef.current;   // nothing can have changed while busy, but never cast on a stale run
          if (latest.phase !== "battle" || castBlocker(latest, sel.card.uid)) return;
          await resolveCast(latest, sel, target, best.transcript, best.score, cap.ms, cap.audio, false, seq);
          return;
        }
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  /* ---------- the enemy phase ---------- */
  async function runEnemyTurn(cur: Run) {
    if (cur.phase !== "battle" || !cur.enemy) return;
    const before: Enemy = cur.enemy;
    const { run: next, result } = endTurn(cur);
    setVerdict((v) => ({ cast: v?.cast ?? null, enemyTurn: enemyTurnSentence(result, before) }));
    turnEffects(result);
    setSelected(null); setTyped(""); setNotice(null);
    if (next.phase !== "battle") {
      setStaged(next);
      if (result.killed) { setDead(true); await sleep(DISSOLVE_MS); } else await sleep(LAST_HIT_MS);
      if (mounted.current) onRun(next);
      return;
    }
    onRun(next);
    if (!canAct(next)) {
      // nothing castable in the new hand (e.g. silenced with only tier-3 cards): the turn passes by itself
      await sleep(RESULT_PAUSE_MS + 300);
      if (!mounted.current) return;
      const latest = runRef.current;
      if (latest.phase === "battle" && !canAct(latest)) await runEnemyTurn(latest);
    }
  }

  async function endTurnNow() {
    if (busyRef.current || mic.listening || runRef.current.phase !== "battle") return;
    busyRef.current = true; setBusy(true);
    try { await runEnemyTurn(runRef.current); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  /* ---------- keyboard: 1–5 select · Space cast/stop · E end turn · R redraw · H hear ---------- */
  const actions = useRef({ cast, stop: mic.stop, endTurn: endTurnNow, redraw, hear, select, hand, listening: mic.listening });
  useEffect(() => { actions.current = { cast, stop: mic.stop, endTurn: endTurnNow, redraw, hear, select, hand, listening: mic.listening }; });
  useEffect(() => {
    const typingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const a = actions.current;
      if (e.key === " ") e.preventDefault();   // the global cast key must not scroll the page or click a focused button
      if (a.listening) { if (e.key === " ") a.stop(); return; }
      if (busyRef.current) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= a.hand.length) { a.select(a.hand[n - 1].card.uid); return; }
      switch (e.key) {
        case " ": void a.cast(); break;
        case "e": case "E": void a.endTurn(); break;
        case "r": case "R": a.redraw(); break;
        case "h": case "H": a.hear(); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === " " && !typingTarget(e.target)) e.preventDefault(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  /* ---------- render ---------- */
  const view = staged ?? run;
  const enemy = view.enemy ?? run.enemy;
  const showHint = run.floor === 0 && run.turn === 1 && !hintGone;

  if (!enemy) return <div className="panel mt-6 p-6 text-center text-vellum2">No enemy here.</div>;

  return (
    <div className="pb-24 animate-reveal">
      <TopStrip run={view} lang={lang} />

      <EnemyPanel enemy={enemy} lang={lang} hurt={hurt} dead={dead} host={enemyFx.host} layer={enemyFx.layer} shield={view.shield} armor={stacksOf(view.statuses, "armor")} />

      <Incantation
        run={run} lang={lang} card={sel?.card ?? null} spell={sel?.spell ?? null} phrase={phrase} words={words}
        listening={mic.listening} level={mic.level} heard={mic.heard} busy={busy} blocker={blocker}
        useTyping={useTyping} onUseTyping={onUseTyping} typed={typed} onTyped={setTyped}
        onCast={() => void cast()} onStop={mic.stop} onHear={hear} onRedraw={redraw}
        notice={notice} host={selfFx.host} layer={selfFx.layer}
      />

      {verdict && (verdict.cast || verdict.enemyTurn) && <Verdict verdict={verdict} lang={lang} />}

      <Hand run={run} lang={lang} selected={sel?.card.uid ?? null} onSelect={select} locked={mic.listening} onEndTurn={() => void endTurnNow()} endDisabled={busy || mic.listening || run.phase !== "battle"} />

      <LogPanel lines={run.log} max={4} lang={lang} className="mt-4" />

      {showHint && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-ember/10 px-4 py-2 text-xs text-vellum ring-1 ring-ember/20" role="note">
          <p>You have {run.maxBreath} breath a turn. Cards cost breath; say the words to cast. End your turn when you&apos;re done.</p>
          <button type="button" onClick={() => setHintGone(true)} className="shrink-0 rounded px-1 text-vellum2 hover:text-vellum focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70" aria-label="Dismiss hint">✕</button>
        </div>
      )}
    </div>
  );
}
