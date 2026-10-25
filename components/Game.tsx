"use client";

/**
 * The orchestrator. Holds the run and everything around it (language, lexicon, mastery, typing
 * mode, the last cast for Eco), persists the run per language, grows the lexicon once per
 * floor, and renders one screen by `run.phase`. The engine is pure; every screen hands back a
 * new Run through `onRun` and this component decides what to show next.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  newRun, chooseNode, advance, startBattle, castCard, endTurn, winBattle, useRedraw, pendingReward, takeCard, takeRelic, rest,
  eventOptionAvailable, resolveEvent, pickEventCard, buyCard, buyRelic, buyRemove, buyUpgrade, leaveShop,
  drawPhrase, handCards, castBlocker, previewCast, canAct, nextIntent, stacksOf, relicsOf, cardName, cardDesc, spellOfCard, cardCost, cardTags, FLOORS, RUN_VERSION,
  type Run, type Phase,
} from "@/lib/engine";
import { LANGS, loadLang, saveLang, type LangId } from "@/lib/lang";
import { fullLexicon, mergeExtra, loadWords, saveWords, isWordMastered, type WordStats } from "@/lib/lexicon";
import { speechSupported } from "@/lib/speech";
import { playSfx } from "@/lib/sfx";
import { enemies, enemyName } from "@/data/enemies";
import { relics, relicName } from "@/data/relics";
import { spells } from "@/data/spells";
import { events } from "@/data/events";
import type { Vocab } from "@/data/vocab";
import Battle, { type CastInfo, type BattleSelection } from "./screens/Battle";
import Title from "./screens/Title";
import MapScreen from "./screens/MapScreen";
import RewardScreen from "./screens/RewardScreen";
import RestScreen from "./screens/RestScreen";
import EventScreen from "./screens/EventScreen";
import MerchantScreen from "./screens/MerchantScreen";
import End from "./screens/End";
import Mentor, { type MentorCtx } from "./Mentor";
import Handbook from "./Handbook";
import Sky from "./Sky";
import { HANDBOOK_EVENT, MENU_EVENT, RESET_EVENT } from "@/components/fx";

/* ---------- the saved run: one per language ---------- */

const PHASES: readonly Phase[] = ["map", "battle", "reward", "rest", "event", "merchant", "dead", "won"];
export const runKey = (lang: LangId) => `incantation.run.${lang}`;

/** The saved run for `lang`, or null when there is none or it does not look like a run. */
function loadRun(lang: LangId): Run | null {
  try {
    const raw = localStorage.getItem(runKey(lang));
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<Run> | null;
    if (!r || typeof r !== "object") return null;
    if (!PHASES.includes(r.phase as Phase)) return null;
    if (typeof r.floor !== "number" || r.floor < 0 || r.floor >= FLOORS) return null;
    if (!Array.isArray(r.deck) || !Array.isArray(r.map) || !Array.isArray(r.path) || typeof r.seed !== "number") return null;
    if (r.version !== RUN_VERSION) return null;   // a run saved by an older engine (smaller hand, no keywords) is not worth resuming
    return r as Run;
  } catch { return null; }
}
function saveRun(lang: LangId, run: Run) { try { localStorage.setItem(runKey(lang), JSON.stringify(run)); } catch { /* storage full or blocked: the run just will not survive a reload */ } }
function removeRun(lang: LangId) { try { localStorage.removeItem(runKey(lang)); } catch { /* ignore */ } }

const GROW_NOTE_MS = 2500;
const TYPING_KEY = "incantation.typing";

