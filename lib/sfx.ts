"use client";

/**
 * Synthesized sound cues — no audio assets. Everything is built from oscillators and filtered
 * noise on a lazily created AudioContext (first user gesture; resumed when suspended). Each
 * element has its own timbre: fire crackles, water plops, wind whooshes, shadow growls, light
 * chimes. Mute is persisted in localStorage `incantation.sfx` (default on). Nothing here ever
 * throws and nothing touches `window` at import time on the server.
 *
 *   playSfx("hit", { element: "fire" });  playSfx("crit", { element: "light" });  playSfx("backfire");
 *   sfxMuted() / setSfxMuted(v) / onSfxMuted(cb)
 */

export type SfxKind = "hit" | "crit" | "backfire" | "shield" | "heal" | "enemyHit" | "select" | "listen" | "win" | "lose";
export type SfxElement = "fire" | "water" | "wind" | "shadow" | "light";
export type SfxOpts = { element?: SfxElement; /** 0..1, scales the cue (bigger hits are louder); default 1 */ intensity?: number };

const KEY = "incantation.sfx";
const MASTER_GAIN = 0.55;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted: boolean | null = null;
const subs = new Set<(m: boolean) => void>();

/* ---------- mute state ---------- */

export function sfxMuted(): boolean {
  if (muted !== null) return muted;
  try { muted = typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "off"; } catch { muted = false; }
  return muted;
}

export function setSfxMuted(v: boolean): void {
  muted = v;
  try { localStorage.setItem(KEY, v ? "off" : "on"); } catch { /* private mode: the choice lasts for the session */ }
  subs.forEach((f) => { try { f(v); } catch { /* a listener must not break the others */ } });
  if (!v) playSfx("select");
}

/** Subscribe to mute changes (for the toggle button). Returns the unsubscribe function. */
export function onSfxMuted(fn: (m: boolean) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/* ---------- the context ---------- */

type AC = typeof AudioContext;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor: AC | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => { /* needs a gesture; the next call will try again */ });
    return ctx;
  } catch { return null; }
}

/** Create (or resume) the context on the first gesture so the first cue is not swallowed. Safe to call often. */
export function primeSfx(): void { if (!sfxMuted()) audio(); }

if (typeof window !== "undefined") {
  const prime = () => { primeSfx(); window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime); };
  window.addEventListener("pointerdown", prime, { passive: true });
  window.addEventListener("keydown", prime);
}

/* ---------- building blocks (all times relative to `now`) ---------- */

type Env = { at?: number; dur: number; gain?: number; attack?: number };

function tone(c: AudioContext, out: AudioNode, now: number, type: OscillatorType, f0: number, f1: number, e: Env, detune = 0) {
  const t = now + (e.at ?? 0);
  const o = c.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(Math.max(20, f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + e.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, e.gain ?? 0.35), t + (e.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + e.dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + e.dur + 0.03);
}

function noise(c: AudioContext, out: AudioNode, now: number, e: Env & { type?: BiquadFilterType; f0?: number; f1?: number; q?: number }) {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = now + (e.at ?? 0);
  const s = c.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  s.loopStart = Math.random() * 0.5;
  const f = c.createBiquadFilter();
  f.type = e.type ?? "bandpass";
  f.frequency.setValueAtTime(e.f0 ?? 1000, t);
  if (e.f1) f.frequency.exponentialRampToValueAtTime(e.f1, t + e.dur);
  f.Q.value = e.q ?? 0.9;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, e.gain ?? 0.3), t + (e.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + e.dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t); s.stop(t + e.dur + 0.03);
}

/* ---------- element timbres ---------- */

function elementHit(c: AudioContext, out: AudioNode, now: number, el: SfxElement, k: number) {
  switch (el) {
    case "fire":   // crackle: bright noise burst snapping down, with a low thump under it
      noise(c, out, now, { dur: 0.28, gain: 0.5 * k, f0: 2600, f1: 380, q: 0.7 });
      noise(c, out, now, { at: 0.05, dur: 0.12, gain: 0.25 * k, f0: 4200, f1: 1800, q: 2 });
      tone(c, out, now, "sine", 170, 55, { dur: 0.2, gain: 0.45 * k });
      break;
    case "water":  // plop: a sine dropping fast, then a soft splash
      tone(c, out, now, "sine", 640, 140, { dur: 0.2, gain: 0.5 * k, attack: 0.004 });
      noise(c, out, now, { at: 0.06, dur: 0.22, gain: 0.18 * k, type: "highpass", f0: 1800, f1: 900 });
      break;
    case "wind":   // whoosh: filtered noise that swells, climbs and cuts
      noise(c, out, now, { dur: 0.38, gain: 0.45 * k, attack: 0.09, f0: 500, f1: 2600, q: 1.4 });
      noise(c, out, now, { at: 0.18, dur: 0.16, gain: 0.3 * k, attack: 0.02, f0: 3000, f1: 1200, q: 1.2 });
      break;
    case "shadow": { // growl: two detuned saws low, through a closing lowpass
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(900, now); lp.frequency.exponentialRampToValueAtTime(140, now + 0.42); lp.connect(out);
      tone(c, lp, now, "sawtooth", 120, 62, { dur: 0.42, gain: 0.32 * k, attack: 0.02 });
      tone(c, lp, now, "sawtooth", 124, 66, { dur: 0.42, gain: 0.32 * k, attack: 0.02 }, 12);
      tone(c, out, now, "sine", 80, 40, { dur: 0.3, gain: 0.3 * k });
      break;
    }
    case "light":  // chime: a bright triad plus a sparkle of high noise
      tone(c, out, now, "triangle", 1318, 1318, { dur: 0.32, gain: 0.3 * k, attack: 0.003 });
      tone(c, out, now, "triangle", 1976, 1976, { at: 0.02, dur: 0.28, gain: 0.22 * k, attack: 0.003 });
      tone(c, out, now, "sine", 2637, 2637, { at: 0.04, dur: 0.24, gain: 0.15 * k, attack: 0.003 });
      noise(c, out, now, { dur: 0.14, gain: 0.12 * k, type: "highpass", f0: 5000 });
      break;
  }
}

