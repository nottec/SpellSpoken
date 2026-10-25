# SpellSpoken

A pronunciation roguelike for Spanish and Mandarin, built for HackTX 2026. Every card in your hand is a spell; every spell is a phrase in the language you're learning. Say it well and it lands hard. Mumble it and it backfires. Eight floors, one life, a branching map, and words you master stay mastered across runs.

**Tracks:** Most Entertaining (Jester's Court) · Best Use of Gemini API

## Run it

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY for audio coaching (optional)
npm run dev                  # http://localhost:3000  — use Chrome, allow the mic
npm run build                # must pass before any commit
npm run check                # 30 engine + 11 scoring assertions
npm run sim                  # 400-run balance simulation per accuracy level (≈ 12 s)
```

Without a key the game is fully playable; the coach gives template tips instead of listening to your audio. `http://localhost:3000/api/health` shows whether the key was picked up. `/dev/fx` is a gallery of every visual component.

## Gemini setup

The game never blocks on Gemini. When a call fails, the coach falls back to template text and the route says why (`why: "nokey" | "quota" | "cooldown" | "timeout" | "badmodel" | "empty" | "error"`), so a missing or exhausted key degrades quietly instead of breaking a run.

1. **Get a key** in [Google AI Studio](https://aistudio.google.com/apikey) and put it in `.env.local` as `GEMINI_API_KEY=…` (on Vercel: Project → Settings → Environment Variables). Never commit it.
2. **Know your tier.** A fresh key is on the **free tier**: in 2026 that is roughly 5–15 requests per minute and 100–250 per day, *per model*, and the limits belong to the key's **Google Cloud project**, not to the key (a second key in the same project shares the pool). To lift them, open that project in the Google Cloud console and link a **billing account**: the project moves to Tier 1 (hundreds of requests per minute, pay as you go, cents for a demo). A **Google AI Pro / Gemini Advanced** consumer subscription does **not** raise API quota; only billing on the Cloud project does.
3. **Check the key** with `GET /api/health` (status only, no request to Google) and `GET /api/health?ping=1`, which lists the model names your key can use (`ping.list.models`) and makes one tiny `generateContent` call, returning Google's raw status and message (`ping.generate`). A 429 there is quota; a 404 means the name in `GEMINI_MODEL` is retired, so pick one from the list. `lastError` holds the most recent failure the game itself hit, and `hint` says it in plain English.
4. **Request budget.** A cast costs one request (`/api/feedback`, skipped when the score is ≥ 97 %); lexicon growth (`/api/vocab`) is one request per floor, fired when the map comes up; Eco (`/api/mentor`) costs one per question. On a 429 the model enters a cooldown (from Google's `Retry-After` / "retry in Ns", default 30 s) and the routes answer `why: "cooldown"` without calling Google until it ends.

| variable | default | purpose |
|---|---|---|
| `GEMINI_API_KEY` | – | enables Gemini; without it everything is template text |
| `GEMINI_MODEL` | `gemini-3.8-flash,gemini-3.5-flash` | comma-separated fallback list for audio coaching and Eco |
| `GEMINI_MODEL_LITE` | `gemini-3.8-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash` | tried first for bulk vocabulary JSON, then the list above |
| `GEMINI_TIMEOUT_MS` | `12000` | per-attempt timeout; a slower model is skipped for the next one |

Thinking is off (`thinkingBudget: 0`) because thinking models spend the whole output budget on hidden reasoning and reply with nothing; if a model rejects that setting, the call is retried once without it.

## How it plays

- **Breath and cards.** Each turn you have 3 breath and a hand of 5 drawn from your deck (10 cards to start). Cost is breath; tier is how hard the phrase is to say. Most cards cost their tier, a few cheap tier-2s cost 1, a few heavy tier-1s cost 2, and some cost nothing. You can rarely afford the whole hand: pick, cast, end the turn, and the enemy acts once.
- **Spells are effects, words are drawn.** 40 cards (attack / shield / heal / drain / hex / empower, tiers 1–3). Selecting a card draws a fresh incantation from the lexicon at the card's tier and themes; one free redraw per turn. Say it (or type it): Web Speech transcribes, `lib/scoring.ts` scores 0–1, and the effect scales with `0.5 + score`. Below 45 % the cast backfires (`2 + 2 × tier` self-damage, the word becomes a grudge).
- **Statuses.** Each element has a signature: fire **burns** (damage every enemy turn), water **chills** (the enemy can't charge), wind **staggers** (it skips an action), shadow **weakens** it (−25 % damage) and drains, light **exposes** it (+50 % damage taken). Enemies can **armor** up; you can gain focus, strength, regen or be silenced.
- **Keywords and engines.** *Exhaust* (one use per battle: every tier-3, Inspiración, Pacto), *Retain* (stays in your hand), *Draw 1* (wind's tempo), *Detonate* (Explosión consumes every burn stack for +3 each), *Tailwind* (after Ráfaga the next card costs 1 less), and bonuses that read the enemy: Avivar +3 per burn stack, Témpano and Escarcha ×1.5 against a chilled foe, Filo de viento ×1.5 against a staggered one, Garra oscura drains everything against a weakened one, Letanía grows with every cast. Each element has a two- or three-card engine, and card rewards and the merchant lean toward the elements already in your deck.
- **Chains and reactions.** Casting the same element again gives +15 % per step (max +45 %). Switching elements can react: wind → fire is *wildfire* (burn doubled), fire → water is *steam* (+50 %), water → wind is *storm* (stagger), shadow → light is *eclipse* (guaranteed crit), light → shadow is *dusk* (drain everything). The cards tell you which hint applies before you cast.
- **Enemies telegraph.** 13 enemies (6 minions, 4 elites, 2 bosses, the final boss) with weaknesses, resistances, minimum tiers and intent patterns: attack, double strike, charge (×2 next hit), curse (your next phrase is one level harder), silence (no tier-3 next turn), heal, block (armor). A large intent badge shows the icon, the number and what you would actually lose after your shield and armor. Shield before the charged hit.
- **The map.** Eight floors. Floor 1 is a fight, floor 4 a boss, floor 8 the final boss; the others offer two or three doors: fight, elite, rest (heal / upgrade a card / remove a card), event, merchant. Enemies drop **ink**, scaled by how well you pronounced; the merchant sells cards, relics, removals and upgrades.
- **Events and trials.** Eight encounters, several with a **trial**: say a phrase at a required level and score to win the reward (purge your grudges, +1 max breath, a relic…) or take the consequence.
- **Relics.** 22, from +1 breath and +1 card per turn to burn stacks, thorns, chain bonuses, a cheaper resonance, breath refunds for 95 %+ casts, breath for every Exhaust, extra draw, a kept card and a first-card discount.
- **Resonance:** three consecutive casts at ≥ 80 % charge a guaranteed crit. **Grudges:** words under 70 % return at a 40 % draw rate until you beat them (spaced repetition as a mechanic). **Mastery:** 3 casts at ≥ 85 % average master a word for good (localStorage), +15 % power whenever it's drawn.
- **Languages:** Español or 中文 on the title screen. Each has its own lexicon (169 entries, 12 themes, 3 levels), mastery store, saved run and generated extras. Card, enemy, relic, event and element names are localized; **every Chinese string on screen carries pinyin**, including the battle log; Chinese is never italicized. Mandarin scoring compares pinyin syllables with tones (`pinyin-pro`, 不/一 sandhi): homophones count, a wrong tone costs half. Pinyin is shown under every phrase and typing mode accepts pinyin (`xia4 yu3 le`).
- **Speech that respects you.** Silence or a timeout is not a cast: no breath, no damage, try again. Listening ends by itself: the moment an interim result already matches the phrase (a clean 心 closes the mic in under a second), or about 1.3 s after you stop talking on a word (2.3 s on a sentence); **Stop** ends it early and still scores what you said. You see what it is hearing while you speak. Saying a word twice (心心) still counts as the word. Scoring is strict about evidence: only the recognizer's top guess with decent confidence can be Perfecto; a word it only half-recognised lands in Bien.
- **Impact.** Each element has its own strike (flames, ripples, slashes, void, radiance), reactions get a callout, crits shake the screen, and every hit has a synthesized sound (no assets; 🔊 toggle in the header, reduced-motion respected).
- **Eco, the mentor:** the pulsing orb, bottom right. Socratic guide with full game context (hand, breath, intent, your last cast); never hands over the answer.
- **The lexicon grows as you fight:** once per floor Gemini writes 15 new entries in a theme your deck uses; they're validated, saved locally and enter the draw pool. Grudge words and mastered words are never evicted.
- **Keyboard:** 1–9 select a card · Space cast / stop · E end turn · R redraw · H hear it. Runs are saved per language and resume from the title screen.

## Architecture

```
components/Game.tsx              orchestrator: run, language, lexicon, mastery, saved runs, vocab growth, Eco's context
components/screens/Battle.tsx    the battle: hand, incantation, cast flow, verdict, enemy panel (battle/* helpers, copy.ts)
components/screens/*.tsx         Title, MapScreen, RewardScreen, RestScreen, EventScreen (trials), MerchantScreen, End, DeckPicker
components/fx/*                  visual primitives: 13 SVG enemy sprites, spell cards with keyword tags, ruby pinyin, stage strikes/callouts/shake, intent badge, sound toggle, breath pips, HP bars, status badges, VU meter, doors, route strip
components/hooks/useSpeechCapture.ts  React hook over captureCast: listening, level meter, start/stop
components/Mentor.tsx            Eco's orb and chat
lib/engine.ts                    the whole game, pure: turns, breath, deck, keyword cards (cardCost / cardTags), statuses, reactions, element-weighted offers, map flow, rewards, rest, events, merchant
lib/map.ts                       seeded map generation (8 floors, door constraints)
lib/scoring.ts                   similarity, window-tolerant matchScore, bestMatch (alternative rank + confidence), grades — pure; lib/scoring.check.ts
lib/lexicon.ts                   base vocab + generated extras, word mastery (localStorage, per language)
lib/lang.ts                      per-language config, localized labels, localizeLine for the engine's log
lib/speech.ts                    captureCast(): early accept on a matching interim, idle stop after speech, live transcript, stop() that keeps what was heard, clip recording, level meter, TTS
lib/sfx.ts                       synthesized sound cues (WebAudio), mute toggle
lib/gemini.ts                    shared caller: two model lists, timeouts, retries, 429 cooldown, status for /api/health
lib/sim.ts · lib/engine.check.ts balance simulation (npm run sim) and engine assertions (npm run check)
app/api/feedback/route.ts        Gemini listens to the clip and gives ONE tip; language-aware template fallback
app/api/mentor/route.ts          Eco, the Socratic guide (keyless hints are language-aware too)
app/api/vocab/route.ts           generates and validates new lexicon entries for a theme (lite model first)
app/api/health/route.ts          Gemini status; ?ping=1 lists usable models and makes one test call
data/spells.ts · enemies.ts · relics.ts · events.ts   bilingual game data (40 cards, 13 enemies, 22 relics, 8 events)
data/vocab.ts · vocab.es.ts · vocab.zh.ts             lexicon types and 169 entries per language
docs/DESIGN.md                   the design contract and final engine API; docs/SPEECH_GEMINI.md the speech/Gemini guide
```

**Responsible AI note for the pitch:** the game outcome is decided by a deterministic scorer before Gemini is called. Gemini only coaches ("your 'rr' was a single tap, try rolling it") and writes vocabulary. It can never change your damage.

## Balance (`npm run sim`, 400 runs per accuracy level)

| avg pronunciation | win rate | avg floor | casts / run | distinct words |
|---|---|---|---|---|
| 95 % | 65 % | 7.8 | 54 | 42 |
| 85 % | 55 % | 7.7 | 57 | 43 |
| 75 % | 34 % | 7.0 | 60 | 40 |
| 65 % | 13 % | 6.1 | 55 | 33 |
| 50 % | 0 % | 3.8 | 27 | 19 |

The whole hand is affordable on only ~12 % of turns (it used to be almost every turn); the bot casts ~2.9 cards a turn and leaves ~2 in hand. It shields before big hits, heals when low, detonates burn when it is high and chases weaknesses; a human lands a little lower. Knobs, in order of leverage: enemy `hp`/`attack` in `data/enemies.ts`, `BALANCE.floorScale` in `lib/engine.ts`, card `power`/`cost` in `data/spells.ts` (Foco's cost 0 → 1 lowers casts per turn), prices and `START_HP` in `lib/engine.ts`. `npm run sim -- --hp 1.1 --atk 0.9 --p 0.9,0.7` tries a change without touching data.

## Before judging

1. Play one full run per language on the live URL with a real microphone (Chrome). If the room is loud, tick "type instead of speak" — typing mode is the same game.
2. Record the demo: a backfire → a perfect cast that reacts (steam or eclipse) on an exposed enemy → the Gemini coaching line → ask Eco "why did that fizzle?" → switch to 中文 and cast with the pinyin shown.
3. Devpost: write-up, tracks, video, repo, live link; disclose the AI tools used.
4. Pre-master a few words on the demo laptop so the title screen shows progress.

## Stretch (in payoff order)

1. **Third language pack**: a `LangConfig` in `lib/lang.ts`, a `data/vocab.xx.ts`, and names in the data files. Japanese would need a reading layer like Mandarin's.
2. **Daily seed**: `newRun(seedFromDate)` so everyone at the table plays the same dungeon.
3. **Enemy voice lines** via `speechSynthesis`, subtitled, so listening is trained too.
4. **Multiplayer duel**: both players cast the same phrase; the higher score deals the difference.
