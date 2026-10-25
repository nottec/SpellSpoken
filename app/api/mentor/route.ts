import { NextResponse } from "next/server";
import { callGemini, isGeminiLive, type GeminiContent, type GeminiWhy } from "@/lib/gemini";
import { LANGS, type LangConfig, type LangId } from "@/lib/lang";
import { missedWords, normalize, syllables } from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow Gemini retries to finish (hobby default is 10s)

type Msg = { role: "user" | "mentor"; text: string };
type StatusLike = { id: string; stacks?: number; turns?: number };
/** Everything is optional: the title screen sends `{ lang }`, the battle screen sends the lot. */
type Ctx = {
  lang?: LangId;
  room?: number; floor?: number; turn?: number; phase?: string;
  hp?: number; maxHp?: number; shield?: number; ink?: number; resonance?: number;
  breath?: number; maxBreath?: number;
  statuses?: StatusLike[]; relics?: string[];
  enemy?: {
    name: string; gloss?: string; weak?: string; resist?: string; minTier?: number; hpNow?: number; hp?: number;
    intent?: string; charged?: boolean; armor?: number; statuses?: StatusLike[];
  } | null;
  hand?: { phrase: string; meaning?: string; element?: string; tier?: number; cost?: number; focus?: string; affordable?: boolean; note?: string; incantation?: string; reading?: string }[];
  /** The card the learner has selected and the incantation drawn for it: "this word" / "this card" in their questions. */
  selected?: { phrase: string; meaning?: string; focus?: string; reading?: string; card?: string; effect?: string; element?: string; cost?: number } | null;
  last?: { phrase: string; heard: string; score: number; backfire: boolean; reading?: string } | null;
};
type Reply = { text: string; mode: "gemini" | "template"; why?: GeminiWhy };

const SYSTEM = (L: LangConfig) => `You are Eco, a spirit bound to a learner's spellbook in a ${L.english} pronunciation game called Incantation. You guide; you never hand over the answer. What matters in ${L.english}: ${L.coachHint}.

Rules you always follow:
- Never say the full target phrase aloud for them, never give the English translation of a spell outright, and never tell them exactly which spell to cast. Lead them there with a question or a partial hint.
- For pronunciation help, describe the mouth: where the tongue goes, how much air, whether the sound is voiced, and compare to an English sound they already know. Give ONE sound at a time.${L.hasReading ? " For tones, describe the pitch shape (flat, rising, dipping, falling) and name the tone number." : ""}
- For strategy, point at the evidence on screen ("look at what the enemy is weak to", "count your breath", "it told you what it does next") rather than naming the move.
- If they ask the same thing twice, give a bigger hint the second time, but still not the whole answer.
- "This word", "this card", "the one I'm looking at" always mean the selected card and its incantation given in the context below; coach that phrase, one sound or tone at a time. Never read the whole phrase for them.
- Two sentences max. Warm, a little mysterious, no emojis, no bullet points.`;

/**
 * Eco's chat. POST { messages: {role:"user"|"mentor", text}[], ctx?: Ctx, lang? }
 *  →  { text, mode: "gemini" | "template", why? }
 */
export async function POST(req: Request) {
  let body: { messages?: Msg[]; ctx?: Ctx; lang?: LangId };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && typeof m.text === "string") : null;
  if (!messages) return NextResponse.json({ error: "messages[] required" }, { status: 400 });
  const ctx: Ctx = body.ctx && typeof body.ctx === "object" ? body.ctx : {};
  const L = LANGS[ctx.lang ?? body.lang ?? "es"] ?? LANGS.es;
  const userLast = messages.filter((m) => m.role === "user").at(-1)?.text ?? "";
  if (!isGeminiLive()) return NextResponse.json<Reply>({ text: fallback(userLast, ctx, L), mode: "template", why: "nokey" });

  const contents: GeminiContent[] = [
    { role: "user", parts: [{ text: `${SYSTEM(L)}\n\n${describe(ctx, L)}` }] },
    { role: "model", parts: [{ text: "Understood. I guide, I do not answer." }] },
    ...messages.slice(-8).map((m): GeminiContent => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] })),
  ];

  const r = await callGemini(contents, { temperature: 0.7, maxOutputTokens: 300 });
  if (r.text) return NextResponse.json<Reply>({ text: r.text, mode: "gemini" });
  return NextResponse.json<Reply>({ text: fallback(userLast, ctx, L), mode: "template", why: r.why ?? "error" });
}

/* ---------- context for the model ---------- */

const statusText = (xs?: StatusLike[]) => (xs?.length ? xs.map((s) => `${s.id}${s.stacks ? ` ×${s.stacks}` : ""}${s.turns && s.turns < 99 ? ` (${s.turns}t)` : ""}`).join(", ") : "none");

