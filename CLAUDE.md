# Incantation — project brief for Claude Code

A pronunciation roguelike for Spanish and Mandarin, built for HackTX 2026 (UT Austin, Oct 24–25, 2026).
Every card is a spell and every spell is a phrase in the target language. Say it well → it lands. Mumble → it backfires.
Eight floors, one life, a branching map, a deck, breath, statuses and element reactions (Slay-the-Spire shaped; expanded Oct 24–25).

## Hackathon facts (do not forget these)

- Hacking window: 11:30 am Oct 24 → **11:30 am Oct 25 CST**. All code must be written in that window. Submit by 11:00 to be safe.
- Submit on Devpost (hacktx26.devpost.com). Required: a demo video link, team present in person at judging. Team size 1–4.
- Tracks: **Most Entertaining (Jester's Court)**, **Best Use of Gemini API** (MLH), **Best Novice** (if all first-timers), **Best Pitch (A Bard's Tale)**, **Best .Tech Domain** (if registered via get.tech and pointed at Vercel).
- Do NOT claim the Cursor/Grok Bot prize unless both tools were actually used.
- General judging criteria: Technology, Design, Completion, Learning. Disclose AI tools used in "How we built it."
- Pitch line for the Gemini judges: *the scorer decides the outcome deterministically before Gemini is called; Gemini only coaches and generates vocabulary. It can never change damage.* Say it.

## Stack

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 3. Dependencies: `pinyin-pro`; dev: `tsx`.
Run: `npm install && npm run dev` (Chrome, allow mic). `npm run build` must pass before any commit; `npm run check` (30 engine + 11 scoring assertions) and `npm run sim` (balance) should too.
Deploy: Vercel project `spellspoken` (team `nottecs-projects`), live at **https://spellspoken.vercel.app**. `vercel deploy --prod --yes` from the repo root (CLI logged in as `nottec`; it uploads the sources and builds on Vercel, so a running `next dev` is fine). Pushes do **not** auto-deploy until the Vercel GitHub app is granted access to the private repo (Project → Settings → Git). Env vars `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MODEL_LITE` (comma-separated fallback lists), optional `GEMINI_TIMEOUT_MS`; key (sensitive), model list and timeout are set for Production and Preview (Oct 25). `vercel link` appends a `VERCEL_OIDC_TOKEN` line to `.env.local` and `.env*` to `.gitignore`: remove both.

## Layout

```
components/Game.tsx                 orchestrator: run, language, lexicon, mastery, saved runs (per language), vocab growth once per floor, Eco's context
components/screens/Battle.tsx       battle: hand, incantation, cast flow, verdict, enemy panel; helpers in screens/battle/*, copy in battle/copy.ts
components/screens/*.tsx            Title, MapScreen, RewardScreen, RestScreen, EventScreen (trials), MerchantScreen, End, DeckPicker, RunHeader
components/fx/*                     visual primitives (13 SVG enemy sprites, SpellCard with keyword tags, Ruby/withPinyin, StageFx strikes + callouts + shake, IntentBadge, SfxToggle, BreathPips, HpBar, StatusBadge, VuMeter, DoorCard, PathStrip…); README.md inside; gallery at /dev/fx
components/hooks/useSpeechCapture.ts  hook over captureCast (listening, level, start/stop)
components/Mentor.tsx               "Eco", the pulsing orb mentor (Socratic, never gives the answer)
lib/engine.ts                       the whole game, pure: breath/deck turns, castCard/endTurn, keyword cards (Exhaust/Retain/Draw/Detonate/Tailwind via cardCost/cardTags), statuses, chain + reactions, element-weighted offers, map flow, rewards, rest, events, merchant; RUN_VERSION
lib/map.ts                          seeded 8-floor map generation
lib/scoring.ts                      pure scoring: similarity (Spanish words / Mandarin pinyin syllables with tone credit), repetition-tolerant matchScore, bestMatch with alternative-rank and confidence factors; lib/scoring.check.ts
lib/lexicon.ts · lib/lang.ts        lexicon + mastery per language; LangConfig and localized labels (localName, elementLabel, nodeLabel, intentName, localizeLine for the engine's log)
lib/speech.ts                       captureCast(): early accept on a matching interim, idle stop after speech, live transcript, stop() keeps what was heard, silence vs miss, level meter, TTS; TIMEOUT_BY_LEVEL / IDLE_BY_LEVEL / ACCEPT_AT
lib/sfx.ts                          synthesized WebAudio cues per element and event; mute toggle persisted in localStorage `incantation.sfx`
lib/gemini.ts                       caller: flash + lite model lists, thinkingBudget 0, timeouts, retries, per-model 429 cooldown, status
lib/sim.ts · lib/engine.check.ts    balance bot and assertions
app/api/{feedback,mentor,vocab,health}/route.ts   coaching · Eco · lexicon growth · diagnostics (?ping=1 lists usable models)
data/spells.ts (40 cards) · enemies.ts (13) · relics.ts (22) · events.ts (8) · vocab.es.ts / vocab.zh.ts (169 each)   all bilingual
docs/DESIGN.md (design contract + final engine API + balance) · docs/SPEECH_GEMINI.md (speech/Gemini guide for the UI)
```

