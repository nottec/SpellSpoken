# Incantation

A pronunciation roguelike for Spanish and Mandarin. Every spell is a phrase in the language you're learning. Say it well and it hits hard; mumble it and it backfires. Eight rooms, one life, and spells you master stay mastered across runs.

**Tracks:** Most Entertaining (Jester's Court) · Best Use of Gemini API · Best Novice · Best Pitch

## Run it

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY for audio coaching (optional)
npm run dev                  # http://localhost:3000  — use Chrome, allow the mic
```

Without a key the game is fully playable; the coach gives template tips instead of listening to your audio. `http://localhost:3000/api/health` shows whether the key was picked up.

## Gemini setup

The game never blocks on Gemini. When a call fails, the coach falls back to template text and the route says why (`why: "nokey" | "quota" | "cooldown" | "timeout" | "badmodel" | "empty" | "error"`), so a missing or exhausted key degrades quietly instead of breaking a run.

1. **Get a key** in [Google AI Studio](https://aistudio.google.com/apikey) and put it in `.env.local` as `GEMINI_API_KEY=…` (on Vercel: Project → Settings → Environment Variables). Never commit it.
2. **Know your tier.** A fresh key is on the **free tier**: in 2026 that is roughly 5–15 requests per minute and 100–250 per day, *per model*, and the limits belong to the key's **Google Cloud project**, not to the key (a second key in the same project shares the pool). To lift them, open that project in the Google Cloud console and link a **billing account**: the project moves to Tier 1 (hundreds of requests per minute, pay as you go, cents for a demo). A **Google AI Pro / Gemini Advanced** consumer subscription does **not** raise API quota; only billing on the Cloud project does.
3. **Check the key** with `GET /api/health` (status only, no request to Google) and `GET /api/health?ping=1`, which lists the model names your key can use (`ping.list.models`) and makes one tiny `generateContent` call, returning Google's raw status and message (`ping.generate`). A 429 there is quota; a 404 means the name in `GEMINI_MODEL` is retired, so pick one from the list. `lastError` holds the most recent failure the game itself hit, and `hint` says it in plain English.
4. **Request budget.** A cast costs one request (`/api/feedback`, skipped when the score is ≥ 97 %); lexicon growth (`/api/vocab`) is budgeted at one request per floor; Eco (`/api/mentor`) costs one per question. The current battle screen still grows the lexicon after each cast, throttled to one request per 8 s, so a fast player on the free tier can hit the per-minute limit. When that happens the model enters a cooldown (from Google's `Retry-After` / "retry in Ns", default 30 s) and the routes answer `why: "cooldown"` without calling Google until it ends.

| variable | default | purpose |
|---|---|---|
| `GEMINI_API_KEY` | – | enables Gemini; without it everything is template text |
| `GEMINI_MODEL` | `gemini-3.8-flash,gemini-3.5-flash` | comma-separated fallback list for audio coaching and Eco |
| `GEMINI_MODEL_LITE` | `gemini-3.8-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash` | tried first for bulk vocabulary JSON, then the list above |
| `GEMINI_TIMEOUT_MS` | `12000` | per-attempt timeout; a slower model is skipped for the next one |

Thinking is off (`thinkingBudget: 0`) because thinking models spend the whole output budget on hidden reasoning and reply with nothing; if a model rejects that setting, the call is retried once without it.

## How it plays

- **Spells are effects, words are drawn.** 19 spells (attack / shield / heal / drain, tiers 1–3). Each cast draws a fresh incantation from the lexicon (`data/vocab.ts`, ~150 entries across 12 themes, 3 levels) matched to the spell's tier and themes. Redraw is free.
- **Languages:** Español or 中文, picked on the title screen (`lib/lang.ts`). Each has its own lexicon, mastery store and generated extras. Spell and enemy names are localized.
- **Cast:** pick a spell, press space, say the words. Web Speech API transcribes; `lib/scoring.ts` scores similarity 0–1.
  - Spanish: word/character similarity, strict on single words.
  - Mandarin: the transcript and target are converted to pinyin syllables with tones (`pinyin-pro`, handles 不/一 sandhi). Homophones count as correct; a right syllable with the wrong tone costs half. Pinyin is shown under every incantation, and typing mode accepts pinyin (`xia4 yu3 le`) so no IME is needed.
- **Damage** = power × (0.5 + score) × weakness ×2 / resist ×½ / under-tier ×½ × word-mastery ×1.15 × crit ×1.5. Shields and heals scale the same way.
- **Backfire** below 45%: 6 self-damage and the word becomes a grudge.
- **Enemy intents:** every enemy telegraphs its next move: attack, charge (next hit ×2), curse (your next incantation is one level harder), heal. Shield before a charged hit.
- **Resonance:** three consecutive casts at ≥80% charge a guaranteed crit.
- **Grudges:** words scored under 70% return later in the run at a 40% draw rate until you beat them. Spaced repetition as a mechanic.
- **Word mastery:** 3 casts at ≥85% average → mastered across runs (localStorage), +15% power whenever drawn.
- **The lexicon grows as you fight:** after every cast, Gemini writes 15 new entries in one of that spell's themes (at most one request per 8 s). They're saved locally and enter the draw pool immediately. The store is capped at 400 extras; oldest entries rotate out first, but grudge words and mastered words are never dropped.
- **Eco, the mentor:** pulsing orb, bottom right. Socratic guide with full game context; never hands over the answer.
- **Typing mode:** checkbox in the spellbook for loud rooms or non-Chrome browsers.

## Architecture

```
components/Game.tsx       all screens (title, battle, reward, end)
components/hooks/useSpeechCapture.ts  React hook over captureCast: listening, level meter, start/stop
lib/engine.ts             run state, drawPhrase(), cast(), intents, rewards  — pure, unit-testable
lib/scoring.ts            normalize + Levenshtein similarity, grade()        — pure
lib/lexicon.ts            base vocab + Gemini-generated extras, word mastery (localStorage)
lib/speech.ts             captureCast(): Web Speech recognition that tells silence from a miss, stop() that keeps what was heard, clip recording, level meter, TTS
lib/gemini.ts             shared caller: two model lists, per-attempt timeout, retries, 429 cooldown, status for /api/health
app/api/feedback/route.ts Gemini listens to the clip and gives ONE tip; language-aware template fallback; skipped at ≥ 97 %
app/api/mentor/route.ts   Eco, the Socratic guide (keyless hints are language-aware too)
app/api/vocab/route.ts    generates and validates new lexicon entries for a theme (lite model first)
app/api/health/route.ts   Gemini status; ?ping=1 lists usable models and makes one test call
docs/SPEECH_GEMINI.md     how the UI uses the capture hook and the routes
data/vocab.ts             shared types; vocab.es.ts and vocab.zh.ts hold ~150 entries each, 12 themes, 3 levels
lib/lang.ts               per-language config: speech code, tokenizer, coaching hints, labels
data/spells.ts            19 spell effects with themes they draw from
data/enemies.ts           8 enemies with weaknesses, min tier, intent patterns
data/relics.ts            6 relics
```

**Responsible AI note for the pitch:** the game outcome is decided by a deterministic scorer before Gemini is called. Gemini only coaches ("your 'rr' was a single tap, try rolling it"). It can never change your damage.

## Balance (simulated, greedy bot that never heals)

| avg pronunciation | win rate | avg room | distinct words/run |
|---|---|---|---|
| 95% | ~68% | 7.7 | 20 |
| 80% | ~40% | 6.6 | 19 |
| 65% | ~27% | 6.0 | 20 |
| 50% | 0% | 3.4 | 12 |

(bot shields before charged hits and heals when low; a careless player does worse)

Tune in `lib/engine.ts` (`base` damage array, `scale` per room) and `data/enemies.ts`.

## Before judging

1. Test the mic in the actual demo room. If recognition struggles with noise, switch the demo to typing mode and show voice in the video.
2. Record a 60-second clip: one bad cast that backfires, one perfect cast that crits a weak enemy, one Gemini coaching tip.
3. Pre-master two spells on the demo laptop so the ★ shows on the title screen.

## Stretch (in payoff order)

1. **Third language pack**: add a `LangConfig` in `lib/lang.ts`, a `data/vocab.xx.ts`, and names in `spells.ts`/`enemies.ts`. Japanese would need a reading layer like Mandarin's.
2. **Daily seed**: `newRun(seedFromDate)` so everyone at the table plays the same dungeon and compares scores.
3. **Enemy voice lines** via `speechSynthesis` in Spanish, subtitled, so listening is trained too.
4. **Multiplayer duel**: both players cast the same phrase; higher score deals the difference.
