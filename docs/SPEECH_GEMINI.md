# Speech capture and Gemini: notes for the UI

What the battle, event-trial and mentor screens need to know about `lib/speech.ts`,
`components/hooks/useSpeechCapture.ts`, `lib/gemini.ts` and `app/api/*`. Shapes are the ones in
`docs/DESIGN.md` §9; this page is about *using* them.

## 1. Casting with `useSpeechCapture`

```tsx
"use client";
import { useSpeechCapture } from "@/components/hooks/useSpeechCapture";
import { bestMatch } from "@/lib/scoring";

const TIMEOUT_BY_LEVEL = { 1: 6000, 2: 8000, 3: 11000 } as const;  // budget to *start* speaking

const mic = useSpeechCapture();            // { listening, level, start, stop }

async function castSelected(card, phrase) {
  if (mic.listening) return;               // start() would just return the pending promise anyway
  const cap = await mic.start(L.speech, { timeoutMs: TIMEOUT_BY_LEVEL[phrase.level] });
  switch (cap.reason) {
    case "silence":
    case "timeout":
      // NOT a cast: no breath spent, no damage, no grudge, card stays in hand.
      toast("I didn't hear anything — try again.");
      return;
    case "error":
      toast(cap.error!);                    // human sentence, e.g. "Microphone blocked. Allow the mic in the address bar…"
      offerTypingMode();
      return;
    case "unsupported":
      setUseTyping(true);                   // and keep it on
      return;
    case "result":
    case "stopped": {                       // "stopped" = the player pressed stop and words came back; score it the same way
      const best = bestMatch(cap.alts, phrase.text, L.tokens);
      const { run: next, result } = castCard(run, card.uid, phrase, best.score, cap.ms, mastered);
      // … animate, then ask for coaching (see §3) with cap.audio
    }
  }
}
```

Rules the capture layer relies on the UI for:

- **Silence is free.** `"silence"` and `"timeout"` mean nothing scoreable was heard. Do not call
  `castCard`, do not spend breath, do not add a grudge. Show one quiet line and let the player try
  again (or redraw). This is the fix for "silence is punished".
- **`timeoutMs` is the budget to begin speaking**, not the whole budget. Once speech is detected
  the recognizer runs on until `maxMs` (default `timeoutMs + 6000`). Suggested: 6000 ms for
  level-1 words, 8000 for level-2 phrases, 11000 for level-3 sentences. Cursed phrases are one
  level harder, so pick by the drawn phrase's `level`, not the card's tier.