export default function Game() {
  const [ready, setReady] = useState(false);               // true after localStorage has been read (avoids a flash of the wrong language)
  const [run, setRun] = useState<Run | null>(null);
  const [saved, setSaved] = useState<Run | null>(null);    // offered on the Title as "Continue the run"
  const [lang, setLang] = useState<LangId>("es");
  const [lexicon, setLexicon] = useState<Vocab[]>([]);
  const [words, setWords] = useState<WordStats>({});
  const [useTyping, setUseTyping] = useState(false);
  const [micOk, setMicOk] = useState(true);
  const [lastCast, setLastCast] = useState<CastInfo | null>(null);
  const [selection, setSelection] = useState<BattleSelection | null>(null);   // the card + incantation on screen, for Eco
  const [backfires, setBackfires] = useState(0);           // nudges Eco's orb
  const [growNote, setGrowNote] = useState<string | null>(null);
  const [handbook, setHandbook] = useState(false);          // the symbols/rules overlay: HelpButton event, "?" key

  const lastGrown = useRef(-1);                            // floor the lexicon last grew on (this run)
  const growing = useRef(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCounted = useRef("");                          // dedupes onCast's second call (when the tip arrives)
  const latest = useRef({ run, lang, words, lexicon });    // for async callbacks and the dev hook
  useEffect(() => { latest.current = { run, lang, words, lexicon }; });

  /* mount: language, lexicon, mastery, saved run, mic */
  useEffect(() => {
    const l = loadLang();
    setLang(l); setLexicon(fullLexicon(l)); setWords(loadWords(l)); setSaved(loadRun(l));
    const ok = speechSupported(); setMicOk(ok);
    try { if (!ok || localStorage.getItem(TYPING_KEY) === "1") setUseTyping(true); } catch { if (!ok) setUseTyping(true); }
    setReady(true);
    return () => { if (noteTimer.current) clearTimeout(noteTimer.current); };
  }, []);

  /* persist the run on every change, and the typing preference (a reload mid-demo must not silently switch to the mic) */
  useEffect(() => { if (run) saveRun(lang, run); }, [run, lang]);
  useEffect(() => { if (!ready) return; try { localStorage.setItem(TYPING_KEY, useTyping ? "1" : "0"); } catch { /* ignore */ } }, [useTyping, ready]);

  /* one sound when a run ends; the End screen itself stays quiet */
  useEffect(() => { if (run?.phase === "won") playSfx("win"); else if (run?.phase === "dead") playSfx("lose"); }, [run?.phase]);

  /* the Handbook: any HelpButton raises HANDBOOK_EVENT; "?" toggles it (not while typing) */
  useEffect(() => {
    const open = () => setHandbook(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.key !== "?") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      setHandbook((v) => !v);
    };
    window.addEventListener(HANDBOOK_EVENT, open);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(HANDBOOK_EVENT, open); window.removeEventListener("keydown", onKey); };
  }, []);

  /* vocab growth: once per floor, when the map comes up */
  useEffect(() => {
    if (!run || run.phase !== "map" || run.floor <= lastGrown.current || growing.current || !lexicon.length) return;
    const themes = Array.from(new Set(run.deck.flatMap((c) => spellOfCard(c).themes)));
    if (!themes.length) return;
    lastGrown.current = run.floor; growing.current = true;
    const theme = themes[(run.seed + run.floor) % themes.length];
    const forLang = lang;
    const exclude = lexicon.filter((v) => v.theme === theme).map((v) => v.text);
    fetch("/api/vocab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme, exclude, lang: forLang }) })
      .then((r) => (r.ok ? (r.json() as Promise<{ entries?: Vocab[] }>) : null))
      .then((d) => {
        const entries = d?.entries ?? [];
        if (!entries.length) return;                        // `why` is ignored on purpose: the game never blocks on Gemini
        const { run: r, words: w, lang: l } = latest.current;
        const keep = new Set<string>([...(r?.grudges ?? []), ...Object.keys(w).filter((id) => isWordMastered(w, id))]);
        const next = mergeExtra(forLang, entries, keep);
        if (l !== forLang) return;                          // the player switched language meanwhile; the store is updated, the screen is not
        setLexicon(next);
        setGrowNote(`+${entries.length} ${theme} words`);
        if (noteTimer.current) clearTimeout(noteTimer.current);
        noteTimer.current = setTimeout(() => setGrowNote(null), GROW_NOTE_MS);
      })
      .catch(() => { /* offline or quota: silently keep the lexicon we have */ })
      .finally(() => { growing.current = false; });
  }, [run, lexicon, lang]);

  /* callbacks for the screens */
  const onWords = useCallback((w: WordStats) => { setWords(w); saveWords(latest.current.lang, w); }, []);
  const onCast = useCallback((info: CastInfo) => {
    setLastCast(info);
    const key = `${info.word.id}|${info.heard}|${info.score}|${info.spellName}`;
    if (info.backfire && key !== lastCounted.current) setBackfires((b) => b + 1);
    lastCounted.current = key;
  }, []);

  function switchLang(l: LangId) {
    setLang(l); saveLang(l);
    setLexicon(fullLexicon(l)); setWords(loadWords(l)); setSaved(loadRun(l));
  }
  function begin() {
    removeRun(lang);
    lastGrown.current = -1; lastCounted.current = "";
    setLastCast(null); setBackfires(0);
    setRun(newRun());
  }
  function resume() {
    if (!saved) return;
    lastGrown.current = -1; lastCounted.current = "";
    setLastCast(null);
    setRun(saved);
  }
  function again() {
    removeRun(lang);
    setSaved(null); setRun(null); setLastCast(null);
  }
  /** Back to the title mid-run: the run is already saved on every change, so the title offers Continue. */
  const toMenu = useCallback(() => {
    const r = latest.current.run;
    if (r && r.phase !== "won" && r.phase !== "dead") setSaved(r); else { removeRun(latest.current.lang); setSaved(null); }
    setRun(null); setLastCast(null); setSelection(null);
  }, []);
  /** Reset: the run and its save are gone; mastery stays. From a header (confirmed there) or the title's "abandon" link. */
  const reset = useCallback(() => {
    removeRun(latest.current.lang);
    lastGrown.current = -1; lastCounted.current = "";
    setSaved(null); setRun(null); setLastCast(null); setSelection(null); setBackfires(0);
  }, []);
  useEffect(() => {
    window.addEventListener(MENU_EVENT, toMenu);
    window.addEventListener(RESET_EVENT, reset);
    return () => { window.removeEventListener(MENU_EVENT, toMenu); window.removeEventListener(RESET_EVENT, reset); };
  }, [toMenu, reset]);

  /* what Eco is told (every field optional on the server) */
  const mentorCtx = useMemo<MentorCtx>(() => {
    if (!run) return { lang };
    const e = run.phase === "battle" ? run.enemy : null;
    const status = (s: { id: string; stacks: number; turns: number }) => ({ id: s.id, stacks: s.stacks, turns: s.turns });
    return {
      lang, floor: run.floor, turn: run.turn, phase: run.phase,
      hp: run.hp, maxHp: run.maxHp, shield: run.shield, ink: run.ink, resonance: run.resonance, breath: run.breath, maxBreath: run.maxBreath,
      statuses: run.statuses.map(status),
      relics: relicsOf(run).map((x) => relicName(x, lang)),
      enemy: e ? {
        name: enemyName(e, lang), gloss: e.gloss, weak: e.weak, resist: e.resist, minTier: e.minTier, hpNow: e.hpNow, hp: e.hp,
        intent: nextIntent(e), charged: e.charged, armor: stacksOf(e.statuses, "armor"), statuses: e.statuses.map(status),
      } : null,
      hand: handCards(run).map(({ card, spell }) => ({
        phrase: cardName(card, lang), meaning: `${spell.gloss} (${spell.kind})`, element: spell.element, tier: spell.tier, cost: cardCost(run, card),
        focus: spell.themes.join("/"), affordable: !castBlocker(run, card.uid), note: cardTags(card).join(", ") || undefined,
        incantation: selection?.phrases[card.uid]?.text, reading: selection?.phrases[card.uid]?.reading,
      })),
      selected: selection && run.phase === "battle" ? {
        card: cardName(selection.card, lang), effect: cardDesc(selection.card), element: selection.spell.element, cost: cardCost(run, selection.card),
        phrase: selection.phrase?.text ?? "", meaning: selection.phrase?.en, focus: selection.phrase?.focus, reading: selection.phrase?.reading,
      } : null,
      last: lastCast ? { phrase: lastCast.word.text, heard: lastCast.heard, score: lastCast.score, backfire: lastCast.backfire, reading: lastCast.reading } : null,
    };
  }, [run, lang, lastCast, selection]);

  /* dev hook (never in production): window.__incantation lets a reviewer jump to any screen from the console */
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEV_HOOK !== "1") return;   // NEXT_PUBLIC_DEV_HOOK=1 at build time enables it for scripted QA
    const w = window as unknown as { __incantation?: unknown };
    w.__incantation = {
      // state
      getRun: () => latest.current.run, setRun: (r: Run | null) => setRun(r),
      getLang: () => latest.current.lang, setLang: switchLang,
      getLexicon: () => latest.current.lexicon, getWords: () => latest.current.words, setWords: onWords,
      setUseTyping, begin, resume, again,
      loadSaved: () => loadRun(latest.current.lang), clearSaved: () => removeRun(latest.current.lang),
      // engine (pure; feed the result to setRun)
      newRun, chooseNode, advance, startBattle, castCard, endTurn, winBattle, useRedraw, pendingReward, takeCard, takeRelic, rest,
      eventOptionAvailable, resolveEvent, pickEventCard, buyCard, buyRelic, buyRemove, buyUpgrade, leaveShop,
      drawPhrase, handCards, castBlocker, previewCast, canAct, nextIntent, cardCost, cardTags,
      data: { spells, enemies, relics, events },
    };
    return () => { delete w.__incantation; };
  });

  if (!ready) return <div className="min-h-[60vh]" aria-busy="true" />;
  if (!run) {
    return (
      <>
        <Sky lexicon={lexicon} lang={lang} />
        <Title
          lang={lang} onLang={switchLang} lexicon={lexicon} words={words} saved={saved}
          onContinue={resume} onBegin={begin} onAbandon={reset} micOk={micOk} useTyping={useTyping} onUseTyping={setUseTyping}
        />
        {handbook && <Handbook lang={lang} onClose={() => setHandbook(false)} />}
      </>
    );
  }

  let screen: ReactNode = null;
  switch (run.phase) {
    case "map":
      screen = <MapScreen run={run} lang={lang} onRun={setRun} />;
      break;
    case "battle":
      screen = (
        <Battle
          run={run} lang={lang} lexicon={lexicon} words={words} useTyping={useTyping} onUseTyping={setUseTyping}
          onRun={setRun} onWords={onWords} onCast={onCast} onSelection={setSelection}
        />
      );
      break;
    case "reward":
      screen = <RewardScreen run={run} lang={lang} onRun={setRun} />;
      break;
    case "rest":
      screen = <RestScreen run={run} lang={lang} onRun={setRun} />;
      break;
    case "event":
      screen = (
        <EventScreen
          key={`${run.event?.id ?? "event"}-${run.floor}`}
          run={run} lang={lang} lexicon={lexicon} words={words} useTyping={useTyping} onUseTyping={setUseTyping}
          onRun={setRun} onWords={onWords}
        />
      );
      break;
    case "merchant":
      screen = <MerchantScreen key={run.floor} run={run} lang={lang} onRun={setRun} />;
      break;
    case "dead":
    case "won":
      screen = <End run={run} lang={lang} words={words} lexicon={lexicon} onAgain={again} />;
      break;
  }

  return (
    <>
      <Sky lexicon={lexicon} lang={lang} dim />
      {screen}
      <Mentor ctx={mentorCtx} nudge={backfires} tip={lastCast?.tip ? { text: lastCast.tip, key: `${lastCast.word.id}|${lastCast.heard}|${lastCast.tip}` } : null} />
      {handbook && <Handbook lang={lang} onClose={() => setHandbook(false)} />}
      {growNote && (
        <div role="status" className="fixed bottom-6 left-6 z-30 rounded-full bg-dusk/90 px-3 py-1.5 text-xs text-moss ring-1 ring-white/10 animate-reveal">
          {growNote}
        </div>
      )}
      {/* LANGS is read by the screens; keep the import honest for the typing-mode label */}
      <span hidden aria-hidden>{LANGS[lang].label}</span>
    </>
  );
}
