/**
 * Scoring checks (node:assert). Run with `npm run check` (after the engine checks) or
 * `npx tsx lib/scoring.check.ts`. The pronunciation score is decided here, deterministically,
 * before Gemini is ever called; these pin the repetition tolerance, the recognizer-evidence
 * factors and the grade bands described in docs/SPEECH_GEMINI.md §1.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { similarity, similarityTyped, matchScore, matchDetail, bestMatch, missedWords, grade, BACKFIRE_BELOW } from "./scoring";
import { mergeAlts } from "./speech";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} ≠ ${b}`);
const alt = (transcript: string, confidence = 0, early?: boolean) => (early ? { transcript, confidence, early } : { transcript, confidence });

console.log("scoring checks");

check("purity: lib/scoring.ts imports no DOM, fetch or React", () => {
  const src = readFileSync(join(process.cwd(), "lib/scoring.ts"), "utf8");
  assert.ok(!/from\s+["'](react|next|react-dom)/.test(src));
  assert.ok(!/\b(window|document|localStorage|navigator)\s*\.\s*[A-Za-z]|\bfetch\s*\(/.test(src));
  assert.ok(!/"use client"/.test(src));
});

check("Mandarin repetition: 心 heard as 心心 scores ≥ 0.99 and misses nothing; plain similarity alone would backfire", () => {
  assert.ok(matchScore("心心", "心", "char") >= 0.99);
  assert.deepEqual(missedWords("心心", "心", "char"), []);
  assert.ok(similarity("心心", "心", "char") < BACKFIRE_BELOW, "the old path punished the doubled syllable");
  const d = matchDetail("心心", "心", "char");
  assert.equal(d.matched, "心"); assert.equal(d.leftover, "repeat");
  assert.ok(matchScore("下雨了下雨了", "下雨了", "char") >= 0.99, "a repeated sentence");
  assert.ok(matchScore("不是不是", "不是", "char") >= 0.99, "windows are re-read on their own (不 sandhi)");
  assert.ok(matchScore("心心心", "心", "char") >= 0.99, "three times");
});

check("Mandarin homophones and tones: 心 vs 新 = 1; 心 vs 性 (xìng) backfires; 心 vs 信 (xìn, wrong tone) backfires", () => {
  assert.equal(matchScore("新", "心", "char"), 1);
  assert.ok(matchScore("性", "心", "char") < BACKFIRE_BELOW);
  assert.ok(matchScore("信", "心", "char") < BACKFIRE_BELOW);
  assert.deepEqual(missedWords("性", "心", "char"), ["心"]);
});

check("Mandarin extra material: 今天下雨了 for 下雨了 keeps the window but pays ×0.9; a wrong-tone repeat is other material", () => {
  const d = matchDetail("今天下雨了", "下雨了", "char");
  assert.equal(d.matched, "下雨了"); assert.equal(d.leftover, "other"); near(d.score, 0.9);
  const e = matchDetail("心信", "心", "char");
  assert.equal(e.leftover, "other"); near(e.score, 0.9);
});

check("Spanish repetition and extra material: hola hola ≥ 0.99; un el gato negro for el gato in [0.85, 1)", () => {
  assert.ok(matchScore("hola hola", "hola") >= 0.99);
  assert.deepEqual(missedWords("hola hola", "hola"), []);
  const s = matchScore("un el gato negro", "el gato");
  assert.ok(s >= 0.85 && s < 1, `${s}`);
  const d = matchDetail("un el gato negro", "el gato");
  assert.equal(d.matched, "el gato"); assert.equal(d.leftover, "other");
  assert.ok(matchScore("la lluvia la lluvia", "la lluvia") >= 0.99);
  assert.deepEqual(missedWords("un el gato negro", "el gato"), []);
  assert.deepEqual(missedWords("un gato negro", "el gato"), ["el"]);
});

check("the window never lowers a score: plain similarity stays the floor; a wrong opening consonant is still wrong", () => {
  for (const [said, target] of [["gatos", "gato"], ["juego", "fuego"], ["el gato", "el gato negro"], ["", "gato"], ["心", "心心"]] as const) {
    assert.ok(matchScore(said, target, /[一-鿿]/.test(target) ? "char" : "word") >= similarity(said, target, /[一-鿿]/.test(target) ? "char" : "word"), `${said} / ${target}`);
  }
  assert.ok(matchScore("juego", "fuego") < 0.75);
  assert.equal(matchScore("", "gato"), 0);
  assert.equal(matchDetail("gato", "gato").leftover, "none");
});

check("bestMatch rank factor: 2nd guess 0.90, 3rd ≤ 0.82, 4th+ 0.78; an early snapshot is rank 0", () => {
  const third = bestMatch([alt("cato"), alt("pato"), alt("gato")], "gato");
  assert.equal(third.transcript, "gato"); assert.equal(third.rank, 2); assert.ok(third.score <= 0.82 && third.score > 0.8, `${third.score}`);
  assert.equal(grade(third.score).label, "Bien", "a third guess is never Perfecto");
  near(bestMatch([alt("pato"), alt("gato")], "gato").score, 0.9);
  near(bestMatch([alt("cato"), alt("pato"), alt("dato"), alt("gato")], "gato").score, 0.78);
  near(bestMatch([alt("cato"), alt("pato"), alt("dato"), alt("rato"), alt("gato")], "gato").score, 0.78);
  const early = bestMatch([alt("cato", 0.8), alt("gato", 0, true)], "gato");
  assert.equal(early.transcript, "gato"); assert.equal(early.rank, 0); assert.equal(early.score, 1);
  assert.equal(bestMatch([alt("gato"), alt("cato", 0, true)], "gato").rank, 0, "the top guess keeps rank 0 regardless of the snapshot");
});

check("bestMatch confidence factor: perfect transcript at 0.5 → 0.875 (Bien); 0.6 → 0.90 (Perfecto floor); unknown → no factor", () => {
  near(bestMatch([alt("gato", 0.5)], "gato").score, 0.875);
  assert.equal(grade(0.875).label, "Bien");
  near(bestMatch([alt("gato", 0.6)], "gato").score, 0.9);
  near(bestMatch([alt("gato", 1)], "gato").score, 1);
  assert.equal(bestMatch([alt("gato", 0)], "gato").score, 1);
  near(bestMatch([alt("心心", 0.9)], "心", "char").score, 0.975, "the doubled syllable at confidence 0.9");
  near(bestMatch([alt("gato", 0.3)], "gato").score, 0.825);
  assert.ok(bestMatch([alt("gato", 0.01)], "gato").score >= 0.75, "confidence alone never backfires a perfect transcript");
  const miss = bestMatch([alt("perro", 0.9)], "gato");
  assert.equal(miss.transcript, "perro", "the transcript is reported even when nothing matched"); assert.ok(miss.score < BACKFIRE_BELOW);
  assert.deepEqual(bestMatch([], "gato"), { transcript: "", score: 0, confidence: 0, rank: 0, matched: "" });
  const m = bestMatch([alt("un el gato negro", 0.8)], "el gato");
  assert.equal(m.matched, "el gato"); near(m.score, 0.9 * 0.95);
});

check("mergeAlts (lib/speech.ts): finals first, snapshot appended; it inherits confidence only when the final grew out of it", () => {
  const snap = { transcript: "心", confidence: 0 };
  assert.deepEqual(mergeAlts([alt("心心", 0.8)], [], snap), [alt("心心", 0.8), alt("心", 0.8, true)], "grew: inherits");
  assert.deepEqual(mergeAlts([alt("心", 0.8)], [], snap), [alt("心", 0.8)], "same text: not duplicated");
  assert.deepEqual(mergeAlts([alt("新", 0.8), alt("心", 0)], [], snap), [alt("新", 0.8), alt("心", 0), alt("心", 0, true)], "disagrees: unknown confidence, still rank 0");
  assert.deepEqual(mergeAlts([], [alt("心 心")], snap), [alt("心 心"), alt("心", 0, true)], "no final: last interim then the snapshot");
  assert.deepEqual(mergeAlts([], [alt("  ")], null), [], "blank interims are dropped");
  assert.deepEqual(mergeAlts([alt("Gatos", 0.7)], [], { transcript: "gato", confidence: 0 }), [alt("Gatos", 0.7), alt("gato", 0.7, true)], "case-insensitive prefix");
  // early accept never beats the confidence-weighted final when the final merely grew
  const m = bestMatch(mergeAlts([alt("心什么", 0.8)], [], snap), "心", "char");
  near(m.score, 0.95); assert.equal(m.rank, 0); assert.equal(m.transcript, "心");
  // …but when the final disagrees outright the snapshot competes at rank 0 with no confidence factor
  assert.equal(bestMatch(mergeAlts([alt("性", 0.9)], [], snap), "心", "char").score, 1);
});

check("typed path unchanged: pinyin with tones, without tones, characters, Spanish", () => {
  assert.equal(similarityTyped("xin1", "心", "char"), 1);
  assert.equal(similarityTyped("xin", "心", "char"), 1);
  assert.equal(similarityTyped("xia4 yu3 le", "下雨了", "char"), 1);
  assert.equal(similarityTyped("心", "心", "char"), 1);
  assert.equal(similarityTyped("hola", "hola", "word"), 1);
  assert.ok(similarityTyped("xing4", "心", "char") < 0.75);
});

check("grade bands: ≥ 0.90 Perfecto, ≥ 0.75 Bien, ≥ 0.45 Más o menos, below backfires; BACKFIRE_BELOW = 0.45; zh labels", () => {
  assert.equal(BACKFIRE_BELOW, 0.45);
  assert.equal(grade(1).label, "Perfecto"); assert.equal(grade(0.9).label, "Perfecto");
  assert.equal(grade(0.899).label, "Bien"); assert.equal(grade(0.75).label, "Bien");
  assert.equal(grade(0.749).label, "Más o menos"); assert.equal(grade(0.45).label, "Más o menos");
  assert.equal(grade(0.449).label, "¡Fallo!"); assert.equal(grade(0).label, "¡Fallo!");
  assert.equal(grade(1, "zh").label, "完美"); assert.equal(grade(0.8, "zh").label, "很好"); assert.equal(grade(0.5, "zh").label, "马马虎虎"); assert.equal(grade(0.3, "zh").label, "失败！");
});

console.log(process.exitCode ? `\n${passed} passed, some FAILED` : `\nall ${passed} checks passed`);
