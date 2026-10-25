/**
 * Server-only Gemini caller. Never throws; every failure comes back as a `why`.
 *
 * - Two model lists: GEMINI_MODEL (coaching with audio, the mentor) and GEMINI_MODEL_LITE
 *   (bulk vocabulary JSON). `prefer: "lite"` tries the lite list first, then the other.
 * - Per-attempt timeout (GEMINI_TIMEOUT_MS, default 12 s) and a total budget under Vercel's 60 s.
 * - 500/503: short backoff, then the next model. 404: next model ("badmodel").
 * - 429: the model enters a cooldown (Retry-After header, RetryInfo.retryDelay or "retry in Ns"
 *   in the body, default 30 s). A very short delay (≤ 2.5 s) is retried once first. While every
 *   model is cooling, calls return `{ why: "cooldown" }` without a request.
 * - 400 mentioning thinking → retried once without `thinkingConfig`. thinkingBudget is 0 by
 *   default because thinking models burn maxOutputTokens on hidden reasoning.
 * - `lastError` and the cooldowns are kept on globalThis so /api/health sees what the game saw,
 *   even in `next dev` where each route gets its own module instance.
 *
 * Free-tier quota (2026): roughly 5–15 requests/min and 100–250/day per model, per Google Cloud
 * project. The game spends one request per cast (feedback), plus vocab and mentor calls.
 */

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
export type GeminiContent = { role?: "user" | "model"; parts: GeminiPart[] };
export type GeminiWhy = "nokey" | "quota" | "cooldown" | "timeout" | "badmodel" | "empty" | "error";
export type GeminiResult = { text: string | null; why?: GeminiWhy; model?: string };
export type GeminiLastError = { status: number; message: string; model: string; at: number };
export type GeminiStatus = {
  configured: boolean;
  models: string[];
  liteModels: string[];
  cooldownUntil: number;                 // > 0 only while *every* model is cooling (earliest release)
  cooldowns: Record<string, number>;     // per-model release times, only models currently cooling
  lastError: GeminiLastError | null;
  timeoutMs: number;
};

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_FLASH = "gemini-3.8-flash,gemini-3.5-flash";
const DEFAULT_LITE = "gemini-3.8-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash";
const BACKOFF_MS = [400, 1200];
const TOTAL_BUDGET_MS = 50_000;          // Vercel route maxDuration is 60 s
const DEFAULT_COOLDOWN_MS = 30_000;
const MIN_COOLDOWN_MS = 1_000;
const MAX_COOLDOWN_MS = 15 * 60_000;     // a daily-quota 429 asks for hours; one probe per 15 min is cheap
const QUICK_RETRY_MAX_MS = 2_500;

const TIMEOUT_MS = clampInt(process.env.GEMINI_TIMEOUT_MS, 12_000, 1_000, 55_000);

type State = { cooldowns: Record<string, number>; lastError: GeminiLastError | null };
const slot = globalThis as unknown as { __incantationGemini?: State };
const state: State = slot.__incantationGemini ?? (slot.__incantationGemini = { cooldowns: {}, lastError: null });

function clampInt(raw: string | undefined, dflt: number, min: number, max: number) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
}
const list = (raw: string | undefined, dflt: string) => (raw && raw.trim() ? raw : dflt).split(",").map((s) => s.trim()).filter(Boolean);
const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const flashModels = () => list(process.env.GEMINI_MODEL, DEFAULT_FLASH);
export const liteModels = () => list(process.env.GEMINI_MODEL_LITE, DEFAULT_LITE);
const apiKey = () => (process.env.GEMINI_API_KEY || "").trim();
const inCooldown = (model: string, now = Date.now()) => (state.cooldowns[model] ?? 0) > now;

export const isGeminiLive = () => Boolean(apiKey());

export function geminiStatus(): GeminiStatus {
  const now = Date.now();
  const models = flashModels(), lite = liteModels();
  const all = uniq([...models, ...lite]);
  const cooling = all.filter((m) => inCooldown(m, now));
  return {
    configured: isGeminiLive(),
    models,
    liteModels: lite,
    cooldownUntil: all.length && cooling.length === all.length ? Math.min(...cooling.map((m) => state.cooldowns[m])) : 0,
    cooldowns: Object.fromEntries(cooling.map((m) => [m, state.cooldowns[m]])),
    lastError: state.lastError,
    timeoutMs: TIMEOUT_MS,
  };
}

