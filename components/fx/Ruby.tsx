"use client";

import { Fragment, type ReactNode } from "react";
import { pinyin } from "pinyin-pro";
import { LANG_ITALIC, LANG_TAG, type LangId } from "./types";

/**
 * Pinyin for every Chinese string on screen.
 *
 *   <Ruby text={enemyName(e, lang)} lang={lang} />          // <ruby>蝙<rt>biān</rt>蝠<rt>fú</rt></ruby> for zh, plain text for es
 *   {withPinyin("火花+ lands for 14.", lang)}                // any string: every Han run becomes ruby, the rest is untouched
 *
 * Readings come from pinyin-pro with tone marks and 一/不 sandhi, one <rt> per character so the
 * tone sits over the character it belongs to. Chinese punctuation, Latin text and digits stay as
 * they are. Results are memoised per run of characters.
 */

/** Han characters: unified ideographs, extension A, compatibility ideographs, 々 and 〇. */
const HAN_RUN = /[㐀-䶿一-鿿豈-﫿々〇]+/g;
const HAN_TEST = /[㐀-䶿一-鿿豈-﫿々〇]/;

/** True when the string contains at least one Chinese character. */
export const hasHan = (s: string): boolean => HAN_TEST.test(s);

const cache = new Map<string, string[]>();
const CACHE_MAX = 4000;

/** Tone-marked pinyin for a run of Han characters, one entry per character. Memoised; never throws. */
export function pinyinOf(run: string): string[] {
  const hit = cache.get(run);
  if (hit) return hit;
  let out: string[];
  try {
    out = pinyin(run, { type: "array", toneType: "symbol" });
    if (out.length !== run.length) out = Array.from(run, (ch) => pinyin(ch, { type: "array", toneType: "symbol" })[0] ?? "");
  } catch {
    out = Array.from(run, () => "");
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(run, out);
  return out;
}

/** One <ruby> for a run of characters: 字<rt>zì</rt>字<rt>zì</rt>… */
function RubyRun({ run, rt }: { run: string; rt?: string }) {
  if (rt !== undefined) return <ruby className="fx-ruby">{run}<rt>{rt}</rt></ruby>;
  const py = pinyinOf(run);
  return (
    <ruby className="fx-ruby">
      {Array.from(run, (ch, i) => <Fragment key={i}>{ch}<rt>{py[i]}</rt></Fragment>)}
    </ruby>
  );
}

/**
 * Wrap every run of Chinese characters in `text` with ruby pinyin; everything else is returned
 * verbatim. For "es" (or text without Han characters) the string itself comes back, so this is
 * safe to drop into any JSX child position.
 */
export function withPinyin(text: string, lang: LangId): ReactNode {
  if (lang !== "zh" || !text || !hasHan(text)) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(HAN_RUN)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(<Fragment key={parts.length}>{text.slice(last, start)}</Fragment>);
    parts.push(<RubyRun key={parts.length} run={m[0]} />);
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={parts.length}>{text.slice(last)}</Fragment>);
  return <span lang={LANG_TAG.zh} className="fx-zh">{parts}</span>;
}

export type RubyProps = {
  text: string;
  lang: LangId;
  className?: string;
  /** Override the reading for the whole text (e.g. a curated `Vocab.reading`); default is per-character pinyin. */
  rt?: string;
  /** Italicise when the language allows it (Spanish). Chinese is never italic whatever you pass. */
  italic?: boolean;
};

/** An in-world name or phrase in the target language: ruby pinyin for zh, plain (optionally italic) text for es. */
export default function Ruby({ text, lang, className = "", rt, italic = false }: RubyProps) {
  if (lang === "zh") {
    return (
      <span lang={LANG_TAG.zh} className={`fx-zh ${className}`}>
        {rt !== undefined && text ? <RubyRun run={text} rt={rt} /> : withPinyin(text, "zh")}
      </span>
    );
  }
  return <span lang={LANG_TAG[lang]} className={`${italic && LANG_ITALIC[lang] ? "italic" : ""} ${className}`}>{text}</span>;
}