## Core rules (keep these invariant unless asked)

- Score 0–1 from `lib/scoring.ts`. Backfire below 0.45 (`BACKFIRE_BELOW`): `2 + 2 × tier` self-damage, breath still spent, grudge. Grudge if < 0.70.
- Turn: 3 breath (`BASE_BREATH`), hand of 5 (`HAND_SIZE`), 10-card starter deck. Cost is breath and is decoupled from tier (tier = phrase difficulty): most cards cost their tier, some tier-1s cost 2, some tier-2s cost 1; Susurro/Foco/Pacto/Señal/Inspiración cost 0. Always read cost through `cardCost(run, card)` (Tailwind/Veleta discounts). `endTurn` discards unplayed cards except Retain; auto end-turn only when `!canAct(run)` (a 0-cost card keeps the turn open).
- Keywords (`cardTags`, all spelled out by `cardDesc`): Exhaust (gone for the battle, back after it, spent even on a backfire), Retain, Draw N (before the card is discarded), Detonate (consume every burn stack for +3 each), per-stack and vs-status bonuses (`previewCast().bonusText`), Tailwind (next costed card −1 this turn), sacrifice (`castBlocker` → "not enough life"). Offers lean 60 % toward elements already in the deck (`ELEMENT_OFFER_BIAS`), never all of them. `RUN_VERSION = 2`: Game.tsx drops older saves.
- Effect = power × (0.5 + score) × weak ×2 / resist ×½ / underTier ×½ × mastered ×1.15 × crit ×1.5 × chain (+15 %/step, max +45 %) × reaction × exposed ×1.5; strength adds flat power.
- Statuses: enemy burn / chill / stagger / weak / exposed / armor; player focus / silence / strength / regen / armor. Reactions: wind→fire wildfire, fire→water steam, water→wind storm, shadow→light eclipse, light→shadow dusk.
- Resonance: 3 consecutive casts ≥ 0.80 → guaranteed crit (Diapasón: 2). Shields halve each enemy phase. Mastery: 3 casts at ≥ 0.85 avg, per language in localStorage.
- Map: floor 0 fight, floor 3 boss, floor 7 final; floors 1,2,4,5,6 offer 2–3 doors (fight/elite/rest/event/merchant). Ink = enemy.ink × (0.75 + 0.5 × avg score).
- `castCard` throws when a card is not castable — gate with `castBlocker`/`canAct`. Shop/event refusals return the same run reference. Events finish in stage "done" and the UI calls `advance`.
- Phrase drawing (`drawPhrase`): level = tier (+1 if cursed) or `{ level }` for trials; themes; skip last 5; 40 % grudge redraw. The battle caches one phrase per card per turn; one free redraw per turn (+relic).
- Speech: silence/timeout is **not** a cast (no breath, no damage); Stop still scores; the mic is released on every exit path. Listening ends early when an interim result already matches the phrase (`ACCEPT_AT` 0.9) and `IDLE_BY_LEVEL` (1.3 / 1.8 / 2.3 s) after the player falls silent, so a one-syllable 心 never waits to be said twice; the live transcript is shown while listening. Scoring: `bestMatch` takes the best sliding window (心心 for 心 scores 1.0), multiplies by the alternative's rank (1 / 0.88 / 0.82 / 0.78) and by `0.75 + 0.25 × confidence` (Spanish; Mandarin `0.85 + 0.15 ×`) when Chrome gives one, so only the recognizer's top guess with decent confidence can be Perfecto. A lone Mandarin syllable with the right sound but a different-tone character (信 for 心) scores 0.8 (很好), never a backfire: the recognizer cannot hear a tone on an isolated syllable; on phrases a wrong tone costs 0.35 of a syllable (one of two → 0.74, no grudge). Event trials use the same policy. In `next dev` every capture is logged to the console as `[speech]` (alts, confidence, reason, score).
- Eco's context (`mentorCtx` in Game.tsx) carries the selected card and its drawn incantation (`BattleSelection` via Battle's `onSelection`) plus each hand card's current phrase, so "this word" means the one on screen, with or without a key.
- Gemini: feedback once per cast (skipped ≥ 0.97), vocab once per floor, mentor on demand. All failures fall back to template text with a `why`; the game never blocks on Gemini.
- UI copy is English; in-world names (cards, enemies, relics, events, elements, grades) are in the target language via `cardName`/`localName`/… Never italicize Chinese (`LANGS[lang].italic`).