/** Remember the latest failure for /api/health and log one line. */
function noteFailure(status: number, message: string, model: string) {
  state.lastError = { status, message: message.slice(0, 400), model, at: Date.now() };
  console.warn(`[gemini] ${model}: ${status || "no response"} ${message.slice(0, 200)}`);
}

function startCooldown(model: string, wantMs: number | null) {
  const ms = Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, wantMs ?? DEFAULT_COOLDOWN_MS));
  state.cooldowns[model] = Date.now() + ms;
  console.warn(`[gemini] ${model}: cooling down ${Math.round(ms / 1000)} s after 429`);
}

/* ---------- parsing helpers (exported for tests) ---------- */

/** "23.4s", "1h 8m 3s", "500ms" → milliseconds, or null. */
export function durationMs(s: string): number | null {
  let total = 0, found = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(ms|h|m|s)\b/gi)) {
    found = true;
    const n = Number(m[1]);
    total += m[2].toLowerCase() === "h" ? n * 3_600_000 : m[2].toLowerCase() === "m" ? n * 60_000 : m[2].toLowerCase() === "ms" ? n : n * 1000;
  }
  return found ? Math.round(total) : null;
}

/** Retry-After header (seconds or HTTP date), google.rpc.RetryInfo.retryDelay, or "retry in 23.4s" in the message. */
export function parseRetryAfter(header: string | null, body: string): number | null {
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n)) return Math.max(0, n * 1000);
    const d = Date.parse(header);
    if (Number.isFinite(d)) return Math.max(0, d - Date.now());
  }
  try {
    const j = JSON.parse(body);
    const details: unknown[] = Array.isArray(j?.error?.details) ? j.error.details : [];
    for (const d of details) {
      const delay = (d as { retryDelay?: unknown })?.retryDelay;
      if (typeof delay === "string") { const ms = durationMs(delay); if (ms !== null) return ms; }
    }
  } catch { /* not JSON */ }
  const m = /retry (?:in|after)\s+([\d.]+\s*(?:ms|h|m|s)\b(?:\s*[\d.]+\s*(?:ms|h|m|s)\b)*)/i.exec(body);
  return m ? durationMs(m[1]) : null;
}

/** Google's JSON error → "message (STATUS)"; otherwise the raw body, trimmed. */
export function errorMessage(raw: string, status: number): string {
  try {
    const j = JSON.parse(raw);
    const e = j?.error;
    if (e?.message) return `${String(e.message).trim()}${e.status ? ` (${e.status})` : ""}`;
  } catch { /* not JSON */ }
  const t = raw.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 300) : `HTTP ${status}`;
}

type Candidate = { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string };
type GenerateResponse = { candidates?: Candidate[]; promptFeedback?: { blockReason?: string } };

export function extractText(data: GenerateResponse | null): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("").trim();
}

function emptyReason(data: GenerateResponse | null) {
  const fr = data?.candidates?.[0]?.finishReason;
  const br = data?.promptFeedback?.blockReason;
  return `${br ? ` (prompt blocked: ${br})` : ""}${fr && fr !== "STOP" ? ` (finishReason ${fr})` : ""}`;
}

/* ---------- one HTTP attempt ---------- */

type Attempt =
  | { kind: "ok"; status: number; text: string }
  | { kind: "empty"; status: number; message: string }
  | { kind: "http"; status: number; message: string; retryAfterMs: number | null }
  | { kind: "timeout"; status: 0; message: string }
  | { kind: "network"; status: 0; message: string };

async function generate(model: string, key: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = e as { name?: string; message?: string; cause?: { message?: string } };
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return timedOut
      ? { kind: "timeout", status: 0, message: `no reply within ${timeoutMs} ms` }
      : { kind: "network", status: 0, message: err?.cause?.message || err?.message || "network error" };
  }
  const raw = await res.text().catch(() => "");
  if (res.ok) {
    let data: GenerateResponse | null = null;
    try { data = JSON.parse(raw); } catch { /* fall through as empty */ }
    const text = extractText(data);
    return text ? { kind: "ok", status: res.status, text } : { kind: "empty", status: res.status, message: `empty reply${emptyReason(data)}` };
  }
  return { kind: "http", status: res.status, message: errorMessage(raw, res.status), retryAfterMs: parseRetryAfter(res.headers.get("retry-after"), raw) };
}

/* ---------- public call ---------- */

