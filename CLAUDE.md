# SpellSpoken (formerly Incantation) — project brief for Claude Code

A pronunciation roguelike for Spanish and Mandarin, built for HackTX 2026 (UT Austin, Oct 24–25, 2026).
Every card is a spell and every spell is a phrase in the target language. Say it well → it lands. Mumble → it backfires.
Eight floors, one life, a branching map, a deck, breath, statuses and element reactions (Slay-the-Spire shaped; expanded Oct 24–25).

## Hackathon facts (do not forget these)

- Hacking window: 11:30 am Oct 24 → **11:30 am Oct 25 CST**. All code must be written in that window. Submit by 11:00 to be safe.
- Submit on Devpost (hacktx26.devpost.com). Required: a demo video link, team present in person at judging. Team size 1–4.
- Tracks: **Most Entertaining (Jester's Court)**, **Best Use of Gemini API** (MLH), **Best Novice** (if all first-timers), **Best Pitch (A Bard's Tale)**, **Best .Tech Domain** (if registered via get.tech and pointed at Vercel).
- Do NOT claim the Cursor/Grok Bot prize unless both tools were actually used.
- General judging criteria: Technology, Design, Completion, Learning. Disclose AI tools used in "How we built it."
- Pitch line for the Gemini judges: *the recognizer hears the words, Gemini hears the accent: every clip is rated 0–100 against the target under a strict rubric, and the deterministic scorer folds that rating into the outcome (`judged`). Gemini also coaches, grows the lexicon and transcribes the short words Chrome drops. No key? The same rules run on the transcript alone.* Say it.

## Stack

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 3. Dependencies: `pinyin-pro`; dev: `tsx`.
Run: `npm install && npm run dev` (Chrome, allow mic). `npm run build` must pass before any commit; `npm run check` (30 engine + 13 scoring assertions) and `npm run sim` (balance) should too.
Deploy: Vercel project `spellspoken` (team `nottecs-projects`), live at **https://spellspoken.vercel.app**. `vercel deploy --prod --yes` from the repo root (CLI logged in as `nottec`; it uploads the sources and builds on Vercel, so a running `next dev` is fine). Pushes do **not** auto-deploy until the Vercel GitHub app is granted access to the private repo (Project → Settings → Git). Env vars `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MODEL_LITE` (comma-separated fallback lists), optional `GEMINI_TIMEOUT_MS`; key (sensitive), model list and timeout are set for Production and Preview (Oct 25). `vercel link` appends a `VERCEL_OIDC_TOKEN` line to `.env.local` and `.env*` to `.gitignore`: remove both.

## Layout

