# Speech capture and Gemini: notes for the UI

What the battle, event-trial and mentor screens need to know about `lib/speech.ts`,
`components/hooks/useSpeechCapture.ts`, `lib/scoring.ts`, `lib/gemini.ts` and `app/api/*`. Shapes
are the ones in `docs/DESIGN.md` §9; this page is about *using* them.

## 1. Casting with `useSpeechCapture`

```tsx
"use client";
import { useSpeechCapture } from "@/components/hooks/useSpeechCapture";
import { bestMatch } from "@/lib/scoring";

const TIMEOUT_BY_LEVEL = { 1: 6000, 2: 8000, 3: 11000 } as const;  // budget to *start* speaking
const IDLE_BY_LEVEL    = { 1: 1300, 2: 1800, 3: 2300 } as const;    // stop this long after the last recognizer update
const ACCEPT_AT = 0.9;                                              // early accept: an interim that already reads as the phrase

const mic = useSpeechCapture();            // { listening, level, heard, start, stop }

async function castSelected(card, phrase) {
  if (mic.listening) return;               // start() would just return the pending promise anyway
  const cap = await mic.start(L.speech, {
    timeoutMs: TIMEOUT_BY_LEVEL[phrase.level],
    idleMs: IDLE_BY_LEVEL[phrase.level],
    accept: (alts) => bestMatch(alts, phrase.text, L.tokens).score >= ACCEPT_AT,
  });
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
    case "result":                          // the recognizer's final, an early accept or an idle stop
    case "stopped": {                       // the player pressed Stop and words came back; score it the same way
      const best = bestMatch(cap.alts, phrase.text, L.tokens);   // { transcript, score, confidence, rank, matched }
      const { run: next, result } = castCard(run, card.uid, phrase, best.score, cap.ms, mastered);
      // … animate, then ask for coaching (see §3) with cap.audio
    }
  }
}
```

While `mic.listening`, show `mic.heard` (the live interim transcript, "" until something arrives)
in small ember text under the phrase — `hearing: 心 …` — so the player knows they were heard
and does not say the word again. The battle's `Incantation` already does this.

### How listening ends

`timeoutMs` is the budget to *begin* speaking; silence until then resolves `"silence"`. Once
speech is detected, the first of these ends the capture:

| cause   | when                                                                                    | `reason`             |
|---------|-----------------------------------------------------------------------------------------|----------------------|
| early   | `accept(interimAlts)` returned true for an interim result (`cap.early === true`)        | `"result"`           |
| idle    | no new recognizer event for `idleMs` (default 2600 ms) after speech began               | `"result"`, or `"timeout"` if nothing ever became words |
| final   | the recognizer finalised by itself                                                      | `"result"`           |
| user    | `mic.stop()` / the Stop button / Space                                                  | `"stopped"` (or `"silence"` if nothing was heard) |
| hard    | `maxMs` (default `timeoutMs + 6000`) elapsed                                            | `"result"`, or `"timeout"` with nothing heard |

Every stop calls `recognition.stop()` and waits up to 2.5 s (`GRACE_MS`) for the recognizer's
final result before settling with what it has. In practice the final lands 0.3–1 s after the stop,
so **the mic closes about 1.5–3 s after the player falls silent**: ~1.8 s for a level-1 word
(1300 ms idle + the final), ~2.8 s for a level-3 sentence, and well under a second after an early
accept. The browser's mic indicator goes off with the result; if it stays on, something outside
the capture layer holds a stream.

Why two mechanisms: Chrome's zh-CN endpointer can sit on a one-syllable word (心 xīn) for many
seconds and only finalise once the player says it again — the final then reads "心心". Early
accept stops the moment the interim already reads as the phrase; the idle stop is the backstop
for a word the recognizer heard but cannot snap to anything (a mispronunciation) and for slow
endpointing without interims. The idle values are per phrase level because a word is over in a
beat while a sentence may hold a breath between clauses; Chrome's own non-continuous endpointer
usually gives up sooner than 2.3 s anyway, so no sentence is cut that Chrome would have kept.

### What `cap.alts` contains

The recognizer's **final alternatives first** (up to 5; Chrome puts a confidence on the top one
and 0 on the rest), else its last interim. When early accept fired, the **accepted interim
snapshot** is appended with `early: true` unless the top final says the same thing. The snapshot
inherits the final's confidence when the final merely grew out of it (the player kept talking:
"心" → "心心", "gato" → "gatos"); when the final disagrees outright it keeps confidence 0. So
`bestMatch` can still pick the one clean 心 the capture stopped on, without ever bypassing the
confidence factor.

### Scoring (`lib/scoring.ts`, pure; the outcome is decided here before Gemini is called)

`bestMatch(alts, target, mode)` scores every alternative with `matchDetail` and multiplies by two
pieces of recognizer evidence:

- **`matchDetail` / `matchScore`**: the better of the plain `similarity` and the best sliding window
  of the target's token length (characters in `char` mode, words in `word` mode) over the heard
  tokens. Leftover tokens that are themselves repetitions of the target (each block ≥ 0.75) are
  free; other material costs ×0.9. `missedWords` looks only at the matched window.
- **rank factor** by position in the recognizer's list: 1 / 0.88 / 0.82 / 0.78 for the 1st / 2nd /
  3rd / 4th+ guess, so only the recognizer's top guess can be Perfecto. An early snapshot counts as rank 0.
