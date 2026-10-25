"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement, type RefObject } from "react";
import { playSfx } from "@/lib/sfx";
import { ELEMENT_HEX, PALETTE, rgba, seeded, type Element, type ReactionId } from "./types";

/**
 * Stage effects for the battle: a drop-in for `useFloatText()` that also knows how to make a hit
 * feel like one. Attach `host` to the `relative` section that should shake (the enemy panel, the
 * incantation) and render `layer` where the overlays should appear (over the sprite, over the
 * incantation). Every method plays its own sound cue, so the battle makes one call per effect.
 *
 *   const enemyFx = useStageFx();
 *   enemyFx.strike("fire", { amount: 24, crit: true, reaction: "steam", weak: true });
 *   selfFx.selfHit(6, { backfire: true });  selfFx.shield(10);  selfFx.heal(9);
 *   enemyFx.callout("STORM!", "wind");  enemyFx.shake("hard");  enemyFx.float("+3 breath", "text-ember");
 *
 * Particles are CSS keyframes; React only mounts and unmounts each item on a timeout (no per-frame
 * state). `prefers-reduced-motion` shortens everything and skips shake, knockback and recoil.
 */

export type StrikeOpts = {
  /** Damage shown (echo and armor-absorbed included). 0 or undefined shows no number. */
  amount?: number;
  crit?: boolean;
  /** A reaction fires a banner: STEAM! WILDFIRE! STORM! ECLIPSE! DUSK! */
  reaction?: ReactionId | null;
  /** Hit a weakness: a "×2" banner (unless a reaction already took the banner). */
  weak?: boolean;
  /** Hit through Exposed: a small "exposed ×1.5" banner when nothing louder is showing. */
  exposed?: boolean;
};
export type CalloutTone = Element | "gold" | "blood" | "moss" | "light" | "vellum";
export type ShakeIntensity = "soft" | "hard";

export type StageFxApi = {
  /** Attach to a `relative` container; shake / recoil / knockback classes are toggled on it. */
  host: RefObject<HTMLDivElement | null>;
  /** Render inside the element the overlays should cover (it needs `position: relative`). */
  layer: ReactElement;
  /** Same as useFloatText: a rising display-font number in a colour class (default "text-ember"). */
  float: (text: string, cls?: string) => void;
  /** Element strike over the sprite + knockback + number + banners + shake + sound. */
  strike: (element: Element, opts?: StrikeOpts) => void;
  /** Damage to you: red vignette, recoil, "−N" in blood. `backfire` picks the sour cue over the thump. */
  selfHit: (amount: number, opts?: { backfire?: boolean }) => void;
  /** Shield gained: cyan ring sweep, "⛨ N". */
  shield: (amount: number) => void;
  /** Life gained: green motes, "+N". */
  heal: (amount: number) => void;
  /** A banner in the upper part of the layer ("STEAM!", "×2"). No sound. */
  callout: (text: string, tone?: CalloutTone) => void;
  /** Shake the host (soft ±3 px, hard ±7 px with a tilt). */
  shake: (intensity?: ShakeIntensity) => void;
};

type Num = { id: number; text: string; cls: string; dx: number; size: "md" | "lg" | "xl"; crit: boolean };
type FxInput =
  | { kind: "strike"; element: Element; crit: boolean; seed: number }
  | { kind: "vignette" }
  | { kind: "ring" }
  | { kind: "motes"; seed: number }
  | { kind: "callout"; text: string; tone: CalloutTone };
type Fx = FxInput & { id: number };

const LIFE = { num: 1150, numCrit: 1400, strike: 820, vignette: 650, ring: 650, motes: 1000, callout: 950, reduced: 380 } as const;
const HOST = { hit: 480, shake: 450, shakeHard: 520, recoil: 420 } as const;

export const REACTION_CALLOUT: Record<ReactionId, { text: string; tone: CalloutTone }> = {
  wildfire: { text: "WILDFIRE!", tone: "fire" },
  steam: { text: "STEAM!", tone: "water" },
  storm: { text: "STORM!", tone: "wind" },
  eclipse: { text: "ECLIPSE!", tone: "gold" },
  dusk: { text: "DUSK!", tone: "shadow" },
};

const TONE_HEX: Record<CalloutTone, string> = { ...ELEMENT_HEX, gold: "#f2d27a", blood: PALETTE.blood, moss: PALETTE.moss, light: ELEMENT_HEX.light, vellum: PALETTE.vellum };
const NUM_SIZE: Record<Num["size"], string> = { md: "text-4xl", lg: "text-5xl", xl: "text-6xl" };

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- overlays ---------- */