```
components/Game.tsx                 orchestrator: run, language, lexicon, mastery, saved runs (per language), vocab growth once per floor, Eco's context
components/screens/Battle.tsx       battle: hand, incantation, cast flow, verdict, enemy panel; helpers in screens/battle/*, copy in battle/copy.ts
components/screens/*.tsx            Title, MapScreen, RewardScreen, RestScreen, EventScreen (trials), MerchantScreen, End, DeckPicker, RunHeader
components/fx/*                     visual primitives (13 SVG enemy sprites, SpellCard with keyword tags, Ruby/withPinyin, StageFx strikes + callouts + shake, IntentBadge, SfxToggle, BreathPips, HpBar, StatusBadge, VuMeter, DoorCard, PathStrip…); README.md inside; gallery at /dev/fx
components/hooks/useSpeechCapture.ts  hook over captureCast (listening, level, start/stop)
components/Mentor.tsx               "Eco", the pulsing orb mentor (Socratic, never gives the answer)
components/Handbook.tsx             the symbols/rules overlay (HelpButton in headers, "?" key)
lib/engine.ts                       the whole game, pure: breath/deck turns, castCard/endTurn, keyword cards (Exhaust/Retain/Draw/Detonate/Tailwind via cardCost/cardTags), statuses, chain + reactions, element-weighted offers, map flow, rewards, rest, events, merchant; RUN_VERSION
lib/map.ts                          seeded 8-floor map generation
lib/scoring.ts                      pure scoring: similarity (Spanish words / Mandarin pinyin syllables with tone credit), repetition-tolerant matchScore, bestMatch with alternative-rank and confidence factors; lib/scoring.check.ts
lib/lexicon.ts · lib/lang.ts        lexicon + mastery per language; LangConfig and localized labels (localName, elementLabel, nodeLabel, intentName, localizeLine for the engine's log)
lib/speech.ts                       captureCast(): early accept on a matching interim, idle stop after speech, live transcript, stop() keeps what was heard, silence vs miss, level meter, TTS; TIMEOUT_BY_LEVEL / IDLE_BY_LEVEL / ACCEPT_AT
lib/transcribe.ts                   second ear: needsFallback(cap) → POST /api/transcribe → withFallback(cap, transcript); Gemini never sees the target
lib/sfx.ts                          synthesized WebAudio cues per element and event; mute toggle persisted in localStorage `incantation.sfx`
lib/gemini.ts                       caller: flash + lite model lists, thinkingBudget 0, timeouts, retries, per-model 429 cooldown, status
lib/sim.ts · lib/engine.check.ts    balance bot and assertions
app/api/{feedback,mentor,vocab,transcribe,health}/route.ts   coaching · Eco · lexicon growth · second ear (verbatim transcript of a clip Chrome ignored; never told the target) · diagnostics (?ping=1 lists usable models)
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
- Speech: silence/timeout is **not** a cast (no breath, no damage); Stop still scores; the mic is released on every exit path. Listening ends early when an interim result already matches the phrase (`ACCEPT_AT` 0.9) and `IDLE_BY_LEVEL` (1.3 / 1.8 / 2.3 s) after the player falls silent, so a one-syllable 心 never waits to be said twice; the live transcript is shown while listening. Scoring: `bestMatch` takes the best sliding window (心心 for 心 scores 1.0), multiplies by the alternative's rank (1 / 0.88 / 0.82 / 0.78) and by `0.75 + 0.25 × confidence` (Spanish; Mandarin `0.85 + 0.15 ×`) when Chrome gives one, so only the recognizer's top guess with decent confidence can be Perfecto. A lone Mandarin syllable with the right sound but a different-tone character (信 for 心) scores 0.8 (很好), never a backfire: the recognizer cannot hear a tone on an isolated syllable; on phrases a wrong tone costs 0.35 of a syllable (one of two → 0.74, no grudge). Event trials use the same policy. In `next dev` every capture is logged to the console as `[speech]` (alts, confidence, reason, score). Numerals: recognizers write spoken numbers as digits (diez → "10", 十 → "10"); `normalize` expands them per language (`esNumber`/`zhNumber`, 0–9999; "3:30" → tres y media, "1º" → primero, 2 before a measure word → 两). Chrome discards a lone syllable said once (塔: `speechstart`, then no words, or no speech event at all): the capture reports the meter `peak`, waits `NO_WORDS_IDLE_MS` (2 s) while speech is flagged but wordless, and when it still comes back empty with `peak ≥ 0.12` the clip goes to `/api/transcribe` (lib/transcribe.ts): Gemini transcribes it verbatim without the target, the scorer decides as usual (`via: "gemini"`, confidence 0.85); the Incantation tells the player a one-syllable word is heard best said twice, which scores as once. Accent judge (Oct 25, after testers found anglicized words counted as correct): every spoken cast and trial posts the clip to `/api/feedback` with `judge: true`; Gemini answers JSON `{rating, tip}` under a strict rubric (English vowels/r/h or flattened tones cap at 50–55); `judged(score, rating)` = score × (0.35 + 0.65 × rating/100), so 85 keeps Perfecto, 45 is a grudge, under 16 backfires; `rating: null` (no key, 9 s timeout) leaves the transcript score. The cast waits for the judge; the verdict shows "accent N/100"; dev console logs `[judge]`. Mandarin: a judge that knows the target echoes its tones back, so a blind second call (concurrent, `BLIND_PINYIN_PROMPT`) transcribes the pinyin tones without the target and `toneCap` caps the rating at 60 (one tone off) or 45 (more). Verified with Windows-voice clips on the live site: English-style "gato" 50, "el gato negro" 35, "hola" 55; a toneless "ta" for 塔 is capped at 60 (0.74, 马马虎虎).
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
- The incantation is the hero of the battle screen: upright (card names are italic, so the two never read alike), under a "say this to cast" tag with a mic glyph and a muted "casting <card>" line; the hotkey strip and the title's how-to paragraphs moved into the Handbook after testers called the screens cluttered. Motion lives over the enemy panel: element strikes, callouts (STEAM!, ×2), damage numbers, knockback and a short shake on crits (StageFx), each with a synthesized cue (lib/sfx.ts; 🔊 toggle, `prefers-reduced-motion` respected). Nothing covers the phrase for more than ~600 ms. The enemy's next move is a large IntentBadge: icon, number, "you'd lose N" after shield and armor.
- Every Chinese string on screen carries pinyin (`Ruby` / `withPinyin`), including the engine's English log lines after `localizeLine`.
- The sky (components/Sky.tsx, rendered by Game.tsx behind every screen; `dim` at 55 % peak during a run): the lexicon's own words drift up the side bands (seeded PRNG, so SSR and client agree) with ember sparks. Title screen (components/screens/Title.tsx): a gradient wordmark with a breathing glow (84 vw wide at most: anything wider or scaled past the viewport widens the mobile layout viewport), a fan of five real cards (click = begin the run; outer two hidden below `sm`), a wolf and a dragon flanking it on `lg`, stat pills from the data files; every animation has a `prefers-reduced-motion` fallback in the title block of globals.css.
- Tooltips and the Handbook: every resource (ink, breath, life, floor, turn, shield, statuses, relics, doors) carries a `title` tooltip with a visible label where it was bare ("30 ink"); `components/Handbook.tsx` is the overlay that explains symbols, grades, elements and reactions, card anatomy and keywords, statuses, intents, map shapes and doors, keys. It reads from the same tables as the game (STATUS_META, DOOR_META.hint, INTENT_ICON, REACTION_TEXT, engine constants) so it cannot drift. Opened by `HelpButton` (fx; raises the `incantation:handbook` window event, no prop plumbing) in every header and on the title, or the `?` key; Esc closes.
- The battle fits one screen (testers refused to scroll): five cards in one row from `md` (`grid-cols-5` in Hand.tsx), a tight enemy panel (112/132 px sprites), the "casting X · say this to cast" row above an upright text-4xl/5xl phrase, a two-line log, the first-turn hint as a fixed toast, `main` py-4, and `.battle-fit` zoom steps (.92 / .84 / .76 under 880 / 790 / 700 px of viewport height) in globals.css. Measured: scrollHeight equals innerHeight at 1440×820, 1366×700, 1536×790 and 1280×1000.
- Eco flies: Mentor.tsx wraps the orb in `.eco-flyer` (fixed, wanders the lower right on a 34 s path, paused while the chat is open, still under reduced motion, `--w: .35` on phones) and darts (`.eco-dart`) when a tip lands. The coaching line is spoken in `.eco-bubble` next to the orb (✕, Esc, or 11 s), fed by Game.tsx as `tip={ text, key }` from `lastCast.tip`; the Verdict keeps only "Eco has a tip · accent N/100" plus the mode tag.
- Leaving a run: `MenuButton` (Menu: back to the title, the run stays saved so Continue appears) and `ResetButton` (Reset: window.confirm, then the save is removed; mastery stays) sit in every header next to 🔊 and ?, raising `incantation:menu` / `incantation:reset` for Game.tsx (`toMenu`, `reset`); the title shows "abandon the saved run" under the buttons when a save exists. Eco comes home (`.eco-still`: no transform) while its chat is open, so the panel's input is never covered; ✕ and Esc close it. The VU meter renders only while listening so the Cast · Hear it · Redraw row is centred.
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
