import { NextResponse } from "next/server";
import { geminiPing, geminiStatus, type GeminiStatus } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Gemini diagnostics for the player; the game loop never calls this.
 *
 * GET /api/health         → geminiStatus() plus a plain-English hint. No request to Google.
 * GET /api/health?ping=1  → also lists the models the key can see (GET /v1beta/models) and makes
 *                           one tiny generateContent call, returning the raw status and message.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = geminiStatus();
  const body: Record<string, unknown> = { ok: true, now: Date.now(), ...status, hint: hint(status) };
  if (url.searchParams.get("ping")) body.ping = await geminiPing();
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

function hint(s: GeminiStatus): string {
  const now = Date.now();
  if (!s.configured) return "No GEMINI_API_KEY: the game runs on template coaching and keyless hints. See README → Gemini setup.";
  if (s.cooldownUntil > now) return `Every model is cooling down after a 429 (quota); next try in ${Math.ceil((s.cooldownUntil - now) / 1000)} s. Free tier is roughly 5–15 requests/min and 100–250/day per model.`;
  const cooling = Object.keys(s.cooldowns);
  if (cooling.length) return `${cooling.join(", ")} cooling down after a 429; other models still answer.`;
  const e = s.lastError;
  if (!e) return "Key present, no failures recorded since this server started. Add ?ping=1 to make one real request.";
  if (e.status === 429) return `Last failure was quota (429) on ${e.model}: ${e.message}`;
  if (e.status === 404) return `Model "${e.model}" was not found. Use ?ping=1 → ping.list.models to pick a name and set GEMINI_MODEL / GEMINI_MODEL_LITE.`;
  if (e.status === 400 || e.status === 401 || e.status === 403) return `Last failure: ${e.status} on ${e.model}: ${e.message}`;
  if (e.status === 0) return `Last failure: ${e.model} did not answer (${e.message}).`;
  return `Last failure: ${e.status} on ${e.model}: ${e.message}`;
}
