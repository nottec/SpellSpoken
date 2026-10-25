"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { spellById, spellName, ELEMENT_ICON, ELEMENT_LABEL, KIND_LABEL, type Spell, type Element } from "@/data/spells";
import { ROOM_PLAN, INTENT_TEXT, enemyName, enemyTaunt } from "@/data/enemies";
import { relics as allRelics } from "@/data/relics";
import type { Vocab } from "@/data/vocab";
import { LANGS, loadLang, saveLang, type LangId } from "@/lib/lang";
import { newRun, cast, takeReward, drawPhrase, nextIntent, elementVs, type Run, type CastResult, type Reward } from "@/lib/engine";
import { fullLexicon, mergeExtra, loadWords, saveWords, isWordMastered, wordAvg, type WordStats } from "@/lib/lexicon";
import { bestMatch, similarityTyped, grade } from "@/lib/scoring";
import { recognize, recordDuring, speak, speechSupported } from "@/lib/speech";
import Mentor from "./Mentor";

type Feedback = { spell: Spell; word: Vocab; heard: string; result: CastResult; tip?: string; tipMode?: string };

const EL_TEXT: Record<Element, string> = { fire: "text-fire", water: "text-water", wind: "text-wind", shadow: "text-shadow", light: "text-light" };
const EL_BG: Record<Element, string> = { fire: "bg-fire", water: "bg-water", wind: "bg-wind", shadow: "bg-shadow", light: "bg-light" };
const KIND_ICON = { attack: "⚔", shield: "⛨", heal: "✚", drain: "☽" } as const;

