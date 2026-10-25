/**
 * Pure copy builders for the battle screen: effect sentences from CastResult / TurnResult,
 * card hints from previewCast, the enemy intent line, and the coach status table from
 * docs/SPEECH_GEMINI.md §2. UI language is English; in-world names arrive localized.
 */
import { STATUS_LABEL, STACK_STATUSES, isDamageKind, type Element, type Spell, type StatusId } from "@/data/spells";
import { INTENT_TEXT, type Intent } from "@/data/enemies";
import { cardName, castBlocker, previewCast, hasStatus, nextIntent, intentDamage, type Run, type Card, type CastResult, type TurnResult, type Enemy } from "@/lib/engine";
import type { LangConfig, LangId } from "@/lib/lang";
import type { Vocab } from "@/data/vocab";

/** Tailwind text colour per element (literal strings so the classes survive purging). */
export const EL_TEXT: Record<Element, string> = { fire: "text-fire", water: "text-water", wind: "text-wind", shadow: "text-shadow", light: "text-light" };

const turnsText = (n: number) => `${n} turn${n === 1 ? "" : "s"}`;

function fmtStatus(a: { status: StatusId; stacks: number; turns: number; target: "enemy" | "self" }): string {
  const label = STATUS_LABEL[a.status];
  const who = a.target === "self" ? " on you" : "";
  if (a.status === "focus") return `Focus${who}`;
  if (STACK_STATUSES.has(a.status)) {
    const dur = a.turns < 99 && (a.status === "burn" || a.status === "regen") ? ` for ${turnsText(a.turns)}` : "";
    return `${label} ${a.stacks}${dur}${who}`;
  }
  return a.turns >= 99 ? `${label}${who}` : `${label} ${turnsText(a.turns)}${who}`;
}

/** "Chispa+ lands for 14, critical, twice as hard — steam. Burn 3." */
export function castSentence(r: CastResult, card: Card, spell: Spell, lang: LangId): string {
  const name = cardName(card, lang);
  if (r.backfire) return `${name} fizzles and burns you for ${r.selfDamage}.${r.exhausted ? " It is spent for this battle." : ""}`;
  const crit = r.crit ? (r.resonant ? ", resonant" : ", critical") : "";
  const chain = r.chain >= 2 ? `, chain ×${r.chain}` : "";
  let main: string;
  if (isDamageKind(spell.kind)) {
    main = `lands for ${r.damage}`;
    if (r.consumed) main += `, detonating ${r.consumed.stacks} ${STATUS_LABEL[r.consumed.status].toLowerCase()}`;
    else if (r.bonusPower) main += ` (+${r.bonusPower} power)`;
    if (r.echoDamage) main += ` and echoes for ${r.echoDamage}`;
    if (r.armorAbsorbed) main += ` (${r.armorAbsorbed} absorbed by armor)`;
    main += crit;
    if (r.weak) main += ", twice as hard";
    if (r.resist) main += ", half resisted";
    if (r.underTier) main += ", too small for this foe";
    if (r.exposed) main += ", through its guard";
    main += chain;
  } else if (spell.kind === "shield") main = `raises ${r.shielded} shield${r.healed ? ` and mends ${r.healed}` : ""}${crit}${chain}`;
  else if (spell.kind === "heal") main = `mends ${r.healed}${crit}${chain}`;
  else if (spell.kind === "empower" && r.gained.breath) main = `gives ${r.gained.breath} breath`;
  else main = "takes hold";
  if (r.reaction) main += ` — ${r.reaction}`;
  const parts = [`${name} ${main}.`];
  if (isDamageKind(spell.kind) && r.healed) parts.push(`You drain ${r.healed}.`);
  if (r.applied.length) parts.push(`${r.applied.map(fmtStatus).join(", ")}.`);
  if (r.gained.breath && spell.kind !== "empower") parts.push(`+${r.gained.breath} breath.`);
  if (r.sacrificed) parts.push(`You pay ${r.sacrificed} life.`);
  if (r.drawn) parts.push(`Draw ${r.drawn}.`);
  if (spell.cost > 0 && r.costPaid < spell.cost) parts.push(`Tailwind: ${r.costPaid} breath.`);
  if (r.exhausted) parts.push("It is spent for this battle.");
  if (r.killed) parts.push("It falls.");
  return parts.join(" ");
}

