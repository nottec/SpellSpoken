"use client";

import { useEffect, useRef, useState } from "react";
import {
  EnemySprite, ENEMY_SPRITE_IDS, Sigil, SpellCard, BreathPips, HpBar, StatusBadge, STATUS_META, useFloatText, Burst,
  VuMeter, ListeningRing, DoorCard, PathStrip, InkCounter, LogPanel,
  type Element, type EnemyKind, type NodeKind, type StatusId,
} from "@/components/fx";

const KIND_OF: Record<string, EnemyKind> = {
  limo: "minion", murci: "minion", rata: "minion", arana: "minion", cuervo: "minion", duende: "minion",
  golem: "elite", espectro: "elite", lobo: "elite", bruja: "elite", dragon: "boss", hidra: "boss", olvido: "final",
};
const NAME_OF: Record<string, string> = {
  limo: "Limo de pantano", murci: "Murciélago", rata: "Rata gigante", arana: "Araña de cripta", cuervo: "Cuervo", duende: "Duende",
  golem: "Gólem de piedra", espectro: "Espectro", lobo: "Lobo de ceniza", bruja: "Bruja del eco", dragon: "Dragón de ceniza", hidra: "Hidra", olvido: "El Olvido",
};
const ELEMENTS: Element[] = ["fire", "water", "wind", "shadow", "light"];
const DOORS: NodeKind[] = ["fight", "elite", "rest", "event", "merchant", "boss", "final"];
const FLOORS: NodeKind[][] = [["fight"], ["fight", "event", "elite"], ["rest", "fight"], ["boss"], ["merchant", "fight", "event"], ["elite", "rest"], ["fight", "merchant", "event"], ["final"]];
const FULL_PATH = [0, 2, 1, 0, 1, 0, 2, 0];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-display text-2xl">{title}</h2>
        {note && <p className="text-xs text-vellum2">{note}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-vellum2">
      {label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-ember" />
      <span className="w-8 tabular-nums text-vellum">{value}</span>
    </label>
  );
}

/* ---------------- sprites ---------------- */

function SpriteCell({ id, allHit, allCharged, allDead }: { id: string; allHit: number; allCharged: boolean; allDead: boolean }) {
  const [hurt, setHurt] = useState(false);
  const [charged, setCharged] = useState(false);
  const [dead, setDead] = useState(false);
  const hit = () => { setHurt(true); setTimeout(() => setHurt(false), 380); };
  useEffect(() => { if (allHit) hit(); }, [allHit]);
  const kind = KIND_OF[id] ?? "minion";
  return (
    <div className="panel flex flex-col items-center p-3">
      <div className="flex h-[210px] items-center justify-center">
        <EnemySprite id={id} kind={kind} hurt={hurt} charged={charged || allCharged} dead={dead || allDead} />
      </div>
      <p className="mt-1 font-display text-base italic">{NAME_OF[id] ?? "(unknown id)"}</p>
      <p className="text-[11px] text-vellum2">{id} · {kind}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        <button onClick={hit} className="btn-quiet px-2.5 py-1 text-xs">Hit</button>
        <button onClick={() => setCharged((c) => !c)} className={`btn-quiet px-2.5 py-1 text-xs ${charged ? "!bg-blood/30" : ""}`}>Charged</button>
        <button onClick={() => setDead((d) => !d)} className={`btn-quiet px-2.5 py-1 text-xs ${dead ? "!bg-white/20" : ""}`}>{dead ? "Revive" : "Kill"}</button>
      </div>
    </div>
  );
}

/* ---------------- stage (float text + burst) ---------------- */