## Gemini gotchas we already hit

- `gemini-2.0-flash` is retired → 404. Defaults: `GEMINI_MODEL=gemini-3.8-flash,gemini-3.5-flash`, `GEMINI_MODEL_LITE=gemini-3.8-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash`. `/api/health?ping=1` lists what the key can actually use.
- Free tier in 2026 ≈ 5–15 req/min and 100–250/day per model, per Google Cloud **project**. A consumer Google AI Pro subscription does not raise it; linking billing to the project (Tier 1) does. This was the cause of "Gemini doesn't work".
- 503 "high demand" is common; retries + fallback list handle it. 429 starts a per-model cooldown (Retry-After or 30 s) so we stop hammering.
- Thinking models burned `maxOutputTokens` on reasoning → empty reply. `thinkingBudget: 0` is set in `lib/gemini.ts`; a 400 about thinking retries once without it. Keep it.
- Vercel hobby functions default to 10 s; routes export `maxDuration = 60`.

## Balance reference (`npm run sim`, 400 runs per p)

95 % pronunciation ≈ 65 % win, 85 % ≈ 55 %, 75 % ≈ 34 %, 65 % ≈ 13 %, 50 % ≈ 0 %. ~55 casts and ~40 distinct words per run; the whole hand is affordable on only ~12 % of turns, ~2.9 casts per turn, ~2 cards left unplayed.
Knobs: enemy `hp`/`attack` (data/enemies.ts), `BALANCE.floorScale`, card `power`/`cost`, prices, `START_HP` (lib/engine.ts); Foco's cost (0 → 1) lowers casts per turn. If the live demo feels too hard, lower enemy `attack` ~10 % and re-run the sim.

## Style

- Dark "candlelit grimoire" palette (tailwind.config.ts: ink/dusk/vellum/ember/moss/blood + element colors). Fraunces for display, Manrope for UI, Noto Serif SC for CJK. No italics on Chinese text.
- The incantation is the hero of the battle screen. Motion lives over the enemy panel: element strikes, callouts (STEAM!, ×2), damage numbers, knockback and a short shake on crits (StageFx), each with a synthesized cue (lib/sfx.ts; 🔊 toggle, `prefers-reduced-motion` respected). Nothing covers the phrase for more than ~600 ms. The enemy's next move is a large IntentBadge: icon, number, "you'd lose N" after shield and armor.
- Every Chinese string on screen carries pinyin (`Ruby` / `withPinyin`), including the engine's English log lines after `localizeLine`.
- Copy is plain and in-world (Eco speaks like a spirit, never like a chatbot).

## Still to do before judging (priority order)

1. Key done (Oct 25): it is in `.env.local` and on Vercel; https://spellspoken.vercel.app/api/health?ping=1 answered `configured: true` with a real request via gemini-3.8-flash. Still to do: test the live URL with a real mic in both languages, one full run each. Watch: 心 said once should close the mic within ~1 s and score 完美; said twice still 完美; a Spanish word read with English vowels should land in Bien or lower (if not, lower `confidenceFactor` in lib/scoring.ts); a sentence must never be cut at a pause (else raise `IDLE_BY_LEVEL[3]` in lib/speech.ts).
2. Record the demo video: backfire → perfect reacting cast on an exposed enemy → Gemini coaching line → ask Eco "why did that fizzle?" → switch to 中文, cast with pinyin shown.
3. Devpost write-up + tracks + video + repo + live link. Disclose AI tools.
4. Pre-master a few words on the demo laptop so the title shows progress.
5. Optional: register .tech domain; daily-seed mode; enemy voice lines via speechSynthesis.

## Working agreements

- Run `npm run build` (and `npm run check`) before committing. Commit small and often.
- Keep `lib/engine.ts`, `lib/map.ts`, `lib/scoring.ts` and `data/*` pure (no DOM, no fetch) so the sim and checks keep working.
- `NEXT_PUBLIC_DEV_HOOK=1 npm run build` exposes `window.__incantation` (engine + setRun) in a production build for scripted QA; never set it on Vercel.
- `C:\Users\alexw` is an accidental empty git repo; this project's repo is the folder itself. For parallel agents use manual `git worktree add` (the harness's worktree isolation fails here), and make sure no `next dev` worker is alive before a production build (it corrupts `.next`).
- While a `next dev` runs in the main folder (someone testing), never `next build` there: `git checkout --detach master` in a worktree (e.g. `../wt-fx2`), build and QA from it, and kill the `next start` you launched afterwards.
- Never put the API key anywhere but `.env.local` / Vercel env vars.
