"use client";

import { useId, type CSSProperties, type ReactElement } from "react";
import { rgba, type EnemyKind } from "./types";

export type EnemySpriteProps = {
  id: string;
  kind: EnemyKind;
  hurt?: boolean;
  charged?: boolean;
  dead?: boolean;
  className?: string;
};

type Pal = { inner: string; edge: string; accent: string };
type Idle = "bob" | "breathe" | "squish" | "flicker" | "drift" | "sway" | "dangle";
/** `g` is the body gradient as a paint string, for strokes (tails, legs, necks) that should match the silhouette. */
type Art = { pal: Pal; idle: Idle; draw: (p: Pal, g: string) => ReactElement };

const SIZE: Record<EnemyKind, number> = { minion: 140, elite: 170, boss: 210, final: 210 };
const IDLE: Record<Idle, string> = {
  bob: "fx-idle-bob", breathe: "fx-idle-breathe", squish: "fx-idle-squish", flicker: "fx-idle-flicker",
  drift: "fx-idle-drift", sway: "fx-idle-sway", dangle: "fx-idle-dangle",
};
const MIRROR = "matrix(-1 0 0 1 100 0)";
const VELLUM = "#ece2cd";

/** A glowing eye: soft halo + core (+ optional dark pupil). */
function Eye({ cx, cy, r, c, pupil }: { cx: number; cy: number; r: number; c: string; pupil?: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r * 2.4} fill={c} opacity=".18" />
      <circle cx={cx} cy={cy} r={r} fill={c} />
      {pupil && <circle cx={cx + r * 0.25} cy={cy + r * 0.15} r={r * 0.45} fill={pupil} />}
    </>
  );
}

const origin = (x: number, y: number, extra?: CSSProperties): CSSProperties => ({ transformOrigin: `${x}px ${y}px`, ...extra });