function Stage() {
  const { host, float, layer } = useFloatText();
  const [el, setEl] = useState<Element>("fire");
  const [trigger, setTrigger] = useState(0);
  const [hurt, setHurt] = useState(false);
  const strike = () => {
    setTrigger((t) => t + 1); setHurt(true); setTimeout(() => setHurt(false), 380);
    float(`${el === "light" ? "✦ " : ""}${18 + Math.floor(Math.random() * 20)}`, el === "light" ? "text-light" : "text-ember");
  };
  return (
    <>
      <div ref={host} className="panel relative flex h-[260px] items-center justify-center overflow-visible">
        <div className="relative">
          <EnemySprite id="lobo" kind="elite" hurt={hurt} />
          <Burst element={el} trigger={trigger} />
        </div>
        {layer}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={strike} className="btn-ember px-4 py-1.5 text-xs">Strike (burst + number)</button>
        <button onClick={() => float("−12", "text-blood")} className="btn-quiet px-3 py-1.5 text-xs">−12 backfire</button>
        <button onClick={() => float("+9", "text-moss")} className="btn-quiet px-3 py-1.5 text-xs">+9 heal</button>
        <button onClick={() => float("⛨ 10", "text-light")} className="btn-quiet px-3 py-1.5 text-xs">⛨ 10 shield</button>
        <button onClick={() => { float("12"); float("−4", "text-blood"); float("+3", "text-moss"); }} className="btn-quiet px-3 py-1.5 text-xs">three at once</button>
        <span className="ml-2 flex items-center gap-1 text-xs text-vellum2">
          burst:
          {ELEMENTS.map((e) => (
            <button key={e} onClick={() => setEl(e)} className={`rounded-full p-1 ${el === e ? "bg-white/15" : "hover:bg-white/5"}`} title={e}><Sigil element={e} size={18} /></button>
          ))}
        </span>
      </div>
    </>
  );
}

/* ---------------- mic meters ---------------- */

