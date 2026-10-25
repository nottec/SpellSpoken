import { NextResponse } from "next/server";
import { callGemini, isGeminiLive } from "@/lib/gemini";
import { LANGS, type LangId } from "@/lib/lang";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow Gemini retries to finish (hobby default is 10s)

type Msg = { role: "user" | "mentor"; text: string };
type Ctx = {
  enemy?: { name: string; gloss: string; weak: string; resist?: string; minTier?: number; hpNow: number; hp: number };
  hand?: { phrase: string; meaning: string; element: string; tier: number; focus?: string }[];
  selected?: { phrase: string; meaning: string; focus?: string } | null;
  last?: { phrase: string; heard: string; score: number; backfire: boolean } | null;
  hp?: number; maxHp?: number; room?: number;
};

const SYSTEM = (L: { english: string; coachHint: string }) => `You are Eco, a spirit bound to a learner's spellbook in a ${L.english} pronunciation game called Incantation. You guide; you never hand over the answer. What matters in ${L.english}: ${L.coachHint}.

Rules you always follow:
- Never say the full target phrase aloud for them, never give the English translation of a spell outright, and never tell them exactly which spell to cast. Lead them there with a question or a partial hint.
- For pronunciation help, describe the mouth: where the tongue goes, how much air, whether the sound is voiced, and compare to an English sound they already know. Give ONE sound at a time.
- For strategy, point at the evidence on screen ("look at what the enemy is weak to") rather than naming the move.
- If they ask the same thing twice, give a bigger hint the second time, but still not the whole answer.
- Two sentences max. Warm, a little mysterious, no emojis, no bullet points.`;

export async function POST(req: Request) {
  const { messages, ctx } = (await req.json()) as { messages: Msg[]; ctx: Ctx & { lang?: LangId } };
  const L = LANGS[ctx.lang ?? "es"] ?? LANGS.es;
  const userLast = messages.filter((m) => m.role === "user").at(-1)?.text ?? "";
  if (!isGeminiLive()) return NextResponse.json({ text: fallback(userLast, ctx), mode: "template" });

  const context = `Current state: room ${(ctx.room ?? 0) + 1}, life ${ctx.hp}/${ctx.maxHp}.
Enemy: ${ctx.enemy ? `${ctx.enemy.name} (${ctx.enemy.gloss}), weak to ${ctx.enemy.weak}${ctx.enemy.resist ? `, resists ${ctx.enemy.resist}` : ""}${ctx.enemy.minTier ? `, needs tier ${ctx.enemy.minTier}+` : ""}, HP ${ctx.enemy.hpNow}/${ctx.enemy.hp}` : "none"}.
Spellbook: ${ctx.hand?.map((s) => `${s.phrase} [${s.element}, tier ${s.tier}, trains ${s.focus}]`).join("; ") ?? "empty"}.
Selected spell: ${ctx.selected ? `${ctx.selected.phrase} (trains ${ctx.selected.focus})` : "none"}.
Last cast: ${ctx.last ? `tried "${ctx.last.phrase}", recognizer heard "${ctx.last.heard}", ${Math.round(ctx.last.score * 100)}%${ctx.last.backfire ? ", it backfired" : ""}` : "none yet"}.`;

  const contents = [
    { role: "user", parts: [{ text: `${SYSTEM(L)}\n\n${context}` }] },
    { role: "model", parts: [{ text: "Understood. I guide, I do not answer." }] },
    ...messages.slice(-8).map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] })),
  ];

  const text = await callGemini(contents as any, { temperature: 0.7, maxOutputTokens: 300 });
  return NextResponse.json({ text: text || fallback(userLast, ctx), mode: text ? "gemini" : "template" });
}

/** Keyless hints. Still Socratic: points at the screen, never names the answer. */
function fallback(q: string, ctx: Ctx) {
  const s = q.toLowerCase();
  if (/fizzl|backfire|fail|wrong|why/.test(s) && ctx.last) {
    const missed = ctx.last.phrase.split(" ").filter((w) => !ctx.last!.heard.toLowerCase().includes(w.toLowerCase()));
    return missed.length ? `The book heard "${ctx.last.heard}". One of the words never arrived. Say the phrase slowly and listen for which syllable you swallow.` : `It heard most of it. Something in the vowels drifted toward English; Spanish vowels are short and never glide.`;
  }
  if (/which|what spell|cast|strategy|best/.test(s) && ctx.enemy) return `Read the line under the enemy's name. It tells you what it fears, and the sigils in your book carry the same marks.`;
  if (/sound|pronounce|say|rr|roll|how do i/.test(s)) {
    const f = ctx.selected?.focus;
    return f ? `This spell trains ${f}. Place your tongue where you'd start an English "d", then let air push it into a flutter. Try it on its own before the whole word.` : `Pick a spell first. Each one trains a single sound, and I can only coach one at a time.`;
  }
  if (/mean|translat/.test(s)) return `The meaning is written in your book, but the enemy doesn't care what it means. It cares how it sounds. Say it, then ask me what you heard.`;
  return `Ask me why a spell fizzled, how a sound is made, or how to read the enemy. I won't cast for you.`;
}
