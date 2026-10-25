/**
 * Server-only Gemini caller with retries and model fallback.
 *
 * GEMINI_MODEL can be a comma-separated list, e.g. "gemini-3.8-flash,gemini-3.8-flash-lite".
 * Each model gets up to 3 attempts on 429/503 (overloaded) with short backoff,
 * then the next model is tried. Returns null if everything fails; callers fall back to templates.
 */
const MODELS = (process.env.GEMINI_MODEL || "gemini-3.8-flash").split(",").map((s) => s.trim()).filter(Boolean);
const RETRY_STATUS = new Set([429, 500, 503]);
const BACKOFF_MS = [400, 1200];
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 12000);

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
export type GeminiContent = { role?: "user" | "model"; parts: GeminiPart[] };

export async function callGemini(contents: GeminiContent[], generationConfig: Record<string, unknown>): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  // Thinking models spend output tokens on hidden reasoning first. For short game
  // responses that reasoning adds latency and can starve the reply, so it's off by default.
  const config = { thinkingConfig: { thinkingBudget: 0 }, ...generationConfig };

  for (const model of MODELS) {
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents, generationConfig: config }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) return text;
          console.warn(`Gemini ${model}: empty response`, JSON.stringify(data).slice(0, 300));
          break; // empty but not an error; try next model
        }
        const body = await res.text().catch(() => "");
        if (RETRY_STATUS.has(res.status) && attempt < BACKOFF_MS.length) {
          console.warn(`Gemini ${model}: ${res.status}, retrying in ${BACKOFF_MS[attempt]}ms`);
          await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
          continue;
        }
        console.error(`Gemini ${model} failed: ${res.status} ${body.slice(0, 200)}`);
        break; // non-retryable (404 bad model, 400 bad request) or out of retries: next model
      } catch (e: any) {
        const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
        console.error(`Gemini ${model}: ${timedOut ? `no reply within ${TIMEOUT_MS}ms` : "network error"}`);
        if (timedOut && attempt < BACKOFF_MS.length) continue; // overloaded; try again, then next model
        break;
      }
    }
  }
  return null;
}

export const isGeminiLive = () => Boolean(process.env.GEMINI_API_KEY);