function Mic() {
  const [level, setLevel] = useState(0.4);
  const [active, setActive] = useState(true);
  const raf = useRef(0);
  const simulate = () => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const tick = (t: number) => {
      const s = (t - t0) / 1000;
      if (s > 3.5) { setLevel(0.1); return; }
      setLevel(Math.max(0, 0.45 + 0.4 * Math.sin(s * 7) * Math.sin(s * 2.3) + 0.1 * Math.sin(s * 31)));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <VuMeter level={level} active={active} />
      <ListeningRing active={active} level={level}>
        <button className="btn-ember px-6 py-2.5 text-sm">{active ? "Listening — say it now" : "Cast"}</button>
      </ListeningRing>
      <div className="flex flex-col gap-2">
        <Slider label="level" value={Math.round(level * 100)} min={0} max={100} onChange={(v) => setLevel(v / 100)} />
        <label className="flex items-center gap-2 text-xs text-vellum2"><input type="checkbox" className="accent-ember" checked={active} onChange={(e) => setActive(e.target.checked)} /> active</label>
        <button onClick={simulate} className="btn-quiet px-3 py-1 text-xs">simulate a voice (3.5 s)</button>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function FxDevPage() {
  const [allHit, setAllHit] = useState(0);
  const [allCharged, setAllCharged] = useState(false);
  const [allDead, setAllDead] = useState(false);
  const [selectedCard, setSelectedCard] = useState("chispa");
  const [breath, setBreath] = useState(2);
  const [maxBreath, setMaxBreath] = useState(3);
  const [hp, setHp] = useState(58);
  const [enemyHp, setEnemyHp] = useState(140);
  const [ink, setInk] = useState(30);
  const [inkDelta, setInkDelta] = useState<number | undefined>(undefined);
  const [floor, setFloor] = useState(2);
  const [chosen, setChosen] = useState(false);
  const [lines, setLines] = useState<string[]>(["You enter the crypt.", "Araña de cripta appears.", "Chispa lands for 14. Burn 2.", "It bites you for 6."]);
  const path = FULL_PATH.slice(0, floor + (chosen ? 1 : 0));

  return (
    <div className="pb-24 animate-reveal">
      <h1 className="font-display text-4xl font-light italic">fx — component library</h1>
      <p className="mt-2 max-w-xl text-sm text-vellum2">Every primitive from <code className="text-vellum">components/fx</code> in every state. Dark grimoire palette, Fraunces for display, Manrope for UI, Noto Serif SC for 中文 (never italic).</p>

      <Section title="EnemySprite" note="13 ids from DESIGN.md §5 plus the fallback wisp. Each has its own idle.">
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => setAllHit((n) => n + 1)} className="btn-quiet px-3 py-1 text-xs">Hit all</button>
          <button onClick={() => setAllCharged((c) => !c)} className={`btn-quiet px-3 py-1 text-xs ${allCharged ? "!bg-blood/30" : ""}`}>Charge all</button>
          <button onClick={() => setAllDead((d) => !d)} className="btn-quiet px-3 py-1 text-xs">{allDead ? "Revive all" : "Kill all"}</button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[...ENEMY_SPRITE_IDS, "unknown-id"].map((id) => <SpriteCell key={id} id={id} allHit={allHit} allCharged={allCharged} allDead={allDead} />)}
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-vellum2">Size override via className (w-12 / w-16): <EnemySprite id="rata" kind="minion" className="h-12 w-12" /><EnemySprite id="dragon" kind="boss" className="h-16 w-16" /></div>
      </Section>

      <Section title="Sigil" note="element glyphs in element colour; replaces the emoji">
        <div className="flex flex-wrap items-center gap-5">
          {ELEMENTS.map((e) => <span key={e} className="flex items-center gap-2 text-sm text-vellum2"><Sigil element={e} size={18} /><Sigil element={e} size={32} />{e}</span>)}
        </div>
      </Section>

      <Section title="SpellCard" note="150 px wide; click to select. Hints read in light (good) or blood (bad).">
        <div className="flex flex-wrap gap-3">
          <SpellCard name="Chispa" desc="Deal 12. Burn 2 for 2 turns." element="fire" kind="attack" tier={1} cost={1} power={12} hotkey="1" selected={selectedCard === "chispa"} onClick={() => setSelectedCard("chispa")} />
          <SpellCard name="Gota" desc="Deal 12. Chill 1." element="water" kind="attack" tier={1} cost={1} power={12} hotkey="2" hint="steam ↑" selected={selectedCard === "gota"} onClick={() => setSelectedCard("gota")} />
          <SpellCard name="Llamarada+" desc="Deal 31. Burn 4 for 2 turns." element="fire" kind="attack" tier={2} cost={2} power={31} up hotkey="3" hint="×2 here" selected={selectedCard === "llamarada"} onClick={() => setSelectedCard("llamarada")} />
          <SpellCard name="Infierno" desc="Deal 42. Burn 5 for 3 turns." element="fire" kind="attack" tier={3} cost={3} power={42} hotkey="4" disabled hint="silenced" />
          <SpellCard name="火花" desc="Deal 12. Burn 2 for 2 turns." element="fire" kind="attack" tier={1} cost={1} power={12} italic={false} hint="resisted" selected={selectedCard === "zh"} onClick={() => setSelectedCard("zh")} />
          <SpellCard name="Escudo" desc="Gain 10 shield." element="light" kind="shield" tier={1} cost={1} power={10} hotkey="5" selected={selectedCard === "escudo"} onClick={() => setSelectedCard("escudo")} />
          <SpellCard name="Foco" desc="Gain focus: your next cast scores +0.10." element="light" kind="empower" tier={1} cost={0} hotkey="6" selected={selectedCard === "foco"} onClick={() => setSelectedCard("foco")} />
          <SpellCard name="Niebla" desc="Weak 2 and chill 2 on the enemy." element="water" kind="hex" tier={1} cost={1} hint="3 breath" selected={selectedCard === "niebla"} onClick={() => setSelectedCard("niebla")} />
          <SpellCard name="Sangría" desc="Drain 20; heal half of it." element="shadow" kind="drain" tier={2} cost={2} power={20} disabled hint="too weak" />
          <SpellCard name="Plegaria" desc="Heal 30. Regen 5 for 3 turns." element="water" kind="heal" tier={3} cost={3} power={30} hotkey="7" disabled hint="not enough breath" />
        </div>
      </Section>

      <Section title="BreathPips · HpBar · InkCounter">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="panel p-4">
            <BreathPips current={breath} max={maxBreath} />
            <div className="mt-3 flex flex-col gap-2">
              <Slider label="current" value={breath} min={0} max={maxBreath} onChange={setBreath} />
              <Slider label="max" value={maxBreath} min={1} max={6} onChange={(v) => { setMaxBreath(v); setBreath((b) => Math.min(b, v)); }} />
            </div>
          </div>
          <div className="panel p-4">
            <InkCounter value={ink} delta={inkDelta} />
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setInk((v) => v + 12); setInkDelta(12); }} className="btn-quiet px-3 py-1 text-xs">+12</button>
              <button onClick={() => { setInk((v) => Math.max(0, v - 8)); setInkDelta(-8); }} className="btn-quiet px-3 py-1 text-xs">−8</button>
            </div>
          </div>
          <div className="panel flex flex-col gap-3 p-4">
            <HpBar value={hp} max={80} label="Your life" />
            <HpBar value={enemyHp} max={140} color="blood" label="Dragón" />
            <HpBar value={14} max={30} color="light" label="Shield" ghost={false} />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setHp((h) => Math.max(0, h - 13))} className="btn-quiet px-3 py-1 text-xs">take 13</button>
              <button onClick={() => setHp((h) => Math.min(80, h + 9))} className="btn-quiet px-3 py-1 text-xs">heal 9</button>
              <button onClick={() => setEnemyHp((h) => Math.max(0, h - 34))} className="btn-quiet px-3 py-1 text-xs">hit dragon 34</button>
              <button onClick={() => { setHp(58); setEnemyHp(140); }} className="btn-quiet px-3 py-1 text-xs">reset</button>
            </div>
          </div>
          <div className="panel p-4">
            <LogPanel lines={lines} />
            <button onClick={() => setLines((l) => [...l, `Turn ${l.length}: Gota lands for ${10 + l.length}. Steam!`])} className="btn-quiet mt-3 px-3 py-1 text-xs">add a line</button>
          </div>
        </div>
      </Section>

      <Section title="StatusBadge" note="hover for the meaning; self badges ring moss">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(STATUS_META) as StatusId[]).map((id) => <StatusBadge key={id} id={id} stacks={id === "burn" ? 3 : id === "armor" ? 6 : id === "strength" ? 3 : id === "regen" ? 5 : 1} turns={id === "strength" ? 99 : id === "stagger" ? 0 : 2} />)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge id="focus" stacks={1} turns={99} target="self" />
          <StatusBadge id="armor" stacks={6} turns={99} target="self" />
          <StatusBadge id="silence" stacks={1} turns={1} target="self" />
          <StatusBadge id="regen" stacks={5} turns={3} target="self" />
        </div>
        <ul className="mt-3 grid gap-1 text-xs text-vellum2 sm:grid-cols-2">
          {(Object.keys(STATUS_META) as StatusId[]).map((id) => <li key={id}><span style={{ color: STATUS_META[id].color }}>{STATUS_META[id].label}</span> — {STATUS_META[id].description}</li>)}
        </ul>
      </Section>

      <Section title="useFloatText · Burst" note="numbers rise from the host's upper third; the burst fires on each trigger change">
        <Stage />
      </Section>

      <Section title="VuMeter · ListeningRing">
        <Mic />
      </Section>

      <Section title="DoorCard" note="all node kinds; the last one disabled">
        <div className="flex flex-wrap gap-3">
          <DoorCard kind="fight" title="Rata gigante" subtitle="giant rat" onClick={() => {}} />
          <DoorCard kind="elite" title="Gólem de piedra" subtitle="elite · stone golem" onClick={() => {}} />
          <DoorCard kind="rest" title="Descanso" subtitle="heal, study or forget" onClick={() => {}} />
          <DoorCard kind="event" title="Una puerta extraña" subtitle="something waits" onClick={() => {}} />
          <DoorCard kind="merchant" title="Mercader" subtitle="cards, relics, ink" onClick={() => {}} />
          <DoorCard kind="boss" title="Dragón de ceniza" subtitle="boss · ash dragon" onClick={() => {}} />
          <DoorCard kind="final" title="遗忘" subtitle="the Forgetting" italic={false} onClick={() => {}} />
          <DoorCard kind="fight" title="Cuervo" subtitle="not reachable" disabled />
        </div>
      </Section>

      <Section title="PathStrip" note="8 floors; drag the floor, toggle whether this floor's door is chosen">
        <div className="panel inline-flex flex-col gap-3 p-4">
          <PathStrip floors={FLOORS} path={path} floor={floor} />
          <Slider label="floor" value={floor} min={0} max={7} onChange={setFloor} />
          <label className="flex items-center gap-2 text-xs text-vellum2"><input type="checkbox" className="accent-ember" checked={chosen} onChange={(e) => setChosen(e.target.checked)} /> door chosen on this floor (in battle)</label>
        </div>
      </Section>
    </div>
  );
}