export default function Game() {
  const [run, setRun] = useState<Run | null>(null);
  const [lang, setLang] = useState<LangId>("es");
  const L = LANGS[lang];
  const [lexicon, setLexicon] = useState<Vocab[]>([]);
  const [words, setWords] = useState<WordStats>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<Vocab | null>(null);
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [typed, setTyped] = useState("");
  const [useTyping, setUseTyping] = useState(false);
  const [micOk, setMicOk] = useState(true);
  const [shake, setShake] = useState<"enemy" | "player" | null>(null);
  const [backfires, setBackfires] = useState(0);
  const [growNote, setGrowNote] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const growing = useRef(false);
  const lastGrow = useRef(0);

  /** After each cast, quietly ask Gemini for 15 more entries in one of the spell's themes. */
  function growLexicon(spell: Spell, runNow: Run, wordsNow: WordStats) {
    if (growing.current || Date.now() - lastGrow.current < 8000) return;
    growing.current = true; lastGrow.current = Date.now();
    const theme = spell.themes[Math.floor(Math.random() * spell.themes.length)];
    const exclude = lexicon.filter((v) => v.theme === theme).map((v) => v.text);
    fetch("/api/vocab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme, exclude, lang }) })
      .then((r) => r.json())
      .then((d) => {
        if (!d.entries?.length) return;
        const keep = new Set<string>([...runNow.grudges, ...Object.keys(wordsNow).filter((id) => isWordMastered(wordsNow, id))]);
        const next = mergeExtra(lang, d.entries, keep);
        setLexicon(next);
        setGrowNote(`+${d.entries.length} ${theme} words`);
        setTimeout(() => setGrowNote(null), 2500);
      })
      .catch(() => {})
      .finally(() => { growing.current = false; });
  }

  useEffect(() => { const l = loadLang(); setLang(l); setLexicon(fullLexicon(l)); setWords(loadWords(l)); const ok = speechSupported(); setMicOk(ok); if (!ok) setUseTyping(true); }, []);
  function switchLang(l: LangId) { setLang(l); saveLang(l); setLexicon(fullLexicon(l)); setWords(loadWords(l)); }

  // draw a new incantation whenever the selected spell or the run state changes
  useEffect(() => {
    if (!run || !selected || run.phase !== "battle" || !lexicon.length) return;
    setPhrase(drawPhrase(run, spellById(selected), lexicon));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, selected, lexicon]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!run || run.phase !== "battle" || useTyping) return;
      const n = Number(e.key);
      if (n >= 1 && n <= run.hand.length) setSelected(run.hand[n - 1]);
      if (e.key === " " && selected && phrase && !listening) { e.preventDefault(); castSpell(spellById(selected), phrase); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, selected, phrase, listening, useTyping]);

  function start() { const r = newRun(); setRun(r); setFeedback(null); setSelected(r.hand[0]); }

  function floatText(text: string, cls: string) {
    const host = stageRef.current; if (!host) return;
    const el = document.createElement("div");
    el.className = `pointer-events-none absolute left-1/2 top-1/3 font-display text-4xl font-semibold animate-rise ${cls}`;
    el.textContent = text; host.appendChild(el); setTimeout(() => el.remove(), 1100);
  }

  async function castSpell(spell: Spell, word: Vocab) {
    if (!run || listening || run.phase !== "battle") return;
    setFeedback(null); setListening(true);
    let heard = "", rawScore = 0, ms = 0, audio: { b64: string; mime: string } | null = null;
    if (useTyping) { heard = typed; rawScore = similarityTyped(typed, word.text, L.tokens); ms = 1500; setTyped(""); }
    else {
      const { result, audio: a } = await recordDuring(() => recognize(L.speech));
      audio = a; const best = bestMatch(result.alts, word.text, L.tokens);
      heard = best.transcript; rawScore = best.score; ms = result.ms;
    }
    setListening(false);

    const mastered = isWordMastered(words, word.id);
    const { run: next, result } = cast(run, spell, word, rawScore, ms, mastered);
    const w = { ...words, [word.id]: { casts: (words[word.id]?.casts ?? 0) + 1, sum: (words[word.id]?.sum ?? 0) + result.score } };
    setWords(w); saveWords(lang, w);

    if (result.backfire) { floatText(`−${result.selfDamage}`, "text-blood"); setShake("player"); setBackfires((b) => b + 1); }
    else if (spell.kind === "shield") floatText(`⛨ ${result.shielded}`, "text-light");
    else if (spell.kind === "heal") floatText(`+${result.healed}`, "text-moss");
    else { floatText(`${result.crit ? "✦ " : ""}${result.damage + result.echoDamage}`, result.weak ? "text-light" : "text-ember"); setShake("enemy"); }
    setTimeout(() => setShake(null), 400);
    setRun(next); setFeedback({ spell, word, heard, result });
    growLexicon(spell, next, w);

    fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: word.text, reading: word.reading, focus: word.focus, transcript: heard, score: result.score, audio, lang }) })
      .then((r) => r.json()).then((d) => setFeedback((f) => (f && f.word.id === word.id ? { ...f, tip: d.tip, tipMode: d.mode } : f))).catch(() => {});
  }

  function choose(reward: Reward) { if (!run) return; const r = takeReward(run, reward); setRun(r); setFeedback(null); setSelected(r.hand[0]); }

  const mentorCtx = useMemo(() => run ? {
    lang, room: run.room, hp: run.hp, maxHp: run.maxHp, shield: run.shield, resonance: run.resonance,
    enemy: { name: enemyName(run.enemy, lang), gloss: run.enemy.gloss, weak: run.enemy.weak, resist: run.enemy.resist, minTier: run.enemy.minTier, hpNow: run.enemy.hpNow, hp: run.enemy.hp, intent: nextIntent(run.enemy) },
    hand: run.hand.map(spellById).map((s) => ({ phrase: spellName(s, lang), meaning: `${s.gloss} (${s.kind})`, element: s.element, tier: s.tier, focus: s.themes.join("/") })),
    selected: phrase ? { phrase: phrase.text + (phrase.reading ? ` (${phrase.reading})` : ""), meaning: phrase.en, focus: phrase.focus } : null,
    last: feedback ? { phrase: feedback.word.text, heard: feedback.heard, score: feedback.result.score, backfire: feedback.result.backfire } : null,
  } : { lang }, [run, phrase, feedback, lang]);

  if (!run) return <Title onStart={start} words={words} lexicon={lexicon} micOk={micOk} lang={lang} onLang={switchLang} />;
  if (run.phase === "dead" || run.phase === "won") return <End run={run} words={words} lexicon={lexicon} onRestart={start} lang={lang} />;
  if (run.phase === "reward" && run.rewards) return <><RewardScreen run={run} onChoose={choose} lang={lang} /><Mentor ctx={mentorCtx} nudge={backfires} /></>;

  const enemy = run.enemy;
  const hand = run.hand.map(spellById);
  const sel = selected ? spellById(selected) : null;
  const intent = nextIntent(enemy);

  return (
    <div className="animate-reveal">
      <Mentor ctx={mentorCtx} nudge={backfires} />
      <Path run={run} />

      {/* enemy */}
      <section className={`panel mt-5 flex items-center gap-5 px-6 py-5 ${shake === "enemy" ? "animate-hit" : ""}`}>
        <div className="text-6xl leading-none drop-shadow-[0_0_24px_rgba(0,0,0,.6)]">{enemy.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="font-display text-2xl font-medium">{enemyName(enemy, lang)}</h2>
            <span className="text-sm text-vellum2">{enemy.gloss}{enemy.kind === "final" ? ", final boss" : enemy.kind === "boss" ? ", boss" : enemy.kind === "elite" ? ", elite" : ""}</span>
          </div>
          <p className={`mt-0.5 truncate font-display text-sm text-vellum2 ${L.italic ? "italic" : ""}`}>{enemyTaunt(enemy, lang)}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="meter flex-1"><div className="h-full rounded-full bg-blood transition-all duration-500" style={{ width: `${(enemy.hpNow / enemy.hp) * 100}%` }} /></div>
            <span className="text-xs tabular-nums text-vellum2">{enemy.hpNow} / {enemy.hp}</span>
          </div>
          <p className="mt-2 text-sm">
            <span className={intent === "attack" && enemy.charged ? "text-blood" : intent === "curse" ? "text-shadow" : "text-ember"}>Next, it {INTENT_TEXT[intent](enemy.attack * (enemy.charged ? 2 : 1))}.</span>
          </p>
          <p className="mt-1 text-xs text-vellum2">
            Weak to <span className={EL_TEXT[enemy.weak]}>{ELEMENT_ICON[enemy.weak]} {ELEMENT_LABEL[enemy.weak]}</span>
            {enemy.resist && <> · resists <span className={EL_TEXT[enemy.resist]}>{ELEMENT_LABEL[enemy.resist]}</span></>}
            {enemy.minTier && <> · shrugs off spells below tier {enemy.minTier}</>}
          </p>
        </div>
      </section>

      {/* the incantation */}
      <section ref={stageRef} className={`relative mt-6 min-h-[220px] text-center ${shake === "player" ? "animate-hit" : ""}`}>
        {sel && phrase ? (
          <div key={phrase.id} className="animate-reveal">
            <p className="text-xs text-vellum2">
              {spellName(sel, lang)} draws from the lexicon · {phrase.theme}
              {run.cursed && <span className="text-shadow"> · cursed, one level harder</span>}
              {run.grudges.includes(phrase.id) && <span className="text-blood"> · a word that beat you</span>}
              {isWordMastered(words, phrase.id) && <span className="text-light"> · mastered</span>}
            </p>
            <h1 className={`mt-2 text-balance font-display text-5xl font-light leading-tight tracking-tight md:text-6xl ${L.italic ? "italic" : ""} ${listening ? "animate-breathe text-ember" : "text-vellum"}`}>{phrase.text}</h1>
            {phrase.reading && <p className="mt-1 font-display text-xl text-ember/90">{phrase.reading}</p>}
            <p className="mt-2 text-sm text-vellum2">“{phrase.en}”{phrase.focus ? ` · watch the ${phrase.focus}` : ""}</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {useTyping ? (
                <form onSubmit={(e) => { e.preventDefault(); castSpell(sel, phrase); }} className="flex w-full max-w-md gap-2">
                  <input autoFocus className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={L.hasReading ? "type the characters, or pinyin like xia4 yu3 le" : "type the incantation"} />
                  <button className="btn-ember">Cast</button>
                </form>
              ) : (
                <button onClick={() => castSpell(sel, phrase)} disabled={listening} className="btn-ember px-7 py-3 text-base">
                  {listening ? "Listening — say it now" : `Cast ${spellName(sel, lang)}`}
                </button>
              )}
              <button onClick={() => speak(phrase.text, L.speech)} className="btn-quiet">Hear it</button>
              <button onClick={() => setPhrase(drawPhrase(run, sel, lexicon))} className="btn-quiet" title="Draw a different incantation (no penalty)">Redraw</button>
            </div>
          </div>
        ) : (
          <p className="pt-16 font-display text-2xl italic text-vellum2">Choose a spell from your book.</p>
        )}
      </section>

      {/* resonance */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-vellum2">
        <span>Resonance</span>
        {[0, 1, 2].map((i) => <span key={i} className={`h-2 w-6 rounded-full transition ${i < run.resonance ? "bg-ember" : "bg-white/10"}`} />)}
        <span>{run.resonance >= 3 ? "charged: next cast crits" : "three good casts charge a crit"}</span>
        {run.shield > 0 && <span className="ml-3 text-light">⛨ {run.shield} shield</span>}
        <span className="ml-3 text-vellum2/70">lexicon {lexicon.length}{growNote && <span className="ml-1 text-moss animate-reveal">{growNote}</span>}</span>
      </div>

      {feedback && <Verdict f={feedback} lang={lang} />}

      {/* spellbook */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg">Spellbook</h3>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-vellum2">
            <input type="checkbox" className="accent-ember" checked={useTyping} onChange={(e) => setUseTyping(e.target.checked)} disabled={!micOk} /> type instead of speak
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {hand.map((s, i) => {
            const vs = elementVs(s.element, enemy);
            const active = selected === s.id;
            return (
              <button key={s.id} onClick={() => setSelected(s.id)}
                className={`flex items-center gap-3 rounded-full py-2 pl-2 pr-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${active ? "bg-vellum text-ink" : "bg-dusk/80 ring-1 ring-white/5 hover:bg-dusk2"}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${EL_BG[s.element]} text-base text-ink`}>{KIND_ICON[s.kind]}</span>
                <span className="leading-tight">
                  <span className={`block font-display text-base ${L.italic ? "italic" : ""}`}>{spellName(s, lang)}</span>
                  <span className={`block text-[11px] ${active ? "text-ink/60" : "text-vellum2"}`}>
                    {i + 1} · {KIND_LABEL[s.kind]} {s.power} · tier {s.tier}
                    {s.kind !== "shield" && s.kind !== "heal" && vs === "weak" && <span className={active ? "" : "text-light"}> · ×2 here</span>}
                    {s.kind !== "shield" && s.kind !== "heal" && vs === "resist" && " · resisted"}
                    {s.kind !== "shield" && s.kind !== "heal" && enemy.minTier && s.tier < enemy.minTier && " · too weak"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {run.relics.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-vellum2">
            {run.relics.map((id) => { const x = allRelics.find((r) => r.id === id)!; return <span key={id} title={x.desc}>{x.emoji} {x.name}</span>; })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- pieces ---------- */

function Path({ run }: { run: Run }) {
  return (
    <div className="flex items-center justify-between text-xs text-vellum2">
      <div className="flex items-center gap-3">
        <span className="font-display text-base text-vellum">Room {run.room + 1}</span>
        <div className="flex items-center gap-1.5">
          {ROOM_PLAN.map((k, i) => {
            const big = k === "boss" || k === "final";
            const cls = i < run.room ? "bg-moss" : i === run.room ? "bg-ember" : big ? "bg-blood/50" : "bg-white/15";
            return <span key={i} className={`rounded-full ${big ? "h-3 w-3" : "h-2 w-2"} ${cls}`} />;
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span>Your life</span>
        <div className="meter w-28"><div className="h-full rounded-full bg-moss transition-all" style={{ width: `${(run.hp / run.maxHp) * 100}%` }} /></div>
        <span className="tabular-nums text-vellum">{run.hp}</span>
      </div>
    </div>
  );
}

function Verdict({ f, lang }: { f: Feedback; lang: LangId }) {
  const g = grade(f.result.score, lang);
  const name = spellName(f.spell, lang);
  const r = f.result;
  const pct = Math.round(r.score * 100);
  const ring = r.backfire ? "#c8494c" : pct >= 90 ? "#e9d27c" : "#f0a35e";
  const effect = r.backfire ? `The incantation fizzles and burns you for ${r.selfDamage}.`
    : f.spell.kind === "shield" ? `${name} raises a shield of ${r.shielded}.`
    : f.spell.kind === "heal" ? `${name} mends ${r.healed}.`
    : `${name} lands for ${r.damage}${r.echoDamage ? ` and echoes for ${r.echoDamage}` : ""}${r.resonant ? ", resonant" : r.crit ? ", a critical" : ""}${r.weak ? ", twice as hard" : ""}${r.resist ? ", mostly resisted" : ""}${r.underTier ? ", too small for this foe" : ""}${r.healed ? `, draining ${r.healed}` : ""}.`;
  const enemyTurn = r.killed ? " It falls." : r.intent === "attack" ? ` It strikes back${r.blocked ? `; your shield takes ${r.blocked}` : ""}${r.enemyHit ? ` and you lose ${r.enemyHit}` : ", and nothing gets through"}.`
    : r.intent === "charge" ? " It gathers power." : r.intent === "curse" ? " It curses your next words." : ` It mends ${r.enemyHealed}.`;
  return (
    <section className="panel mt-5 flex items-center gap-5 px-5 py-4 animate-reveal">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={ring} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-lg">{pct}</span>
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg"><span className={g.color}>{g.label}.</span> {effect}{enemyTurn}</p>
        <p className="mt-1 text-sm text-vellum2">
          For “{f.word.text}” it heard “{f.heard || "nothing"}”.{r.grudge && <span className="text-blood"> This word will return.</span>}{" "}
          <span className="text-shadow">{f.tip ?? "Coach is listening…"}</span>
          {f.tipMode === "gemini" && <span className="ml-1 text-xs opacity-60">(Gemini heard your audio)</span>}
          {f.tipMode === "gemini-text" && <span className="ml-1 text-xs opacity-60">(Gemini, from transcript)</span>}
        </p>
      </div>
    </section>
  );
}

function RewardScreen({ run, onChoose, lang }: { run: Run; onChoose: (r: Reward) => void; lang: LangId }) {
  return (
    <div className="animate-reveal">
      <Path run={run} />
      <p className="mt-10 text-center text-sm text-vellum2">The {run.enemy.gloss} is gone.</p>
      <h2 className="mt-1 text-center font-display text-4xl font-light italic">Take one boon.</h2>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {run.rewards!.map((rw, i) => (
          <button key={i} onClick={() => onChoose(rw)} className="panel p-5 text-left transition hover:bg-dusk2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70">
            {rw.kind === "spell" && (<>
              <p className="text-xs text-vellum2">New spell, tier {rw.spell.tier}</p>
              <p className={`mt-1 font-display text-2xl ${LANGS[lang].italic ? "italic" : ""} ${EL_TEXT[rw.spell.element]}`}>{KIND_ICON[rw.spell.kind]} {spellName(rw.spell, lang)}</p>
              <p className="mt-1 text-sm text-vellum2">{rw.spell.gloss}. {KIND_LABEL[rw.spell.kind]} {rw.spell.power}. Draws words about {rw.spell.themes.join(", ")}.</p>
            </>)}
            {rw.kind === "relic" && (<>
              <p className="text-xs text-vellum2">Relic</p>
              <p className="mt-1 font-display text-2xl">{rw.relic.emoji} {rw.relic.name}</p>
              <p className="mt-1 text-sm text-vellum2">{rw.relic.desc}</p>
            </>)}
            {rw.kind === "heal" && (<>
              <p className="text-xs text-vellum2">Rest</p>
              <p className="mt-1 font-display text-2xl">Descansar</p>
              <p className="mt-1 text-sm text-vellum2">Recover {rw.amount} life before the next door.</p>
            </>)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Title({ onStart, words, lexicon, micOk, lang, onLang }: { onStart: () => void; words: WordStats; lexicon: Vocab[]; micOk: boolean; lang: LangId; onLang: (l: LangId) => void }) {
  const mastered = lexicon.filter((v) => isWordMastered(words, v.id)).length;
  const practiced = Object.keys(words).length;
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center animate-reveal">
      <h1 className="font-display text-7xl font-light italic tracking-tight text-vellum animate-flicker md:text-8xl">Incantation</h1>
      <p className="mt-4 max-w-md text-balance text-vellum2">Spells are effects. The words are drawn fresh from a lexicon of {lexicon.length} {LANGS[lang].english} entries, and it grows as you fight. Say them well and they hit hard. Mumble and they burn you. Eight rooms, one life.</p>
      <div className="mt-8 flex gap-2" role="radiogroup" aria-label="Language">
        {(Object.keys(LANGS) as LangId[]).map((l) => (
          <button key={l} role="radio" aria-checked={lang === l} onClick={() => onLang(l)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${lang === l ? "bg-vellum text-ink" : "bg-white/5 text-vellum2 hover:bg-white/10"}`}>
            {LANGS[l].label}
          </button>
        ))}
      </div>
      <button onClick={onStart} className="btn-ember mt-6 px-8 py-3 text-base">Begin the run</button>
      <div className="mt-12 grid max-w-sm gap-1.5 text-sm text-vellum2">
        <p>Pick a spell, press space, speak. Chrome, with the mic allowed.</p>
        <p>Words that beat you come back. Say a word well three times and it's mastered for good.</p>
        {practiced > 0 && <p className="text-vellum">{practiced} words practiced, {mastered} mastered.</p>}
        {!micOk && <p className="text-ember">This browser can't hear you. Typing mode is on; open Chrome for voice.</p>}
      </div>
    </div>
  );
}

function End({ run, words, lexicon, onRestart, lang }: { run: Run; words: WordStats; lexicon: Vocab[]; onRestart: () => void; lang: LangId }) {
  const s = run.stats;
  const acc = s.casts ? Math.round((s.scoreSum / s.casts) * 100) : 0;
  const won = run.phase === "won";
  const seen = run.wordsSeen.map((id) => lexicon.find((v) => v.id === id)).filter(Boolean) as Vocab[];
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center animate-reveal">
      <p className="text-sm text-vellum2">{won ? "The last word was yours." : `Room ${run.room + 1} kept you.`}</p>
      <h1 className="mt-2 font-display text-6xl font-light italic">{won ? `${enemyName(run.enemy, lang)} is silenced` : "The run ends"}</h1>
      <div className="mt-10 flex flex-wrap justify-center gap-x-10 gap-y-4">
        {[["words practiced", seen.length], ["average accuracy", `${acc}%`], ["perfect casts", s.perfect], ["backfires", s.backfires]].map(([k, v]) => (
          <div key={String(k)}><p className="font-display text-4xl">{v}</p><p className="text-xs text-vellum2">{k}</p></div>
        ))}
      </div>
      <ul className="mt-10 w-full max-w-md text-left text-sm">
        {seen.map((v) => (
          <li key={v.id} className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2">
            <span className={`font-display text-base ${LANGS[lang].italic ? "italic" : ""}`}>{v.text}{v.reading ? <span className="ml-2 text-sm not-italic text-ember/80">{v.reading}</span> : null} <span className="text-xs not-italic text-vellum2">{v.en}</span></span>
            <span className={run.grudges.includes(v.id) ? "text-blood" : isWordMastered(words, v.id) ? "text-light" : "text-vellum2"}>
              {run.grudges.includes(v.id) ? "still beats you" : isWordMastered(words, v.id) ? "mastered" : `${Math.round(wordAvg(words, v.id) * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
      <button onClick={onRestart} className="btn-ember mt-10 px-8 py-3 text-base">Run again</button>
    </div>
  );
}