const ART: Record<string, Art> = {
  /* ---------- minions ---------- */
  limo: {
    pal: { inner: "#5f8f5a", edge: "#182619", accent: "#dff5a3" }, idle: "squish",
    draw: (p) => (
      <>
        <ellipse cx="50" cy="88" rx="40" ry="5" fill={p.edge} opacity=".8" />
        <path d="M12 74 C10 52 24 34 50 34 C76 34 90 52 88 74 Q87 85 78 85 Q72 82 67 87 Q58 91 50 86 Q42 91 33 87 Q28 82 22 85 Q13 85 12 74 Z" />
        <path d="M84 62 q6 6 4 16 q-5 2 -6 -4 q0 -6 2 -12 z" />
        <circle cx="16" cy="90" r="4.5" /><circle cx="90" cy="90" r="3" />
        <ellipse cx="34" cy="48" rx="11" ry="5" fill="#fff" opacity=".1" transform="rotate(-20 34 48)" />
        <circle cx="62" cy="70" r="2.5" fill={p.accent} opacity=".25" /><circle cx="28" cy="66" r="1.6" fill={p.accent} opacity=".25" />
        <Eye cx={40} cy={56} r={4.2} c={p.accent} pupil={p.edge} /><Eye cx={60} cy={56} r={4.2} c={p.accent} pupil={p.edge} />
        <path d="M43 67 q3.5 2.5 7 0 q3.5 -2.5 7 0" stroke={p.edge} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  murci: {
    pal: { inner: "#4f3f6f", edge: "#1a1326", accent: "#e5575b" }, idle: "bob",
    draw: (p) => {
      const wing = "M44 44 C36 34 28 24 20 22 C12 22 6 28 3 34 Q14 44 18 60 Q26 56 32 64 Q38 56 44 58 Z";
      return (
        <>
          <g className="fx-part-flap" style={origin(44, 50, { "--flap": "9deg" } as CSSProperties)}><path d={wing} /></g>
          <g transform={MIRROR}><g className="fx-part-flap" style={origin(44, 50, { "--flap": "9deg" } as CSSProperties)}><path d={wing} /></g></g>
          <ellipse cx="50" cy="56" rx="10" ry="14" />
          <path d="M44 34 L39 19 L50 31 Z M56 34 L61 19 L50 31 Z" />
          <circle cx="50" cy="40" r="9" />
          <path d="M46 68 l-2 5 M54 68 l2 5" stroke={p.edge} strokeWidth="1.6" strokeLinecap="round" />
          <Eye cx={46} cy={40} r={1.9} c={p.accent} /><Eye cx={54} cy={40} r={1.9} c={p.accent} />
          <path d="M47 46 l1.5 3.5 l1.5 -3.5 z M50 46 l1.5 3.5 l1.5 -3.5 z" fill={VELLUM} opacity=".85" />
        </>
      );
    },
  },
  rata: {
    pal: { inner: "#6e5f58", edge: "#241a1a", accent: "#f0c060" }, idle: "breathe",
    draw: (p, g) => (
      <>
        <path d="M84 78 C100 80 104 60 94 50 C88 44 80 50 84 56" stroke={g} strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M24 78 C12 70 18 46 40 38 C62 30 84 42 86 62 C88 76 80 84 64 84 L30 84 C22 84 20 82 24 78 Z" />
        <ellipse cx="68" cy="68" rx="13" ry="11" fill={p.edge} opacity=".22" />
        <ellipse cx="36" cy="86" rx="7" ry="3" /><ellipse cx="62" cy="86" rx="8" ry="3" />
        <path d="M32 64 C26 54 14 56 3 68 C6 74 18 76 30 74 Z" />
        <circle cx="28" cy="50" r="7.5" /><circle cx="28" cy="50" r="4.3" fill="#b47a7a" opacity=".55" />
        <circle cx="3.5" cy="68" r="1.7" fill="#d98a8a" />
        <path d="M10 70 L0 65 M10 71 L-2 71 M10 72 L1 77" stroke={VELLUM} strokeWidth=".8" opacity=".5" />
        <path d="M7 73 v3 M10 73.5 v3" stroke={VELLUM} strokeWidth="1.4" opacity=".85" />
        <Eye cx={21} cy={64} r={2} c={p.accent} pupil={p.edge} />
      </>
    ),
  },
  arana: {
    pal: { inner: "#4e3f62", edge: "#140f1e", accent: "#c9f07a" }, idle: "dangle",
    draw: (p, g) => {
      const legs = "M45 32 L26 18 L16 30 M43 37 L20 32 L8 46 M43 42 L22 50 L12 68 M46 46 L30 66 L26 86";
      return (
        <>
          <path d="M50 0 V26" stroke={VELLUM} strokeWidth=".8" opacity=".35" />
          <path d={legs} stroke={g} strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={legs} stroke={g} strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" transform={MIRROR} />
          <ellipse cx="50" cy="60" rx="17" ry="21" />
          <circle cx="50" cy="34" r="9" />
          <path d="M50 46 l7 11 l-7 13 l-7 -13 z" fill={p.accent} opacity=".22" />
          <path d="M47 41 l1 4 M53 41 l-1 4" stroke={VELLUM} strokeWidth="1.2" opacity=".7" strokeLinecap="round" />
          <Eye cx={46} cy={31} r={2} c={p.accent} /><Eye cx={54} cy={31} r={2} c={p.accent} />
          <circle cx="48.5" cy="36" r="1.3" fill={p.accent} /><circle cx="51.5" cy="36" r="1.3" fill={p.accent} />
          <circle cx="43" cy="34" r="1" fill={p.accent} /><circle cx="57" cy="34" r="1" fill={p.accent} />
        </>
      );
    },
  },
  cuervo: {
    pal: { inner: "#3d4266", edge: "#0f1020", accent: "#e9d27c" }, idle: "bob",
    draw: (p) => (
      <>
        <path d="M4 86 C30 80 70 84 96 78 M70 82 L78 90" stroke="#4a3a30" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M62 66 L92 58 L90 66 L66 74 Z" />
        <path d="M28 68 C22 56 30 40 46 38 C60 36 72 46 70 60 C68 70 60 76 50 78 C44 78 36 76 30 74 Z" />
        <path d="M30 42 L46 38 L46 48 Z" />
        <circle cx="36" cy="36" r="10" />
        <path d="M40 50 C50 44 66 48 68 60 C58 64 46 64 40 58 Z" fill={p.edge} opacity=".45" />
        <path d="M27 33 L6 37 L27 41 Z" fill="#2b2733" /><path d="M8 37 L26 37" stroke="#4a4552" strokeWidth=".8" />
        <path d="M42 78 L40 86 M42 78 L46 86 M52 78 L50 86 M52 78 L56 85" stroke={p.inner} strokeWidth="1.6" strokeLinecap="round" />
        <Eye cx={34} cy={33} r={2.2} c={p.accent} pupil={p.edge} />
      </>
    ),
  },
  duende: {
    pal: { inner: "#5e7c4b", edge: "#1b2817", accent: "#f0d060" }, idle: "sway",
    draw: (p) => (
      <>
        <path d="M38 62 C28 68 26 80 30 90 L70 90 C74 80 72 68 62 62 Z" />
        <path d="M74 72 L86 54 L89 56 L77 74 Z" fill="#b9ad99" opacity=".75" /><path d="M74 70 l6 3" stroke="#6b5a3e" strokeWidth="2" strokeLinecap="round" />
        <circle cx="74" cy="74" r="4.5" />
        <path d="M35 34 L8 24 L33 44 Z M65 34 L92 24 L67 44 Z" />
        <path d="M34 36 C34 22 66 22 66 36 C66 50 60 60 50 63 C40 60 34 50 34 36 Z" />
        <path d="M38 32 l8 2 M62 32 l-8 2" stroke={p.edge} strokeWidth="1.6" strokeLinecap="round" />
        <Eye cx={43} cy={38} r={3.2} c={p.accent} /><Eye cx={57} cy={38} r={3.2} c={p.accent} />
        <ellipse cx="43" cy="38" rx="1" ry="2.4" fill={p.edge} /><ellipse cx="57" cy="38" rx="1" ry="2.4" fill={p.edge} />
        <path d="M39 49 Q50 59 61 49" stroke={p.edge} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M42 50 l2 3.4 l2 -3.4 z M47.5 52.5 l2 3.6 l2 -3.6 z M53.5 51.5 l2 3.4 l2 -3.4 z" fill={VELLUM} opacity=".8" />
      </>
    ),
  },
  /* ---------- elites ---------- */
  golem: {
    pal: { inner: "#605d6c", edge: "#1d1b25", accent: "#f0a35e" }, idle: "breathe",
    draw: (p) => {
      const cracks = "M50 48 L46 58 L52 66 L48 78 M36 52 L40 62 M62 48 L60 60 L66 70";
      return (
        <>
          <path d="M6 44 L24 42 L28 68 L18 72 L6 70 Z M4 70 L20 70 L22 86 L4 88 Z" />
          <path d="M6 44 L24 42 L28 68 L18 72 L6 70 Z M4 70 L20 70 L22 86 L4 88 Z" transform={MIRROR} />
          <path d="M22 40 L78 40 L84 66 L74 92 L26 92 L16 66 Z" />
          <path d="M40 20 L60 20 L62 40 L38 40 Z" />
          <path d="M24 44 L40 44 L36 60 Z M60 70 L72 66 L70 86 Z" fill="#fff" opacity=".05" />
          <path d={cracks} stroke={p.accent} strokeWidth="3" opacity=".28" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={cracks} stroke={p.accent} strokeWidth="1.3" opacity=".95" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="42" y="27" width="6" height="3" fill={p.accent} /><rect x="52" y="27" width="6" height="3" fill={p.accent} />
          <rect x="40" y="25" width="10" height="7" fill={p.accent} opacity=".18" /><rect x="50" y="25" width="10" height="7" fill={p.accent} opacity=".18" />
        </>
      );
    },
  },
  espectro: {
    pal: { inner: "#7484b0", edge: "#1a1a33", accent: "#e6eeff" }, idle: "drift",
    draw: (p) => {
      const hand = "M28 54 C20 50 14 56 10 58 C16 58 18 64 24 62 Z";
      return (
        <>
          <path d="M50 8 C32 8 28 32 30 52 C31 62 26 72 20 88 C27 80 33 90 39 82 C45 90 51 80 57 86 C63 92 68 80 74 88 C72 72 69 62 70 52 C72 32 68 8 50 8 Z" />
          <path d={hand} /><path d={hand} transform={MIRROR} />
          <ellipse cx="50" cy="32" rx="11" ry="13" fill={p.edge} />
          <g className="fx-part-flicker">
            <ellipse cx="45" cy="31" rx="2.4" ry="3.4" fill={p.accent} /><ellipse cx="55" cy="31" rx="2.4" ry="3.4" fill={p.accent} />
            <ellipse cx="50" cy="31" rx="9" ry="5" fill={p.accent} opacity=".14" />
            <ellipse cx="50" cy="40.5" rx="2" ry="2.8" fill={p.accent} opacity=".45" />
          </g>
        </>
      );
    },
  },
  lobo: {
    pal: { inner: "#5e4a44", edge: "#1a1212", accent: "#f26a3a" }, idle: "breathe",
    draw: (p) => (
      <>
        <path d="M86 58 C94 50 100 40 98 30 C104 40 102 56 90 64 Z" />
        <path d="M30 78 L38 78 L37 94 L29 94 Z M40 78 L47 78 L48 94 L41 94 Z M70 78 L78 78 L80 94 L72 94 Z M80 76 L88 74 L90 94 L82 94 Z" />
        <path d="M30 50 L36 36 L42 46 L48 34 L54 44 L60 36 L64 44 Z" />
        <path d="M26 52 C34 42 52 40 68 42 C82 44 90 52 90 64 C90 72 86 78 80 80 L32 80 C24 76 22 62 26 52 Z" />
        <path d="M6 54 C10 62 20 64 28 60 L28 56 L8 52 Z" />
        <path d="M12 57 l1.4 -3 l1.4 3 z M18 58 l1.4 -3 l1.4 3 z" fill={VELLUM} opacity=".8" />
        <path d="M30 48 C24 46 16 46 4 50 C6 44 12 38 20 36 L24 24 L30 34 C36 34 40 40 40 48 Z" />
        <path d="M9 51.5 l1.8 4 l1.8 -4 z M15 52.5 l1.8 4 l1.8 -4 z M21 53.5 l1.6 3.5 l1.6 -3.5 z" fill={VELLUM} opacity=".85" />
        <circle cx="5" cy="49.5" r="1.6" fill={p.edge} />
        <circle cx="28" cy="42" r="4.5" fill={p.accent} opacity=".2" /><path d="M24 42 L32 40 L29 45 Z" fill={p.accent} />
        {[[36, 34, 0], [50, 30, 0.9], [62, 34, 1.7]].map(([x, y, d]) => (
          <circle key={x} cx={x} cy={y} r="1.6" fill={p.accent} className="fx-part-ember" style={{ animationDelay: `${d}s` }} />
        ))}
      </>
    ),
  },
  bruja: {
    pal: { inner: "#5e3f72", edge: "#190f24", accent: "#b19ad9" }, idle: "sway",
    draw: (p) => {
      const arm = "M44 58 C34 60 26 62 16 60 L18 66 C28 66 36 64 46 62 Z";
      return (
        <>
          {[0, 0.8, 1.6].map((d) => (
            <circle key={d} cx="50" cy="47" r="12" stroke={p.accent} strokeWidth="1.2" fill="none" className="fx-part-rings" style={origin(50, 47, { animationDelay: `${d}s` })} />
          ))}
          <path d="M50 49 C36 54 30 70 24 92 L76 92 C70 70 64 54 50 49 Z" />
          <path d={arm} /><path d={arm} transform={MIRROR} />
          <circle cx="16" cy="63" r="3.5" /><circle cx="84" cy="63" r="3.5" />
          <circle cx="50" cy="43" r="8" />
          <path d="M34 36 C40 22 46 12 56 2 C52 16 60 26 68 36 Z" />
          <ellipse cx="50" cy="36" rx="27" ry="4.5" />
          <Eye cx={47} cy={43} r={1.6} c={p.accent} /><Eye cx={53} cy={43} r={1.6} c={p.accent} />
        </>
      );
    },
  },
  /* ---------- bosses ---------- */
  dragon: {
    pal: { inner: "#733a30", edge: "#1f0f0e", accent: "#f0a35e" }, idle: "breathe",
    draw: (p, g) => (
      <>
        <g className="fx-part-flap" style={origin(56, 58, { "--flap": "-4deg" } as CSSProperties)}>
          <path d="M56 58 C50 42 60 20 88 10 C82 24 90 36 96 44 Q88 42 84 50 Q80 48 78 56 Q68 54 56 58 Z" />
        </g>
        <path d="M92 86 C104 82 104 68 94 62" stroke={g} strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M42 62 C52 54 72 52 86 58 C96 64 98 78 92 90 L38 90 C32 80 32 70 42 62 Z" />
        <path d="M44 60 C36 54 30 46 30 36 L42 36 C44 44 48 52 54 58 Z" />
        <path d="M44 38 l3 -8 l4 7 z M52 52 l3 -8 l4 7 z M62 56 l3 -8 l4 7 z" />
        <path d="M10 36 C14 43 22 46 30 43 L30 40 L12 34 Z" />
        <ellipse cx="19" cy="38" rx="10" ry="5" fill={p.accent} opacity=".25" /><ellipse cx="19" cy="38" rx="7" ry="2.4" fill={p.accent} opacity=".85" />
        <path d="M8 32 C14 26 24 22 32 24 L40 12 L38 26 C44 28 46 34 42 40 L30 40 C22 38 14 36 8 32 Z" />
        <path d="M34 25 L48 18 L42 31 Z" />
        <path d="M14 34.5 l1.6 3.5 l1.6 -3.5 z M20 35.8 l1.6 3.5 l1.6 -3.5 z M26 37 l1.4 3 l1.4 -3 z" fill={VELLUM} opacity=".85" />
        <Eye cx={28} cy={30} r={2} c={p.accent} />
        {[[12, 30, 0], [6, 36, 1.3]].map(([x, y, d]) => (
          <circle key={x} cx={x} cy={y} r="1.5" fill={p.accent} className="fx-part-ember" style={{ animationDelay: `${d}s` }} />
        ))}
      </>
    ),
  },
  hidra: {
    pal: { inner: "#3f6f69", edge: "#0e2120", accent: "#9fe8d0" }, idle: "breathe",
    draw: (p, g) => {
      const head = "M0 7 C-7 7 -9 -1 -6 -6 C-3 -10 3 -10 6 -6 C9 -1 7 7 0 7 Z";
      const necks: [string, number, number, number, number, number][] = [
        ["M44 66 C32 56 22 48 18 32", 18, 30, -22, 44, 66],
        ["M50 64 C50 52 50 40 50 26", 50, 24, 0, 50, 64],
        ["M56 66 C68 56 78 48 82 32", 82, 30, 22, 56, 66],
      ];
      return (
        <>
          {necks.map(([d, hx, hy, rot, ox, oy], i) => (
            <g key={i} className="fx-part-flap" style={origin(ox, oy, { "--flap": i === 1 ? "-5deg" : "6deg", animationDelay: `${-i * 1.1}s`, animationDuration: `${3.2 + i * 0.5}s` } as CSSProperties)}>
              <path d={d} stroke={g} strokeWidth="9" fill="none" strokeLinecap="round" />
              <g transform={`translate(${hx} ${hy}) rotate(${rot})`}>
                <path d={head} />
                <path d="M-3 3 Q0 5 3 3" stroke={p.edge} strokeWidth="1" fill="none" />
                <Eye cx={-2.6} cy={-3} r={1.4} c={p.accent} /><Eye cx={2.6} cy={-3} r={1.4} c={p.accent} />
              </g>
            </g>
          ))}
          <path d="M28 92 C24 72 36 60 50 60 C64 60 76 72 72 92 Z" />
          <path d="M50 62 l-4 -7 l4 -5 l4 5 z" />
          <ellipse cx="50" cy="80" rx="10" ry="8" fill={p.accent} opacity=".08" />
        </>
      );
    },
  },
  /* ---------- final ---------- */
  olvido: {
    pal: { inner: "#4b4860", edge: "#0c0b13", accent: "#d8d2e6" }, idle: "drift",
    draw: (p) => (
      <>
        <ellipse cx="50" cy="50" rx="47" ry="30" stroke={p.accent} strokeWidth="1" strokeDasharray="6 10" opacity=".12" fill="none" className="fx-part-spin" style={origin(50, 50)} />
        <ellipse cx="50" cy="52" rx="37" ry="22" stroke={p.accent} strokeWidth="1" strokeDasharray="3 9" opacity=".1" fill="none" className="fx-part-spin-r" style={origin(50, 52)} />
        <g className="fx-part-flicker">
          <path d="M50 6 C34 8 28 28 30 48 C31 60 26 70 22 84 C30 78 34 88 40 80 C44 88 52 80 58 84 C64 90 70 78 76 84 C72 70 68 60 70 48 C72 28 66 8 50 6 Z" />
          <ellipse cx="50" cy="34" rx="12" ry="15" fill={p.edge} />
          <ellipse cx="44" cy="34" rx="3.2" ry="1.3" fill={p.accent} opacity=".8" /><ellipse cx="56" cy="34" rx="3.2" ry="1.3" fill={p.accent} opacity=".8" />
        </g>
        {[[20, 72, 0, 5], [80, 64, 1.6, 6], [30, 90, 3, 5.5], [72, 92, 0.8, 7]].map(([x, y, d, dur]) => (
          <ellipse key={x} cx={x} cy={y} rx="4" ry="2.4" opacity=".55" className="fx-part-ember" style={{ animationDelay: `${d}s`, animationDuration: `${dur}s` }} />
        ))}
        <path d="M10 40 h9 M79 44 h7 M16 54 h5 M83 57 h10 M8 48 h4" stroke={p.accent} strokeWidth="1.2" opacity=".22" strokeLinecap="round" />
      </>
    ),
  },
};

const WISP: Art = {
  pal: { inner: "#8a6a52", edge: "#2a1c1a", accent: "#f0a35e" }, idle: "bob",
  draw: (p) => (
    <g className="fx-part-flicker">
      <path d="M50 18 C64 36 72 50 68 66 C64 82 36 82 32 66 C28 50 36 36 50 18 Z" />
      <ellipse cx="50" cy="62" rx="10" ry="12" fill={p.accent} opacity=".3" />
      <Eye cx={45} cy={60} r={2} c={p.accent} /><Eye cx={55} cy={60} r={2} c={p.accent} />
    </g>
  ),
};

/** Known ids (DESIGN.md §5). Anything else renders the generic wisp. */
export const ENEMY_SPRITE_IDS = Object.keys(ART);

/**
 * Inline-SVG enemy. Dark silhouette with an inner radial glow and one or two accent details,
 * a slow idle, `hurt` flash (~350 ms), `charged` blood-red aura, `dead` dissolve.
 */
export default function EnemySprite({ id, kind, hurt = false, charged = false, dead = false, className = "" }: EnemySpriteProps) {
  const art = ART[id] ?? WISP;
  const gid = "g" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { inner, edge, accent } = art.pal;
  const style = { "--fx-size": `${SIZE[kind]}px` } as CSSProperties;
  return (
    <div className={`fx-sprite ${dead ? "fx-dead" : ""} ${hurt ? "fx-hurt" : ""} ${className}`} style={style} role="img" aria-label={id} data-sprite={id}>
      {charged && !dead && <span className="fx-aura" aria-hidden />}
      <svg viewBox="0 0 100 100" className={IDLE[art.idle]} style={{ filter: `drop-shadow(0 0 ${kind === "minion" ? 10 : 16}px ${rgba(accent, 0.28)})` }} aria-hidden>
        <defs>
          <radialGradient id={gid} gradientUnits="userSpaceOnUse" cx="50" cy="46" r="48">
            <stop offset="0" stopColor={inner} />
            <stop offset=".35" stopColor={inner} />
            <stop offset="1" stopColor={edge} />
          </radialGradient>
        </defs>
        <g fill={`url(#${gid})`}>{art.draw(art.pal, `url(#${gid})`)}</g>
      </svg>
    </div>
  );
}
