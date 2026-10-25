"use client";

import { useEffect, useRef, useState } from "react";
import {
  EnemySprite, ENEMY_SPRITE_IDS, Sigil, SpellCard, BreathPips, HpBar, StatusBadge, STATUS_META, useFloatText, Burst,
  VuMeter, ListeningRing, DoorCard, PathStrip, InkCounter, LogPanel, Ruby, withPinyin, IntentBadge, useStageFx, SfxToggle,
  type Element, type EnemyKind, type NodeKind, type StatusId, type IntentId, type ReactionId, type LangId,
} from "@/components/fx";
import { playSfx, type SfxKind } from "@/lib/sfx";

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
const INTENTS: IntentId[] = ["attack", "double", "charge", "curse", "silence", "heal", "block"];
const INTENT_ZH: Record<IntentId, string> = { attack: "攻击", double: "连击", charge: "蓄力", curse: "诅咒", silence: "沉默", heal: "治疗", block: "格挡" };
const INTENT_ES: Record<IntentId, string> = { attack: "Golpe", double: "Doble golpe", charge: "Carga", curse: "Maldición", silence: "Silencio", heal: "Curación", block: "Bloqueo" };
const REACTIONS: ReactionId[] = ["wildfire", "steam", "storm", "eclipse", "dusk"];
const SFX: SfxKind[] = ["hit", "crit", "backfire", "shield", "heal", "enemyHit", "select", "listen", "win", "lose"];
void DOORS;

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

/* ---------------- stage fx (useStageFx) ---------------- */