function Strike({ element, crit, seed }: { element: Element; crit: boolean; seed: number }) {
  const c = ELEMENT_HEX[element];
  const rnd = seeded(seed);
  const n = crit ? 18 : 12;
  const parts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.8;
    const d = 46 + rnd() * (crit ? 60 : 40);
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d - 10;
    return { i, dx, dy, size: 5 + rnd() * 6, spark: rnd() < 0.45, delay: rnd() * 90, pale: rnd() < 0.3, angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90 };
  });
  const flash = (color: string, cls = "") => (
    <span className={`fx-flash ${cls}`} style={{ background: `radial-gradient(circle, ${rgba(color, 0.7)} 0%, ${rgba(color, 0.25)} 45%, transparent 70%)` }} />
  );
  return (
    <div className="fx-strike" aria-hidden>
      {flash(c)}
      {crit && flash("#f2d27a", "fx-flash-crit")}
      {element === "fire" && [22, 42, 62].map((left, i) => (
        <span key={i} className="fx-flame" style={{ left: `${left}%`, animationDelay: `${i * 60}ms`, background: `linear-gradient(to top, ${rgba(c, 0.95)}, #ffd27a 55%, transparent)` }} />
      ))}
      {element === "water" && [0, 110, 220].map((delay, i) => (
        <span key={i} className="fx-ripple" style={{ animationDelay: `${delay}ms`, borderColor: rgba(c, 0.9), boxShadow: `0 0 12px ${rgba(c, 0.6)}` }} />
      ))}
      {element === "wind" && [[-24, 38, 0], [-18, 52, 70], [-30, 66, 140]].map(([rot, top, delay], i) => (
        <span key={i} className="fx-slash" style={{ top: `${top}%`, rotate: `${rot}deg`, animationDelay: `${delay}ms`, background: `linear-gradient(90deg, transparent, #ffffff, ${c}, transparent)`, boxShadow: `0 0 10px ${rgba(c, 0.9)}` }} />
      ))}
      {element === "shadow" && (
        <>
          <span className="fx-void" style={{ background: `radial-gradient(circle, rgba(12,8,20,.96) 0%, ${rgba(c, 0.55)} 55%, transparent 74%)` }} />
          {[0, 60, 120, 180, 240, 300].map((rot, i) => (
            <span key={i} className="fx-tendril" style={{ "--rot": `${rot + 20}deg`, animationDelay: `${i * 35}ms`, background: `linear-gradient(to bottom, ${rgba(c, 0.95)}, ${rgba(c, 0)})` } as CSSProperties} />
          ))}
        </>
      )}
      {element === "light" && (
        <>
          <span className="fx-beam" style={{ background: `linear-gradient(to bottom, transparent 0%, #fff8dc 35%, ${rgba(c, 0.9)} 60%, transparent 100%)` }} />
          {parts.slice(0, 8).map((p) => (
            <span key={p.i} className="fx-sparkle" style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, animationDelay: `${p.delay}ms`, color: p.pale ? "#fffaf0" : c } as CSSProperties}>✦</span>
          ))}
        </>
      )}
      {parts.map((p) => (
        <span
          key={p.i} className="fx-particle"
          style={{
            "--dx": `${p.dx}px`, "--dy": `${p.dy}px`,
            width: p.spark ? 4 : p.size, height: p.spark ? p.size * 2.2 : p.size, borderRadius: p.spark ? 2 : 9999,
            background: p.pale ? "#fff4e0" : `radial-gradient(circle at 40% 40%, #fff4e0 0%, ${c} 45%)`,
            boxShadow: `0 0 10px ${rgba(c, 0.9)}`, animationDelay: `${p.delay}ms`, rotate: p.spark ? `${p.angle}deg` : undefined,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function Motes({ seed }: { seed: number }) {
  const rnd = seeded(seed);
  return (
    <div className="fx-strike" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="fx-mote" style={{ left: `${18 + rnd() * 64}%`, animationDelay: `${rnd() * 260}ms`, width: 5 + rnd() * 5, height: 5 + rnd() * 5 }} />
      ))}
    </div>
  );
}

function StageLayer({ nums, fx }: { nums: Num[]; fx: Fx[] }) {
  return (
    <>
      {fx.map((f) => {
        switch (f.kind) {
          case "strike": return <Strike key={f.id} element={f.element} crit={f.crit} seed={f.seed} />;
          case "vignette": return <span key={f.id} className="fx-vignette" aria-hidden />;
          case "ring": return (
            <div key={f.id} className="fx-strike" aria-hidden>
              <span className="fx-shield-ring" /><span className="fx-shield-ring" style={{ animationDelay: "120ms" }} />
              <span className="fx-flash" style={{ background: "radial-gradient(circle, rgba(127,214,230,.45) 0%, transparent 65%)" }} />
            </div>
          );
          case "motes": return <Motes key={f.id} seed={f.seed} />;
          case "callout": return (
            <span key={f.id} className="fx-callout font-display" style={{ color: TONE_HEX[f.tone] }} aria-hidden>{f.text}</span>
          );
        }
      })}
      {nums.map((n) => (
        <div key={n.id} className={`fx-float font-display font-semibold ${NUM_SIZE[n.size]} ${n.crit ? "fx-float-crit" : ""} ${n.cls}`} style={{ left: `calc(50% + ${n.dx}px)` }} aria-hidden>
          {n.text}
        </div>
      ))}
    </>
  );
}

/* ---------- the hook ---------- */

export function useStageFx(): StageFxApi {
  const host = useRef<HTMLDivElement>(null);
  const [nums, setNums] = useState<Num[]>([]);
  const [fx, setFx] = useState<Fx[]>([]);
  const seq = useRef(0);
  const liveNums = useRef<number[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; timers.current.forEach(clearTimeout); timers.current.clear(); };
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => { timers.current.delete(t); if (mounted.current) fn(); }, ms);
    timers.current.add(t);
  }, []);

  /** Toggle a class on the host for `ms` (restarting its animation if it is already there). */
  const pulse = useCallback((cls: string, ms: number) => {
    const el = host.current;
    if (!el || reducedMotion()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    after(ms, () => el.classList.remove(cls));
  }, [after]);

  const addFx = useCallback((item: FxInput, life: number) => {
    const id = ++seq.current;
    const f: Fx = { ...item, id };
    setFx((xs) => [...xs, f]);
    after(reducedMotion() ? LIFE.reduced : life, () => setFx((xs) => xs.filter((x) => x.id !== id)));
  }, [after]);

  const number = useCallback((text: string, cls: string, size: Num["size"], crit: boolean) => {
    const id = ++seq.current;
    const n = liveNums.current.length;
    const dx = n === 0 ? 0 : (n % 2 ? 1 : -1) * 72 * Math.ceil(n / 2);
    liveNums.current.push(id);
    setNums((xs) => [...xs, { id, text, cls, dx, size, crit }]);
    after(reducedMotion() ? LIFE.reduced * 3 : crit ? LIFE.numCrit : LIFE.num, () => {
      liveNums.current = liveNums.current.filter((x) => x !== id);
      setNums((xs) => xs.filter((x) => x.id !== id));
    });
  }, [after]);

  const float = useCallback((text: string, cls = "text-ember") => number(text, cls, "md", false), [number]);

  const shake = useCallback((intensity: ShakeIntensity = "soft") => {
    pulse(intensity === "hard" ? "fx-shake-hard" : "fx-shake", intensity === "hard" ? HOST.shakeHard : HOST.shake);
  }, [pulse]);

  const callout = useCallback((text: string, tone: CalloutTone = "vellum") => addFx({ kind: "callout", text, tone }, LIFE.callout), [addFx]);

  const strike = useCallback((element: Element, o: StrikeOpts = {}) => {
    const amount = o.amount ?? 0;
    const crit = !!o.crit;
    addFx({ kind: "strike", element, crit, seed: seq.current * 7919 + 17 }, LIFE.strike);
    pulse("fx-stage-hit", HOST.hit);
    if (amount > 0) {
      const size: Num["size"] = crit || amount >= 30 ? "xl" : amount >= 16 ? "lg" : "md";
      number(`${crit ? "✦ " : ""}${amount}`, crit ? "text-light" : `text-${element}`, size, crit);
    }
    if (o.reaction) { const r = REACTION_CALLOUT[o.reaction]; callout(r.text, r.tone); }
    else if (o.weak) callout("×2", "light");
    else if (o.exposed) callout("exposed ×1.5", "light");
    if (crit || amount >= 30) shake("hard");
    else if (amount >= 14 || o.reaction) shake("soft");
    playSfx(crit ? "crit" : "hit", { element, intensity: 0.6 + Math.min(0.8, amount / 40) });
  }, [addFx, pulse, number, callout, shake]);

  const selfHit = useCallback((amount: number, o: { backfire?: boolean } = {}) => {
    addFx({ kind: "vignette" }, LIFE.vignette);
    pulse("fx-recoil", HOST.recoil);
    if (amount > 0) number(`−${amount}`, "text-blood", amount >= 20 ? "xl" : amount >= 10 ? "lg" : "md", false);
    playSfx(o.backfire ? "backfire" : "enemyHit", { intensity: 0.7 + Math.min(0.7, amount / 30) });
  }, [addFx, pulse, number]);

  const shield = useCallback((amount: number) => {
    addFx({ kind: "ring" }, LIFE.ring);
    if (amount > 0) number(`⛨ ${amount}`, "text-light", amount >= 20 ? "lg" : "md", false);
    playSfx("shield");
  }, [addFx, number]);

  const heal = useCallback((amount: number) => {
    addFx({ kind: "motes", seed: seq.current * 104729 + 3 }, LIFE.motes);
    if (amount > 0) number(`+${amount}`, "text-moss", amount >= 20 ? "lg" : "md", false);
    playSfx("heal");
  }, [addFx, number]);

  return { host, layer: <StageLayer nums={nums} fx={fx} />, float, strike, selfHit, shield, heal, callout, shake };
}
