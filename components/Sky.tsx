"use client";

/**
 * The sky: the lexicon's own words drifting up the side bands behind every screen, plus ember
 * sparks. Seeded, so server and client agree. Fixed and pointer-free; `dim` lowers the peak
 * opacity during a run so the words stay behind the battle's text. Styles live in the title
 * block of globals.css (.title-sky, .title-word, .title-spark).
 */
import { useMemo, type CSSProperties } from "react";
import type { Vocab } from "@/data/vocab";
import type { LangId } from "@/lib/lang";
import { Ruby } from "@/components/fx";

/** Deterministic PRNG (mulberry32): the sky renders the same on the server and the client. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* mostly vellum, a few words in ember and element colours */
const TINT = ["#ece2cd", "#ece2cd", "#ece2cd", "#f0a35e", "#e9d27c", "#7fb6d6", "#a8c686", "#b19ad9"];

type SkyWord = { v: Vocab; left: number; size: number; dur: number; delay: number; peak: number; tilt: number; tint: string };
type Spark = { left: number; dur: number; delay: number; sway: number };

function useSky(lexicon: Vocab[], lang: LangId) {
  return useMemo(() => {
    const r = rng(lang === "zh" ? 7 : 3);
    const pool = lexicon.filter((v) => v.text.length <= (lang === "zh" ? 4 : 12));
    const used = new Set<number>();
    const words: SkyWord[] = [];
    for (let i = 0; i < 16 && pool.length > 0; i++) {
      let k = Math.floor(r() * pool.length);
      for (let tries = 0; used.has(k) && tries < 8; tries++) k = Math.floor(r() * pool.length);
      used.add(k);
      // the side bands only, so nothing drifts behind the wordmark or the paragraph
      const left = r() < 0.5 ? 2 + r() * 26 : 72 + r() * 26;
      words.push({
        v: pool[k], left, size: 0.85 + r() * 1.1, dur: 16 + r() * 14, delay: -r() * 30,
        peak: 0.1 + r() * 0.2, tilt: -6 + r() * 12, tint: TINT[Math.floor(r() * TINT.length)],
      });
    }
    const sparks: Spark[] = Array.from({ length: 14 }, () => ({ left: r() * 100, dur: 7 + r() * 7, delay: -r() * 14, sway: -30 + r() * 60 }));
    return { words, sparks };
  }, [lexicon, lang]);
}

export default function Sky({ lexicon, lang, dim = false }: { lexicon: Vocab[]; lang: LangId; dim?: boolean }) {
  const { words, sparks } = useSky(lexicon, lang);
  const k = dim ? 0.55 : 1;   // behind a run the words stay faint, under the battle's own text
  return (
    <div className="title-sky" aria-hidden>
      {words.map((w, i) => (
        <span
          key={i} className="title-word font-display"
          style={{ left: `${w.left}%`, color: w.tint, "--size": w.size, "--dur": `${w.dur}s`, "--delay": `${w.delay}s`, "--peak": w.peak * k, "--tilt": `${w.tilt}deg` } as CSSProperties}
        >
          {lang === "zh" ? <Ruby text={w.v.text} lang={lang} /> : w.v.text}
        </span>
      ))}
      {sparks.map((s, i) => (
        <span key={`s${i}`} className="title-spark" style={{ left: `${s.left}%`, "--dur": `${s.dur}s`, "--delay": `${s.delay}s`, "--sway": `${s.sway}px` } as CSSProperties} />
      ))}
    </div>
  );
}