- **Show a Stop button while `listening`.** `mic.stop()` ends listening now and still delivers
  what was heard (the recognizer's final result arrives within ~1 s; the hook waits up to 2.5 s).
  Bind it to the same key as Cast (space) so "press to cast, press again to finish" works.
- **Meter.** `mic.level` is 0..1 (RMS ×3, quantised to 0.02) about 30×/s while listening and 0
  otherwise. One `ember breathe` animation plus a thin bar is enough; it also tells the player
  the mic is live.
- **`cap.ms`** is the time from start to the final result and feeds the crit check (`ms < 2500`).
- The browser's mic indicator goes off with the result. If it stays on, something outside the
  capture layer holds a stream.
- Only one capture runs at a time; a second `start()` while listening returns the pending promise.
  Unmounting the screen stops the capture and releases the mic.
- Event trials (`DESIGN.md` §6) use the same hook: draw with `drawPhrase(run, { level }, lexicon)`,
  capture, then `resolveEvent(run, idx, best.score)`; on silence just let them try again.
- `speak(text, L.speech)` from `lib/speech.ts` reads a phrase aloud (waits for voices to load and
  prefers a zh-CN voice for Mandarin). `speechSupported()` decides whether typing mode is forced.

## 2. Status line from `why`

Every route returns `mode` and, when Gemini did not answer, `why`. Map it to one quiet line next
to the coach text (never a modal; the game is already resolved):

| `why`        | show                                                        |
|--------------|-------------------------------------------------------------|
| `nokey`      | "coach is offline (no key)"; or nothing at all              |
| `cooldown`   | "coach resting — quota, try later"                           |
| `quota`      | "coach resting — quota, try later"                           |
| `timeout`    | "coach is slow today"                                        |
| `badmodel`   | "coach misconfigured — see /api/health"                      |
| `empty`      | nothing (template tip is shown instead)                      |
| `error`      | "coach unavailable"                                          |

`mode: "gemini"` means Gemini heard the audio; `"gemini-text"` means it only saw the transcript;
`"template"` is the built-in line. The old `(Gemini heard your audio)` tag can stay.

## 3. Routes

All `POST` with JSON, `runtime = "nodejs"`, `maxDuration = 60`. None of them ever blocks the game:
on any failure they answer with template text plus `why`.

### `/api/feedback` — one coaching sentence per cast

```jsonc
// request
{ "target": "下雨了", "reading": "xià yǔ le", "focus": "third tone", "transcript": "下鱼了",
  "score": 0.61, "audio": { "b64": "...", "mime": "audio/webm" } | null, "lang": "zh" }
// response
{ "tip": "…one sentence…", "mode": "gemini" | "gemini-text" | "template", "why"?: GeminiWhy }
```

- `score ≥ 0.97` → template praise, **no Gemini request** (the client may skip the call too).
- Pass `cap.audio` straight through; `null` makes a transcript-only request.
- Templates are language-aware: Mandarin ones name the syllable whose tone drifted (from the
  transcript vs the target) and quote the pinyin `reading`; Spanish ones talk vowels / rr / stress.
- 400 if `target` or `score` is missing.

### `/api/mentor` — Eco

```jsonc
// request  (every ctx field is optional; the title screen can send { lang } alone)
{ "messages": [{ "role": "user" | "mentor", "text": "…" }],
  "ctx": { "lang": "es", "floor": 2, "turn": 1, "hp": 40, "maxHp": 60, "shield": 0, "breath": 2, "maxBreath": 3, "ink": 40,
           "statuses": [{ "id": "focus", "stacks": 1, "turns": 1 }], "relics": ["eco"],
           "enemy": { "name": "Gólem de piedra", "gloss": "stone golem", "weak": "water", "resist": "fire", "minTier": 2,
                      "hpNow": 50, "hp": 80, "intent": "charge", "charged": false, "armor": 6, "statuses": [{ "id": "burn", "stacks": 2, "turns": 2 }] },
           "hand": [{ "phrase": "Chispa", "meaning": "spark (attack)", "element": "fire", "tier": 1, "cost": 1, "focus": "nature/light", "affordable": true, "note": "resisted" }],
           "selected": { "phrase": "la lluvia", "reading": null, "meaning": "the rain", "focus": "ll" },
           "last": { "phrase": "fuego", "heard": "juego", "score": 0.4, "backfire": true } } }
// response
{ "text": "…two sentences…", "mode": "gemini" | "template", "why"?: GeminiWhy }
```

Keyless fallback is Socratic and language-aware (Mandarin: tone contour, retroflex, ü; Spanish:
vowels, tap vs trill, b/v…). 400 if `messages` is missing.

### `/api/vocab` — grow the lexicon (lite model first)

```jsonc
// request
{ "theme": "weather", "exclude": ["la lluvia", "…texts already in this theme…"], "lang": "es" }
// response
{ "entries": Vocab[], "mode": "gemini" | "template", "why"?: GeminiWhy }     // 400 for a bad theme or lang
```

Entries are validated server-side (zh text must be CJK and carries a pinyin `reading`; es text must
be Latin; duplicates and texts over 40 chars are dropped), so the client can merge them as-is with
`mergeExtra`. **Budget: call this at most once per floor, from the map or reward screen**, not per
cast. `entries: []` with `why` is the normal "nothing new this time" answer.

### `/api/health` — diagnostics (GET, never from the game loop)

`/api/health` → `{ ok, configured, models, liteModels, cooldownUntil, cooldowns, lastError, timeoutMs, hint }`
with no request to Google. `/api/health?ping=1` adds `ping: { list: { status, models | null, message? }, generate: { model, status, ok, text? | message?, ms } }`.
A settings/debug corner may link to it; `hint` is already a sentence for humans.

## 4. Request budget (free tier ≈ 5–15 req/min, 100–250/day per model)

- feedback: 1 per cast, none at ≥ 0.97
- vocab: ≤ 1 per floor
- mentor: 1 per question

After a 429 the model cools down (Google's `Retry-After` / "retry in Ns", default 30 s); while every
model is cooling the routes return `why: "cooldown"` immediately, so the UI should not retry on its own.