/* ---------- the cues ---------- */

export function playSfx(kind: SfxKind, opts: SfxOpts = {}): void {
  try {
    if (sfxMuted()) return;
    const c = audio();
    if (!c || !master) return;
    const now = c.currentTime + 0.005;
    const k = Math.min(1.4, Math.max(0.35, opts.intensity ?? 1));
    const el = opts.element ?? "fire";
    const out: AudioNode = master;
    switch (kind) {
      case "hit":
        elementHit(c, out, now, el, k);
        tone(c, out, now, "square", 140, 70, { dur: 0.08, gain: 0.12 * k });   // the impact click under every element
        break;
      case "crit":
        elementHit(c, out, now, el, Math.min(1.4, k * 1.2));
        tone(c, out, now, "square", 420, 1680, { dur: 0.13, gain: 0.16, attack: 0.004 });
        tone(c, out, now, "triangle", 1568, 1568, { at: 0.08, dur: 0.4, gain: 0.26, attack: 0.004 });
        tone(c, out, now, "triangle", 2349, 2349, { at: 0.12, dur: 0.36, gain: 0.18, attack: 0.004 });
        tone(c, out, now, "sine", 110, 45, { dur: 0.3, gain: 0.45 });
        break;
      case "backfire": { // a sour fall: saw sliding down, a buzz, and a dull thud
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; lp.connect(out);
        tone(c, lp, now, "sawtooth", 330, 58, { dur: 0.5, gain: 0.3, attack: 0.01 });
        tone(c, lp, now, "square", 165, 52, { at: 0.03, dur: 0.46, gain: 0.14, attack: 0.01 }, -18);
        noise(c, out, now, { dur: 0.3, gain: 0.3, type: "lowpass", f0: 900, f1: 200 });
        tone(c, out, now, "sine", 90, 38, { at: 0.02, dur: 0.32, gain: 0.5 });
        break;
      }
      case "shield":   // a ring: two rising sines and a glassy high partial
        tone(c, out, now, "sine", 660, 990, { dur: 0.28, gain: 0.3 * k, attack: 0.02 });
        tone(c, out, now, "triangle", 1320, 1485, { at: 0.04, dur: 0.34, gain: 0.2 * k, attack: 0.02 });
        tone(c, out, now, "sine", 2640, 2640, { at: 0.1, dur: 0.3, gain: 0.08 * k, attack: 0.01 });
        break;
      case "heal":     // a rising three-note figure, soft
        [523, 659, 784].forEach((f, i) => tone(c, out, now, "sine", f, f * 1.003, { at: i * 0.085, dur: 0.36, gain: 0.22 * k, attack: 0.02 }));
        tone(c, out, now, "triangle", 1046, 1046, { at: 0.26, dur: 0.3, gain: 0.1 * k, attack: 0.03 });
        break;
      case "enemyHit": // being struck: a heavy thump and a dull slap of noise
        tone(c, out, now, "sine", 130, 36, { dur: 0.3, gain: 0.6 * k });
        noise(c, out, now, { dur: 0.16, gain: 0.4 * k, type: "lowpass", f0: 420, f1: 120 });
        tone(c, out, now, "square", 95, 60, { dur: 0.06, gain: 0.14 * k });
        break;
      case "select":   // a quiet tick
        tone(c, out, now, "square", 1100, 900, { dur: 0.035, gain: 0.07 });
        tone(c, out, now, "sine", 1800, 1600, { dur: 0.03, gain: 0.05 });
        break;
      case "listen":   // "I'm listening": two soft notes up
        tone(c, out, now, "sine", 440, 440, { dur: 0.12, gain: 0.14, attack: 0.02 });
        tone(c, out, now, "sine", 660, 660, { at: 0.1, dur: 0.18, gain: 0.14, attack: 0.02 });
        break;
      case "win":      // a bright arpeggio with a shimmer
        [523, 659, 784, 1046].forEach((f, i) => tone(c, out, now, "triangle", f, f, { at: i * 0.11, dur: 0.5, gain: 0.22, attack: 0.01 }));
        tone(c, out, now, "sine", 1568, 1568, { at: 0.44, dur: 0.7, gain: 0.12, attack: 0.02 });
        noise(c, out, now, { at: 0.4, dur: 0.6, gain: 0.08, type: "highpass", f0: 6000 });
        break;
      case "lose": {   // three slow steps down into a lowpass
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(1200, now); lp.frequency.exponentialRampToValueAtTime(220, now + 1.6); lp.connect(out);
        [392, 311, 233].forEach((f, i) => tone(c, lp, now, "sawtooth", f, f * 0.985, { at: i * 0.42, dur: 0.6, gain: 0.2, attack: 0.03 }));
        tone(c, out, now, "sine", 70, 40, { at: 0.84, dur: 0.9, gain: 0.3, attack: 0.05 });
        break;
      }
    }
  } catch { /* audio is a garnish; the game never depends on it */ }
}