- **confidence factor** `0.75 + 0.25 × confidence` when the recognizer gave one (finals, top guess);
  0 / unknown means no factor.

Returns `{ transcript, score, confidence, rank, matched }`; `transcript` is the whole alternative
(show it: "心心" is honest), `matched` the part that scored. Grades: Perfecto ≥ 0.90, Bien ≥ 0.75,
Más o menos ≥ 0.45, backfire below `BACKFIRE_BELOW = 0.45`. The engine then adds relic/focus
bonuses on top.

| target    | heard (rank, confidence)                 | match | ×rank | ×conf | score | grade        |
|-----------|------------------------------------------|-------|-------|-------|-------|--------------|
| 心        | 心 (early snapshot, no final yet)         | 1.00  | 1     | –     | 1.00  | 完美         |
| 心        | 心 (top final, 0.8)                       | 1.00  | 1     | 0.95  | 0.95  | 完美         |
| 心        | 心心 (top final, 0.9)                     | 1.00  | 1     | 0.975 | 0.975 | 完美         |
| 心        | 新 (homophone, top final, 0.8)            | 1.00  | 1     | 0.95  | 0.95  | 完美         |
| 心        | 心什么 (top final 0.8) + snapshot 心       | 1.00  | 1     | 0.95  | 0.95  | 完美 (snapshot wins over 0.9 × 0.95) |
| 心        | 信 xìn (wrong tone)                      | 0.33  | 1     | –     | 0.33  | 失败 (backfire) |
| 心        | 性 xìng                                  | 0.00  | 1     | –     | 0.00  | 失败 (backfire) |
| 下雨了    | 今天下雨了 (top final, 0.9)               | 0.90  | 1     | 0.975 | 0.88  | 很好         |
| hola      | hola hola (top final, 0.7)               | 1.00  | 1     | 0.925 | 0.925 | Perfecto     |
| gato      | gato (top final, 0.5)                    | 1.00  | 1     | 0.875 | 0.875 | Bien         |
| gato      | gato (top final, 0.6)                    | 1.00  | 1     | 0.90  | 0.90  | Perfecto     |
| gato      | cato / pato / **gato** (3rd guess)        | 1.00  | 0.82  | –     | 0.82  | Bien         |
| gato      | pato / **gato** (2nd guess)               | 1.00  | 0.88  | –     | 0.88  | Bien         |
| el gato   | un el gato negro (top final, 0.8)        | 0.90  | 1     | 0.95  | 0.855 | Bien         |
| fuego     | juego                                    | 0.47  | 1     | –     | 0.47  | Más o menos  |

What this means for the two reported bugs: a one-syllable Mandarin word said once ends the capture
on the interim and scores 1.0 (or 1.0 × confidence on the final); said twice it still scores as one
clean 心. A Spanish word read with English vowels can only reach Perfecto if the recognizer's *top*
guess is the target *and* its confidence is ≥ 0.6; as a second or later guess it cannot. That is all the client can know; the coaching line (§3) is asked to name the
anglicised vowel or tone contour, and never touches the score.

Other rules the capture layer relies on the UI for:

- **Silence is free.** `"silence"` and `"timeout"` mean nothing scoreable was heard. Do not call
  `castCard`, do not spend breath, do not add a grudge. Show one quiet line and let the player try
  again (or redraw).
- **Pick timers by the drawn phrase's `level`**, not the card's tier: cursed phrases are one level
  harder.
- **Show a Stop button while `listening`.** `mic.stop()` ends listening now and still delivers
  what was heard. Bind it to the same key as Cast (Space) so "press to cast, press again to finish"
  works.
- **Meter.** `mic.level` is 0..1 (RMS ×3, quantised to 0.02) about 30×/s while listening and 0
  otherwise.
- **`cap.ms`** is the time from start to the accepted interim (early) or to the final result and
  feeds the crit check (`ms < 2500`).
- Only one capture runs at a time; a second `start()` while listening returns the pending promise.
  Unmounting the screen stops the capture, releases the mic and drops the late result.
- Event trials (`DESIGN.md` §6) use the same hook: draw with `drawPhrase(run, { level }, lexicon)`,
  capture, then `resolveEvent(run, idx, best.score)`; on silence just let them try again. Without
  `idleMs`/`accept` they get the 2600 ms default idle stop and no early accept.
- `speak(text, L.speech)` from `lib/speech.ts` reads a phrase aloud (waits for voices to load and
  prefers a zh-CN voice for Mandarin). `speechSupported()` decides whether typing mode is forced.
- Typing mode scores with `similarityTyped` (unchanged: pinyin with or without tone numbers, or
  characters) and bypasses all of the above.

Checks: `npm run check` runs `lib/engine.check.ts` and `lib/scoring.check.ts` (repetition, homophones,
tones, rank and confidence factors, `mergeAlts` ordering, typed path, grade bands).

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
- Pass `cap.audio` straight through; `null` makes a transcript-only request. The clip runs until the
  capture settles, so it includes anything said after an early accept.
- The prompt asks the coach to call out English reading habits (Spanish: gliding or reduced vowels,
  English r, pronounced h; Mandarin: a flat or English-like tone contour) when it hears them. This
  is coaching only: the score in the request is already final.
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
