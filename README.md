# Incantation

A pronunciation roguelike for Spanish and Mandarin. Every spell is a phrase in the language you're learning. Say it well and it hits hard; mumble it and it backfires. Eight rooms, one life, and spells you master stay mastered across runs.

**Tracks:** Most Entertaining (Jester's Court) · Best Use of Gemini API · Best Novice · Best Pitch

## Run it

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY for audio coaching (optional)
npm run dev                  # http://localhost:3000  — use Chrome, allow the mic
```

Without a key the game is fully playable; the coach gives template tips instead of listening to your audio.

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
lib/engine.ts             run state, drawPhrase(), cast(), intents, rewards  — pure, unit-testable
lib/scoring.ts            normalize + Levenshtein similarity, grade()        — pure
lib/lexicon.ts            base vocab + Gemini-generated extras, word mastery (localStorage)
lib/speech.ts             Web Speech recognition, MediaRecorder capture, TTS
lib/gemini.ts             shared caller: retries on 503, model fallback list
app/api/feedback/route.ts Gemini listens to the clip and gives ONE tip; template fallback
app/api/mentor/route.ts   Eco, the Socratic guide
app/api/vocab/route.ts    generates new lexicon entries for a theme
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