export async function callGemini(
  contents: GeminiContent[],
  generationConfig: Record<string, unknown>,
  opts: { prefer?: "flash" | "lite" } = {},
): Promise<GeminiResult> {
  const key = apiKey();
  if (!key) return { text: null, why: "nokey" };
  const order = opts.prefer === "lite" ? uniq([...liteModels(), ...flashModels()]) : uniq([...flashModels(), ...liteModels()]);
  const started = Date.now();
  const candidates = order.filter((m) => !inCooldown(m));
  if (!candidates.length) return { text: null, why: "cooldown" };

  let why: GeminiWhy = "error";
  let lastModel: string | undefined;
  for (const model of candidates) {
    if (lastModel && Date.now() - started + TIMEOUT_MS > TOTAL_BUDGET_MS) break; // leave time for the route to answer
    lastModel = model;
    let config: Record<string, unknown> = { thinkingConfig: { thinkingBudget: 0 }, ...generationConfig };
    let thinkingRetried = false, quickRetried = false;

    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      const r = await generate(model, key, { contents, generationConfig: config });
      if (r.kind === "ok") return { text: r.text, model };
      noteFailure(r.status, r.message, model);

      if (r.kind === "timeout") { why = "timeout"; break; }         // an overloaded model: move on
      if (r.kind === "network") { why = "error"; break; }
      if (r.kind === "empty") { why = "empty"; break; }

      const { status, message } = r;
      if (status === 429) {
        why = "quota";
        const wait = r.retryAfterMs;
        if (!quickRetried && wait !== null && wait <= QUICK_RETRY_MAX_MS && attempt < BACKOFF_MS.length) { quickRetried = true; await sleep(wait); continue; }
        startCooldown(model, wait);
        break;
      }
      if (status === 404) { why = "badmodel"; break; }
      if (status === 400 && /thinking/i.test(message) && !thinkingRetried) {
        thinkingRetried = true;
        const { thinkingConfig: _drop, ...rest } = config; void _drop;
        config = rest;
        continue;
      }
      if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message))) return { text: null, why: "error", model }; // key-wide: no other model will do better
      if ((status === 500 || status === 503) && attempt < BACKOFF_MS.length) { await sleep(BACKOFF_MS[attempt]); continue; }
      why = "error";
      break;
    }
  }
  return { text: null, why, model: lastModel };
}

/* ---------- diagnostics for /api/health?ping=1 (never called by the game loop) ---------- */

export type GeminiPing = {
  configured: boolean;
  list: { status: number; models: string[] | null; message?: string; ms: number } | null;
  generate: { model: string; status: number; ok: boolean; text?: string; message?: string; ms: number } | null;
};

/** One GET /models and one tiny generateContent on the first flash model, raw status and message. */
export async function geminiPing(): Promise<GeminiPing> {
  const key = apiKey();
  if (!key) return { configured: false, list: null, generate: null };

  let t = Date.now();
  let listOut: GeminiPing["list"];
  try {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const raw = await res.text().catch(() => "");
    if (res.ok) {
      let names: string[] = [];
      try {
        const j = JSON.parse(raw) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
        names = (j.models ?? [])
          .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
          .map((m) => String(m.name ?? "").replace(/^models\//, ""))
          .filter(Boolean);
      } catch { /* leave empty */ }
      listOut = { status: res.status, models: names, ms: Date.now() - t };
    } else {
      listOut = { status: res.status, models: null, message: errorMessage(raw, res.status), ms: Date.now() - t };
    }
  } catch (e) {
    const err = e as { name?: string; message?: string };
    listOut = { status: 0, models: null, message: err?.name === "TimeoutError" ? `no reply within ${TIMEOUT_MS} ms` : err?.message || "network error", ms: Date.now() - t };
  }

  const model = flashModels()[0];
  t = Date.now();
  const r = await generate(model, key, {
    contents: [{ parts: [{ text: "Reply with the single word: ok" }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } },
  });
  const ms = Date.now() - t;
  if (r.kind !== "ok") {
    noteFailure(r.status, r.message, model);
    if (r.kind === "http" && r.status === 429) startCooldown(model, r.retryAfterMs);
  }
  return {
    configured: true,
    list: listOut,
    generate: r.kind === "ok" ? { model, status: r.status, ok: true, text: r.text, ms } : { model, status: r.status, ok: false, message: r.message, ms },
  };
}