function StageFxDemo() {
  const enemy = useStageFx();
  const self = useStageFx();
  const [el, setEl] = useState<Element>("fire");
  const [crit, setCrit] = useState(false);
  const [reaction, setReaction] = useState<ReactionId | "">("");
  const [weak, setWeak] = useState(false);
  const [hurt, setHurt] = useState(false);
  const [sprite, setSprite] = useState("lobo");
  const hit = (amount: number) => {
    setHurt(true); setTimeout(() => setHurt(false), 380);
    enemy.strike(el, { amount, crit, reaction: reaction || null, weak });
  };
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <section ref={enemy.host} className="panel relative flex flex-col items-center gap-3 px-6 py-5" aria-label="enemy stage">
          <div className="fx-stage-sprite relative">
            <EnemySprite id={sprite} kind={KIND_OF[sprite] ?? "minion"} hurt={hurt} />
            {enemy.layer}
          </div>
          <select value={sprite} onChange={(e) => setSprite(e.target.value)} className="rounded-full bg-black/30 px-3 py-1 text-xs text-vellum ring-1 ring-white/10">
            {ENEMY_SPRITE_IDS.map((id) => <option key={id} value={id}>{NAME_OF[id]}</option>)}
          </select>
        </section>
        <section ref={self.host} className="panel relative flex min-h-[200px] flex-col items-center justify-center px-6 py-5 text-center" aria-label="incantation stage">
          <p className="text-xs text-vellum2">the incantation (self host)</p>
          <p className="mt-2 font-display text-4xl font-light text-vellum">Buenos días</p>
          <p className="mt-2 text-sm text-vellum2">“good morning”</p>
          {self.layer}
        </section>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-vellum2">strike:</span>
        {ELEMENTS.map((e) => (
          <button key={e} onClick={() => setEl(e)} className={`rounded-full p-1 ${el === e ? "bg-white/15" : "hover:bg-white/5"}`} title={e}><Sigil element={e} size={18} /></button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs text-vellum2"><input type="checkbox" className="accent-ember" checked={crit} onChange={(e) => setCrit(e.target.checked)} /> crit</label>
        <label className="flex items-center gap-1 text-xs text-vellum2"><input type="checkbox" className="accent-ember" checked={weak} onChange={(e) => setWeak(e.target.checked)} /> weak (×2)</label>
        <select value={reaction} onChange={(e) => setReaction(e.target.value as ReactionId | "")} className="rounded-full bg-black/30 px-3 py-1 text-xs text-vellum ring-1 ring-white/10">
          <option value="">no reaction</option>
          {REACTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={() => hit(12)} className="btn-ember px-3 py-1.5 text-xs">hit 12</button>
        <button onClick={() => hit(24)} className="btn-ember px-3 py-1.5 text-xs">hit 24</button>
        <button onClick={() => hit(47)} className="btn-ember px-3 py-1.5 text-xs">hit 47</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => self.selfHit(6, { backfire: true })} className="btn-quiet px-3 py-1.5 text-xs">backfire −6 (self)</button>
        <button onClick={() => self.selfHit(18)} className="btn-quiet px-3 py-1.5 text-xs">enemy hits you −18 (self)</button>
        <button onClick={() => self.shield(10)} className="btn-quiet px-3 py-1.5 text-xs">shield ⛨ 10 (self)</button>
        <button onClick={() => self.heal(9)} className="btn-quiet px-3 py-1.5 text-xs">heal +9 (self)</button>
        <button onClick={() => enemy.heal(14)} className="btn-quiet px-3 py-1.5 text-xs">enemy mends +14</button>
        <button onClick={() => enemy.float("12", "text-fire")} className="btn-quiet px-3 py-1.5 text-xs">float (compat)</button>
        <button onClick={() => enemy.callout("STEAM!", "water")} className="btn-quiet px-3 py-1.5 text-xs">callout</button>
        <button onClick={() => enemy.shake("soft")} className="btn-quiet px-3 py-1.5 text-xs">shake soft</button>
        <button onClick={() => enemy.shake("hard")} className="btn-quiet px-3 py-1.5 text-xs">shake hard</button>
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

/* ---------------- intent badges ---------------- */

function Intents() {
  const [lang, setLang] = useState<LangId>("es");
  const [shield, setShield] = useState(0);
  const [armor, setArmor] = useState(0);
  const [charged, setCharged] = useState(false);
  const [step, setStep] = useState(0);
  const amount = (i: IntentId) => (i === "attack" ? 18 : i === "double" ? 20 : i === "block" ? 27 : i === "heal" ? 14 : 0);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Slider label="your shield" value={shield} min={0} max={40} onChange={setShield} />
        <Slider label="your armor" value={armor} min={0} max={20} onChange={setArmor} />
        <label className="flex items-center gap-2 text-xs text-vellum2"><input type="checkbox" className="accent-ember" checked={charged} onChange={(e) => setCharged(e.target.checked)} /> charged (×2)</label>
        <button onClick={() => setLang((l) => (l === "es" ? "zh" : "es"))} className="btn-quiet px-3 py-1 text-xs">names: {lang === "es" ? "Español" : "中文 + pinyin"}</button>
        <button onClick={() => setStep((s) => s + 1)} className="btn-quiet px-3 py-1 text-xs">new intent (pulse)</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {INTENTS.map((i) => (
          <IntentBadge
            key={i} intent={i} amount={amount(i) * (charged && (i === "attack" || i === "double") ? 2 : 1)} charged={charged && (i === "attack" || i === "double" || i === "charge")}
            shield={shield} armor={armor} title={lang === "zh" ? INTENT_ZH[i] : INTENT_ES[i]} lang={lang} pulseKey={step}
            note={i === "attack" ? "weakened" : i === "charge" ? "the chill will hold it" : null}
          />
        ))}
        <IntentBadge intent="attack" amount={18} title="Golpe" note="it will stagger instead" pulseKey={step} />
        <p className="self-center text-xs text-vellum2">← without `shield`/`armor` the badge keeps the old copy: no "you'd lose" line, danger only when charged.</p>
      </div>
    </>
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
  const [lines, setLines] = useState<string[]>(["You enter the crypt.", "Araña de cripta blocks the way.", "Chispa+ lands for 14, critical — steam. Burn 3.", "Araña de cripta strikes for 17; you lose 6.", "Took Lengua de plata."]);
  const [sfxEl, setSfxEl] = useState<Element>("fire");
  const path = FULL_PATH.slice(0, floor + (chosen ? 1 : 0));

  return (
    <div className="pb-24 animate-reveal">
      <h1 className="font-display text-4xl font-light italic">fx — component library</h1>
      <p className="mt-2 max-w-xl text-sm text-vellum2">Every primitive from <code className="text-vellum">components/fx</code> in every state. Dark grimoire palette, Fraunces for display, Manrope for UI, Noto Serif SC for 中文 (never italic).</p>

      <Section title="Ruby · withPinyin" note="pinyin over every Chinese string; Spanish passes through (italic when asked)">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="panel p-4 text-sm">
            <p className="text-xs text-vellum2">Ruby — in-world names</p>
            <p className="mt-2 font-display text-2xl"><Ruby text="沼泽泥怪" lang="zh" /> <span className="text-sm text-vellum2">swamp slime</span></p>
            <p className="font-display text-2xl"><Ruby text="回声女巫" lang="zh" /> <span className="text-sm text-vellum2">echo witch</span></p>
            <p className="font-display text-2xl"><Ruby text="Bruja del eco" lang="es" italic /> <span className="text-sm text-vellum2">es, italic</span></p>
            <p className="mt-2 text-base"><Ruby text="下雨了" lang="zh" rt="xià yǔ le" /> <span className="text-xs text-vellum2">· rt override (curated reading)</span></p>
            <p className="mt-2"><Ruby text="中文" lang="zh" className="font-display text-base" /> <Ruby text="Español" lang="es" className="font-display text-base" /> <span className="text-xs text-vellum2">· the Title's language buttons</span></p>
          </div>
          <div className="panel p-4 text-sm">
            <p className="text-xs text-vellum2">withPinyin — mixed sentences</p>
            <p className="mt-2 text-vellum">{withPinyin("火花+ lands for 14, critical — steam. Burn 3.", "zh")}</p>
            <p className="mt-1 text-vellum">{withPinyin("For “今天很冷” it heard “今天很累”.", "zh")}</p>
            <p className="mt-1 text-vellum">{withPinyin("真恶心！(How gross!)", "zh")}</p>
            <p className="mt-1 text-shadow">{withPinyin("Your 不 should fall to the second tone before 好: bú hǎo. Try 不好 again.", "zh")}</p>
            <p className="mt-1 text-vellum">{withPinyin("No Chinese here: unchanged string.", "zh")}</p>
            <p className="mt-2 font-display text-lg"><Ruby text="完美." lang="zh" className="text-light" /> <Ruby text="马马虎虎." lang="zh" className="text-fire" /> <Ruby text="失败！" lang="zh" className="text-blood" /></p>
          </div>
        </div>
      </Section>

      <Section title="IntentBadge" note="the enemy's next move, large; blood + pulse when it gets through or it is charged; stacks under the sprite on phones">
        <Intents />
      </Section>

      <Section title="useStageFx" note="drop-in for useFloatText with element strikes, knockback, crit numbers, reaction banners, vignette, shield ring, motes, shake and sound">
        <StageFxDemo />
      </Section>

      <Section title="Sound (lib/sfx)" note="synthesized cues; the toggle persists in localStorage incantation.sfx">
        <div className="flex flex-wrap items-center gap-2">
          <SfxToggle className="!h-9 !w-9 bg-white/5 text-lg" />
          <span className="text-xs text-vellum2">element:</span>
          {ELEMENTS.map((e) => (
            <button key={e} onClick={() => setSfxEl(e)} className={`rounded-full p-1 ${sfxEl === e ? "bg-white/15" : "hover:bg-white/5"}`} title={e}><Sigil element={e} size={18} /></button>
          ))}
          {SFX.map((k) => <button key={k} onClick={() => playSfx(k, { element: sfxEl })} className="btn-quiet px-3 py-1.5 text-xs">{k}</button>)}
        </div>
      </Section>

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

      <Section title="SpellCard" note="150 px wide; click to select. Hints read in light (good) or blood (bad). lang=zh adds pinyin.">
        <div className="flex flex-wrap gap-3">
          <SpellCard name="Chispa" desc="Deal 12. Burn 2 for 2 turns." element="fire" kind="attack" tier={1} cost={1} power={12} hotkey="1" selected={selectedCard === "chispa"} onClick={() => setSelectedCard("chispa")} />
          <SpellCard name="Gota" desc="Deal 12. Chill 1." element="water" kind="attack" tier={1} cost={1} power={12} hotkey="2" hint="steam ↑" selected={selectedCard === "gota"} onClick={() => setSelectedCard("gota")} />
          <SpellCard name="Llamarada+" desc="Deal 31. Burn 4 for 2 turns." element="fire" kind="attack" tier={2} cost={2} power={31} up hotkey="3" hint="×2 here" selected={selectedCard === "llamarada"} onClick={() => setSelectedCard("llamarada")} />
          <SpellCard name="Infierno" desc="Deal 42. Burn 5 for 3 turns." element="fire" kind="attack" tier={3} cost={3} power={42} hotkey="4" disabled hint="silenced" />
          <SpellCard name="火花" desc="Deal 12. Burn 2 for 2 turns." element="fire" kind="attack" tier={1} cost={1} power={12} italic={false} lang="zh" hint="resisted" selected={selectedCard === "zh"} onClick={() => setSelectedCard("zh")} />
          <SpellCard name="地狱火+" desc="Deal 55. Burn 6 for 3 turns." element="fire" kind="attack" tier={3} cost={3} power={55} up lang="zh" hotkey="5" selected={selectedCard === "zh2"} onClick={() => setSelectedCard("zh2")} />
          <SpellCard name="Escudo" desc="Gain 10 shield." element="light" kind="shield" tier={1} cost={1} power={10} hotkey="6" selected={selectedCard === "escudo"} onClick={() => setSelectedCard("escudo")} />
          <SpellCard name="Foco" desc="Gain focus: your next cast scores +0.10." element="light" kind="empower" tier={1} cost={0} hotkey="7" selected={selectedCard === "foco"} onClick={() => setSelectedCard("foco")} />
          <SpellCard name="Niebla" desc="Weak 2 and chill 2 on the enemy." element="water" kind="hex" tier={1} cost={1} hint="3 breath" selected={selectedCard === "niebla"} onClick={() => setSelectedCard("niebla")} />
          <SpellCard name="Sangría" desc="Drain 20; heal half of it." element="shadow" kind="drain" tier={2} cost={2} power={20} disabled hint="too weak" />
          <SpellCard name="Plegaria" desc="Heal 30. Regen 5 for 3 turns." element="water" kind="heal" tier={3} cost={3} power={30} hotkey="8" disabled hint="not enough breath" />
        </div>
      </Section>

      <Section title="BreathPips · HpBar · InkCounter · LogPanel">
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
            <p className="mb-2 text-xs text-vellum2">LogPanel, lang omitted (engine lines as written)</p>
            <LogPanel lines={lines} />
            <p className="mb-2 mt-4 text-xs text-vellum2">LogPanel lang=&quot;zh&quot; — the same lines through localizeLine + withPinyin</p>
            <LogPanel lines={lines} lang="zh" />
            <button onClick={() => setLines((l) => [...l, `Gota lands for ${10 + l.length} — steam. Chill 1.`])} className="btn-quiet mt-3 px-3 py-1 text-xs">add a line</button>
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

      <Section title="useFloatText · Burst" note="the older primitives, still exported; numbers rise from the host's upper third, the burst fires on each trigger change">
        <Stage />
      </Section>

      <Section title="VuMeter · ListeningRing">
        <Mic />
      </Section>

      <Section title="DoorCard" note="all node kinds; lang=zh adds pinyin; the last one disabled">
        <div className="flex flex-wrap gap-3">
          <DoorCard kind="fight" title="Rata gigante" subtitle="giant rat" onClick={() => {}} />
          <DoorCard kind="elite" title="Gólem de piedra" subtitle="elite · stone golem" onClick={() => {}} />
          <DoorCard kind="rest" title="Descanso" subtitle="heal, study or forget" onClick={() => {}} />
          <DoorCard kind="event" title="Una puerta extraña" subtitle="something waits" onClick={() => {}} />
          <DoorCard kind="merchant" title="商人" subtitle="spend ink" lang="zh" onClick={() => {}} />
          <DoorCard kind="boss" title="灰烬龙" subtitle="boss · ash dragon" lang="zh" onClick={() => {}} />
          <DoorCard kind="final" title="遗忘" subtitle="the Forgetting" italic={false} lang="zh" onClick={() => {}} />
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