const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The enemy phase in one or two sentences. `before` is the enemy as it was when the turn ended. */
export function enemyTurnSentence(t: TurnResult, before: Enemy): string {
  const parts: string[] = [];
  const burnKill = t.killed && t.hits === 0 && !t.thorns && t.burnDamage > 0;
  if (t.burnDamage) parts.push(burnKill ? `It burns for ${t.burnDamage} and falls.` : `It burns for ${t.burnDamage}.`);
  if (burnKill) return parts.join(" ");
  if (t.staggered) parts.push("It staggers and does nothing.");
  else {
    switch (t.intent) {
      case "attack":
      case "double": {
        const raw = intentDamage(before);
        const open = t.intent === "double" ? `It strikes twice for ${raw / 2} each` : `It strikes for ${raw}`;
        const taken: string[] = [];
        const relicBlock = Math.max(0, raw - t.blocked - t.armorAbsorbed - t.enemyHit);
        if (relicBlock) taken.push(`your relic turns ${relicBlock}`);
        if (t.armorAbsorbed) taken.push(`your armor takes ${t.armorAbsorbed}`);
        if (t.blocked) taken.push(`your shield takes ${t.blocked}`);
        taken.push(t.enemyHit ? `you lose ${t.enemyHit}` : "nothing gets through");
        parts.push(`${open}; ${joinAnd(taken)}.`);
        break;
      }
      case "charge": parts.push(hasStatus(before.statuses, "chill") ? "It tries to gather power, but the chill holds it." : "It gathers power — its next hit is doubled."); break;
      case "curse": parts.push("It curses your next words: one level harder."); break;
      case "silence": parts.push("It silences you: no tier-3 spells next turn."); break;
      case "heal": parts.push(`It mends ${t.enemyHealed}.`); break;
      case "block": parts.push(`It hardens: ${t.armorGained} armor.`); break;
    }
  }
  if (t.thorns) parts.push(`Your thorns cut it for ${t.thorns}${t.killed ? " and it falls" : ""}.`);
  if (t.regen) parts.push(`You regenerate ${t.regen}.`);
  if (t.retained) parts.push(`You keep ${t.retained} card${t.retained === 1 ? "" : "s"}.`);
  if (t.dead) parts.push("You fall.");
  return parts.join(" ");
}

/** Short badge for a card in hand; penalties first. */
export function cardHint(run: Run, card: Card, spell: Spell): string | undefined {
  const blocker = castBlocker(run, card.uid);
  if (blocker === "not enough breath" || blocker === "silenced" || blocker === "not enough life") return blocker;
  const p = previewCast(run, spell);
  const dmg = isDamageKind(spell.kind);
  if (dmg && p.underTier) return "too weak";
  if (dmg && p.resist) return "resisted";
  if (p.bonusText) return p.bonusText;                       // "+18 from Burn", "detonate 6 Burn: +18", "×1.5 vs Chilled", "+8 from casts"
  if (dmg && p.weak) return "×2 here";
  if (p.reaction) return `${p.reaction} ↑`;
  if (p.chain >= 2 && spell.kind !== "hex" && spell.kind !== "empower") return `chain ×${p.chain}`;
  if (dmg && run.enemy && hasStatus(run.enemy.statuses, "exposed")) return "exposed ×1.5";
  if (spell.cost > 0 && p.cost < spell.cost) return "tailwind −1";   // never say "cost": SpellCard reads that word as a penalty
  return undefined;
}

/** What the enemy's next action would do: damage before your defenses, armor gained, or life mended (0 otherwise). */
export function intentAmount(e: Enemy): number {
  const intent = nextIntent(e);
  if (intent === "attack" || intent === "double") return intentDamage(e);
  if (intent === "block") return Math.round(e.attack * 1.5);
  if (intent === "heal") return Math.max(0, Math.min(Math.round(e.hp * 0.12), e.hp - e.hpNow));
  return 0;
}

/**
 * "strikes for 17" with the real number (Weak accounted for); `danger` when a charged hit is coming.
 * `intent` and `amount` feed the IntentBadge (`amount` = intentAmount).
 */
export function intentLine(e: Enemy): { intent: Intent; amount: number; text: string; danger: boolean; tone: "blood" | "shadow" | "ember"; note: string | null } {
  const intent = nextIntent(e);
  const dmg = intentDamage(e);
  const text =
    intent === "attack" ? `strikes for ${dmg}`
    : intent === "double" ? `strikes twice, ${dmg / 2} each`
    : intent === "block" ? INTENT_TEXT.block(e.attack)            // armor is attack × 1.5, never doubled by charge
    : INTENT_TEXT[intent](e.attack * (e.charged ? 2 : 1));
  const attackish = intent === "attack" || intent === "double";
  const danger = attackish && e.charged;
  const note = hasStatus(e.statuses, "stagger") ? "it will stagger instead"
    : intent === "charge" && hasStatus(e.statuses, "chill") ? "the chill will hold it"
    : attackish && hasStatus(e.statuses, "weak") ? "weakened" : null;
  return { intent, amount: intentAmount(e), text, danger, tone: danger ? "blood" : intent === "curse" || intent === "silence" ? "shadow" : "ember", note };
}

/** Coach status line from the route's `why` (docs/SPEECH_GEMINI.md §2). */
export const WHY_TEXT: Record<string, string | null> = {
  nokey: "coach is offline (no key)",
  cooldown: "coach resting — quota, try later",
  quota: "coach resting — quota, try later",
  timeout: "coach is slow today",
  badmodel: "coach misconfigured — see /api/health",
  empty: null,
  error: "coach unavailable",
};

export const MODE_TAG: Record<string, string | null> = { gemini: "(Gemini heard your audio)", "gemini-text": "(Gemini, from transcript)", template: null };

/** The route's template praise for a ≥ 0.97 cast, built locally so no request is spent. */
export function praiseText(L: LangConfig, word: Vocab): string {
  const focus = word.focus?.trim().replace(/^the\s+/i, "");
  return L.id === "zh"
    ? `Clean cast. Every tone of ${word.reading ?? word.text} landed.${focus ? ` Your ${focus} was spot on.` : ""}`
    : `Clean cast. Every syllable landed.${focus ? ` Your ${focus} was on point.` : " Keep that rhythm."}`;
}