function describe(ctx: Ctx, L: LangConfig) {
  const lines: string[] = [];
  const where = ctx.floor ?? ctx.room;
  lines.push(`Current state: ${where !== undefined ? `floor ${where + 1}` : "no run yet"}${ctx.turn ? `, turn ${ctx.turn}` : ""}${ctx.phase ? `, ${ctx.phase}` : ""}${ctx.hp !== undefined ? `, life ${ctx.hp}/${ctx.maxHp ?? "?"}` : ""}${ctx.shield ? `, shield ${ctx.shield}` : ""}${ctx.breath !== undefined ? `, breath ${ctx.breath}/${ctx.maxBreath ?? "?"}` : ""}${ctx.ink !== undefined ? `, ink ${ctx.ink}` : ""}${ctx.resonance ? `, resonance ${ctx.resonance}/3` : ""}.`);
  if (ctx.statuses?.length) lines.push(`Learner statuses: ${statusText(ctx.statuses)}.`);
  if (ctx.relics?.length) lines.push(`Relics: ${ctx.relics.join(", ")}.`);
  const e = ctx.enemy;
  lines.push(e
    ? `Enemy: ${e.name}${e.gloss ? ` (${e.gloss})` : ""}${e.weak ? `, weak to ${e.weak}` : ""}${e.resist ? `, resists ${e.resist}` : ""}${e.minTier ? `, shrugs off spells below tier ${e.minTier}` : ""}${e.hpNow !== undefined ? `, HP ${e.hpNow}/${e.hp ?? "?"}` : ""}${e.armor ? `, armor ${e.armor}` : ""}${e.intent ? `, next it will ${e.intent}${e.charged ? " (charged, double damage)" : ""}` : ""}${e.statuses?.length ? `, statuses: ${statusText(e.statuses)}` : ""}.`
    : "Enemy: none.");
  lines.push(`Hand: ${ctx.hand?.length ? ctx.hand.map((s) => `${s.phrase}${s.element ? ` [${s.element}` : "["}${s.tier ? `, tier ${s.tier}` : ""}${s.cost !== undefined ? `, ${s.cost} breath` : ""}${s.affordable === false ? ", unaffordable" : ""}${s.note ? `, ${s.note}` : ""}${s.focus ? `, trains ${s.focus}` : ""}${s.incantation ? `, its incantation right now: "${s.incantation}"${s.reading ? ` (${s.reading})` : ""}` : ""}]`).join("; ") : "empty"}.`);
  const sel = ctx.selected;
  lines.push(sel && sel.phrase
    ? `The learner is looking at the card ${sel.card ?? "(unnamed)"}${sel.element ? ` [${sel.element}` : "["}${sel.cost !== undefined ? `, ${sel.cost} breath` : ""}]${sel.effect ? `: ${sel.effect}` : ""} Its incantation right now, the phrase they must say to cast it: "${sel.phrase}"${sel.reading ? ` (${sel.reading})` : ""}${sel.meaning ? `, meaning "${sel.meaning}"` : ""}${sel.focus ? `, trains ${sel.focus}` : ""}. "This word" or "this card" means this one.`
    : "The learner has no card selected right now.");
  lines.push(`Last cast: ${ctx.last ? `tried "${ctx.last.phrase}"${ctx.last.reading ? ` (${ctx.last.reading})` : ""}, recognizer heard "${ctx.last.heard || "nothing"}", ${Math.round((ctx.last.score ?? 0) * 100)}%${ctx.last.backfire ? ", it backfired" : ""}` : "none yet"}.`);
  lines.push(`The learner's language is ${L.english}; the UI is English.`);
  return lines.join("\n");
}

/* ---------- keyless hints: still Socratic, points at the screen, never names the answer ---------- */

const CJK = /[㐀-䶿一-鿿豈-﫿]/;

/**
 * Target characters whose syllable (ignoring tone) was not heard. Compares pinyin *in context*
 * so 了 (le) or 不 under sandhi are not flagged just because their isolated reading differs.
 */
function zhMissedChars(heard: string, target: string): string[] {
  const chars = [...normalize(target, "char")].filter((c) => CJK.test(c));
  const t = syllables(target);
  if (t.length !== chars.length) return missedWords(heard, target, "char");
  const heardBases = new Set(syllables(heard).map((s) => s.slice(0, -1)));
  return chars.filter((_, i) => !heardBases.has(t[i].slice(0, -1)));
}

function zhMouth(f: string) {
  const s = f.toLowerCase();
  if (/tone|sandhi|neutral/.test(s)) return `This spell trains ${f}. Say the tone on "ma" first: where does your voice start, and where does it end? Then put the real syllable on that shape.`;
  if (/zh|ch|sh|retroflex/.test(s)) return `This spell trains ${f}. Curl the tip of your tongue back toward the roof of the mouth, as if starting an English "r", then let the air hiss past it. Try zh, ch, sh in a row.`;
  if (/ü|yu|ju|qu|xu/.test(s)) return `Say English "ee" and, without moving your tongue, round your lips as for "oo". That is ü. Hold it; now add the initial in front.`;
  if (/aspirat|p\/t\/k|puff/.test(s)) return `Hold your palm in front of your mouth: p, t, k must puff air onto it; b, d, g must not. Which one did yours do?`;
  if (/\bz\b|\bc\b|\bs\b|z\/c\/s|flat/.test(s)) return `Keep the tongue flat behind the teeth; the air hisses like the "ts" in "cats". Now, how is that different from sh?`;
  return `This spell trains ${f}. Say it one syllable at a time, tone first, then the whole word. Which syllable feels foreign in your mouth?`;
}

function esMouth(f: string) {
  const s = f.toLowerCase();
  if (/rr|roll|trill/.test(s)) return `This spell trains ${f}. Place your tongue where you'd start an English "d", then let air push it into a flutter. Try it on its own before the whole word.`;
  if (/tap|single r|\br\b/.test(s)) return `A single Spanish r is one quick tap, like the "dd" in American "ladder". Tap once, no more. Can you hear the difference from your English r?`;
  if (/vowel/.test(s)) return `Spanish vowels are short and never glide: "e" is "eh", not "ay". Say the five vowels in a row, each the same length, and listen for the one that drifts.`;
  if (/b\/v|soft b|\bv\b|\bb\b/.test(s)) return `b and v are the same sound here; between vowels the lips barely touch. Say it with the lips almost closed. Did they meet?`;
  if (/ll|\by\b/.test(s)) return `ll and y start like the "y" in "yes": quick and light, no "l" at all. Where is your tongue when you begin it?`;
  if (/silent h|\bh\b/.test(s)) return `The h is silent. Skip it and begin straight on the vowel. What is the first sound you actually make?`;
  if (/stress|accent/.test(s)) return `Find the stressed syllable and make it longer and a little louder; the others stay even. Which syllable carries the weight?`;
  if (/\bj\b|\bg\b|jota/.test(s)) return `j and soft g are a breathy "h" from the back of the throat, like fogging a mirror. Try it alone, then in the word.`;
  if (/ñ/.test(s)) return `ñ is "ny" as in "canyon", in one motion. Say "canyon" slowly and keep only the middle.`;
  return `This spell trains ${f}. Say it slowly, one syllable at a time, then at speed. Which syllable changes most?`;
}

function fallback(q: string, ctx: Ctx, L: LangConfig) {
  const s = q.toLowerCase();
  const zh = L.id === "zh";
  if (/fizzl|backfire|fail|wrong|why|miss/.test(s) && ctx.last) {
    const heard = ctx.last.heard ?? "";
    if (!heard.trim()) return "The book heard nothing at all. Was the glow still there when you began? Start a breath after it appears, and let the first sound be louder than you think.";
    const missed = zh ? zhMissedChars(heard, ctx.last.phrase ?? "") : missedWords(heard, ctx.last.phrase ?? "", L.tokens);
    if (missed.length) {
      return zh
        ? `The book heard "${heard}". The character${missed.length > 1 ? "s" : ""} ${missed.join("")} never arrived. Say the phrase one syllable at a time; which one changes shape in your mouth?`
        : `The book heard "${heard}". One of the words never arrived. Say the phrase slowly and listen for which syllable you swallow.`;
    }
    return zh
      ? "It heard the right syllables, so the tones drifted. Hum the shape of each tone first, flat, rising, dipping, falling, then put the syllable on it. Which one wobbles?"
      : "It heard most of it. Something in the vowels drifted toward English; Spanish vowels are short and never glide. Which vowel did you stretch?";
  }
  if (/what does (this|the|that) (card|spell|one) do|effect|what (is|does) this card/.test(s) && ctx.selected?.card) {
    const c = ctx.selected;
    return `${c.card}${c.cost !== undefined ? ` costs ${c.cost} breath` : ""}${c.effect ? `: ${c.effect.replace(/\.$/, "")}` : ""}. Whether it lands is up to how you say "${c.phrase}"${c.reading ? ` (${c.reading})` : ""}; the page tells you what it means.`;
  }
  if (/this (word|card|one|phrase|spell)|looking at|selected|how do i say|how to say/.test(s) && ctx.selected?.phrase) {
    const f = ctx.selected.focus;
    if (f) return zh ? zhMouth(f) : esMouth(f);
    return zh
      ? `Take ${ctx.selected.reading ?? "it"} one syllable at a time: hum each tone's shape first, then put the syllable on it. Which one wobbles?`
      : "Say it one syllable at a time, each vowel short and the same length, then at speed. Which syllable changes most?";
  }
  if (/which|what spell|cast|strategy|best|breath|cost|turn/.test(s) && ctx.enemy) {
    return `Read the line under the enemy's name: it tells you what it fears${ctx.enemy.intent ? ", and it has already told you what it does next" : ""}. The sigils in your book carry the same marks${ctx.breath !== undefined ? "; count your breath before you choose" : ""}.`;
  }
  if (/sound|pronounce|say|tone|rr|roll|how do i|ü|zh|sh|vowel/.test(s)) {
    const f = ctx.selected?.focus;
    if (!f) return "Pick a spell first. Each incantation trains a single sound, and I can only coach one at a time.";
    return zh ? zhMouth(f) : esMouth(f);
  }
  if (/mean|translat/.test(s)) return "The meaning is written in your book, but the enemy doesn't care what it means. It cares how it sounds. Say it, then ask me what you heard.";
  return "Ask me why a spell fizzled, how a sound is made, or how to read the enemy. I won't cast for you.";
}
