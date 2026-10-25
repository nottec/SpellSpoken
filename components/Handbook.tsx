"use client";

/**
 * The Handbook: every symbol on screen and what it means, in one scrollable overlay. Opened by
 * HelpButton (any header), the "?" key or the Title's link; closed by Esc, the ✕ or the backdrop.
 * Everything here reads from the same tables the game uses (STATUS_META, DOOR_META, INTENT_ICON,
 * REACTION_TEXT, the engine constants), so it cannot drift from the rules.
 */
import { useEffect, type ReactElement } from "react";
import {
  Sigil, StatusBadge, STATUS_META, SpellCard, BreathPips, InkCounter, Ruby, DOOR_META, INTENT_ICON, ELEMENT_HEX, PALETTE,
  type Element, type StatusId, type IntentId, type NodeKind,
} from "@/components/fx";
import { LANGS, elementLabel, NODE_LABEL, INTENT_NAMES, localName, type LangId } from "@/lib/lang";
import { BASE_BREATH, HAND_SIZE, START_HP, FLOORS, REACTIONS, REACTION_TEXT, RESONANCE_AT, cardName, cardDesc, cardTags, spellOfCard, type Card } from "@/lib/engine";
import { BOSS_FLOOR, FINAL_FLOOR } from "@/lib/map";
import { grade, BACKFIRE_BELOW } from "@/lib/scoring";

export type HandbookProps = { lang: LangId; onClose: () => void };

const ELEMENTS: Element[] = ["fire", "water", "wind", "shadow", "light"];
const STATUSES: StatusId[] = ["burn", "chill", "stagger", "weak", "exposed", "armor", "focus", "silence", "strength", "regen"];
const INTENTS: IntentId[] = ["attack", "double", "charge", "curse", "silence", "heal", "block"];
const NODES: NodeKind[] = ["fight", "elite", "rest", "event", "merchant", "boss", "final"];

const SECTIONS: { id: string; title: string }[] = [
  { id: "hb-turn", title: "The turn" },
  { id: "hb-say", title: "Saying it" },
  { id: "hb-elements", title: "Elements" },
  { id: "hb-cards", title: "Cards" },
  { id: "hb-statuses", title: "Statuses" },
  { id: "hb-enemy", title: "The enemy" },
  { id: "hb-map", title: "The map" },
  { id: "hb-keys", title: "Keys" },
];

const INTENT_TEXT: Record<IntentId, string> = {
  attack: "Strikes you. The number is the damage before your shield and armor; the badge also says what would get through.",
  double: "Strikes twice. Each hit is halved; shield and armor apply to each.",
  charge: "Charging: its next hit is doubled. Chill stops a charge and cancels one already held.",
  curse: "Curses you: your next incantation is drawn one level harder.",
  silence: "Silences you: no tier-3 cards next turn.",
  heal: "Mends itself for the number shown.",
  block: "Hardens: gains that much armor.",
};

const NODE_SHAPE: Record<NodeKind, ReactElement> = {
  fight: <circle cx="8" cy="8" r="4" />,
  elite: <path d="M8 2.5 13.5 8 8 13.5 2.5 8Z" />,
  rest: <path d="M8 2.5 13 11.5H3Z" />,
  event: <path d="M8 2 9.7 6.3 14 8 9.7 9.7 8 14 6.3 9.7 2 8 6.3 6.3Z" />,
  merchant: <rect x="3.5" y="3.5" width="9" height="9" rx="1.2" />,
  boss: <circle cx="8" cy="8" r="6" />,
  final: <><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1" opacity=".6" /><circle cx="8" cy="8" r="4" /></>,
};

const KEYWORDS: { name: string; text: string }[] = [
  { name: "Exhaust", text: "Gone for the rest of this battle once cast (even on a backfire); back for the next one." },
  { name: "Retain", text: "Stays in your hand when the turn ends instead of being discarded." },
  { name: "Draw N", text: "Draw N cards when the cast lands." },
  { name: "Detonate", text: "Consumes every stack of a status on the enemy (usually burn) for extra power per stack." },
  { name: "Kindle / per stack", text: "Hits harder for each stack of a status the enemy carries; the stacks stay." },
  { name: "vs a status", text: "Multiplied damage, or a drain, against an enemy that carries the named status." },
  { name: "Tailwind", text: "Your next costed card this turn costs 1 less; its gem turns wind-coloured." },
  { name: "Sacrifice", text: "Costs life as well as breath. You cannot cast it without the life to pay." },
  { name: "+", text: "An upgraded card (a Rest's study): more power or a stronger effect, same phrase level." },
];

const KINDS: { name: string; text: string }[] = [
  { name: "attack", text: "Damage to the enemy." },
  { name: "shield", text: "A shield for you; some also mend." },
  { name: "heal", text: "Mends your life." },
  { name: "drain", text: "Damage, and a share of it comes back as life." },
  { name: "hex", text: "Puts a status on the enemy." },
  { name: "empower", text: "Gives you focus, strength, breath or cards." },
];

const Key = ({ k }: { k: string }) => <kbd className="rounded border border-white/15 px-1.5 font-sans text-[11px] leading-5 text-vellum">{k}</kbd>;

function H2({ id, children }: { id: string; children: string }) {
  return <h2 id={id} className="mt-10 scroll-mt-4 border-b border-white/10 pb-2 font-display text-2xl font-light italic text-vellum first:mt-0">{children}</h2>;
}

function Row({ icon, title, children }: { icon: ReactElement; title: ReactElement | string; children: ReactElement | string }) {
  return (
    <div className="flex gap-3">
      <div className="flex w-16 shrink-0 items-start justify-center pt-0.5">{icon}</div>
      <div className="min-w-0 text-sm text-vellum2">
        <div className="font-semibold text-vellum">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

export default function Handbook({ lang, onClose }: HandbookProps) {
  const L = LANGS[lang];
  const sample: Card = { uid: "handbook", spell: "brisa", up: false };
  const sampleSpell = spellOfCard(sample);
  const name = (x: { name: string; zh: string }) => <Ruby text={localName(x, lang)} lang={lang} italic={L.italic} className="font-display text-base text-vellum" />;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 p-3 backdrop-blur-sm sm:p-6" onClick={onClose} role="presentation">
      <div
        role="dialog" aria-modal="true" aria-labelledby="hb-title" onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-3xl rounded-2xl bg-dusk p-5 shadow-2xl shadow-black/60 ring-1 ring-white/10 animate-reveal sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 id="hb-title" className="font-display text-3xl font-light italic text-vellum">Handbook</h1>
            <p className="mt-1 text-sm text-vellum2">Every symbol on the screen and what it means. Press <Key k="?" /> any time to open this, <Key k="Esc" /> to close it.</p>
          </div>
          <button type="button" onClick={onClose} className="btn-quiet px-3 py-1.5 text-sm" aria-label="Close the handbook">✕</button>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Handbook sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => go(s.id)} className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-vellum2 ring-1 ring-white/10 hover:bg-white/10 hover:text-vellum">{s.title}</button>
          ))}
        </nav>

        {/* ---------- the turn ---------- */}
        <H2 id="hb-turn">The turn</H2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Row icon={<BreathPips current={2} max={BASE_BREATH} />} title="Breath">
            {`Every card costs breath, shown in the orange gem on the card. You have ${BASE_BREATH} a turn and it refills when the turn ends. A 0-cost card keeps the turn open.`}
          </Row>
          <Row icon={<span className="font-display text-2xl text-vellum">{HAND_SIZE}</span>} title="Hand and end of turn">
            {`You draw ${HAND_SIZE} cards a turn. End turn (E) discards what you did not play, except Retain cards; then the enemy acts and your breath refills.`}
          </Row>
          <Row icon={<span className="mt-1.5 block h-2 w-12 overflow-hidden rounded-full bg-black/40"><span className="block h-2 w-9 rounded-full bg-moss" /></span>} title="Life">
            {`${START_HP} to start. At 0 the run ends. A Rest heals 30 %; regen and some shields mend a little.`}
          </Row>
          <Row icon={<InkCounter value={30} />} title="Ink">
            The merchant&apos;s currency. Enemies drop it, and the better you pronounce during the fight, the more they drop.
          </Row>
          <Row icon={<span className="font-semibold text-light">⛨ 8</span>} title="Shield and armor">
            A shield absorbs damage before your life and halves each enemy turn. Armor is the same idea as a status, on you or on the enemy.
          </Row>
          <Row icon={<span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-2 w-5 rounded-full ${i < 2 ? "bg-ember" : "bg-white/10"}`} />)}</span>} title="Resonance">
            {`${RESONANCE_AT} casts in a row at 80 % or better charge a guaranteed critical hit (×1.5) on the next cast.`}
          </Row>
          <Row icon={<span className="rounded-full bg-white/5 px-2 py-1 text-xs text-vellum">Redraw</span>} title="Redraw">
            One free new incantation per turn for the selected card, no penalty. Some relics add more.
          </Row>
          <Row icon={<span className="font-display text-base text-vellum">Floor 1 of {FLOORS}</span>} title="Floors">
            {`${FLOORS} floors, one life. The boss waits on floor ${BOSS_FLOOR + 1}; the last door is floor ${FINAL_FLOOR + 1}.`}
          </Row>
        </div>

        {/* ---------- saying it ---------- */}
        <H2 id="hb-say">Saying it</H2>
        <p className="mt-3 text-sm text-vellum2">Pick a card, say the incantation under it, and the scorer grades you before anything else happens. Damage scales with the score: a perfect word hits about one and a half times a mediocre one.</p>
        <div className="mt-4 grid gap-2 text-sm">
          {[
            { s: 1, band: "90 % and up", text: "full power; three of these in a row charge a crit." },
            { s: 0.8, band: "75 % and up", text: "it lands, a little softer." },
            { s: 0.5, band: `${Math.round(BACKFIRE_BELOW * 100)} % and up`, text: "a weak hit; below 70 % the word becomes a grudge." },
            { s: 0, band: `below ${Math.round(BACKFIRE_BELOW * 100)} %`, text: "a backfire: the spell burns you for 2 + 2 × its tier, the breath is spent, the word is a grudge." },
          ].map((g) => {
            const gr = grade(g.s, lang);
            return (
              <div key={g.band} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={`w-28 shrink-0 font-display text-lg ${gr.color}`}><Ruby text={gr.label} lang={lang} italic={L.italic} /></span>
                <span className="w-24 shrink-0 text-vellum">{g.band}</span>
                <span className="text-vellum2">{g.text}</span>
              </div>
            );
          })}
        </div>
        <ul className="mt-4 grid gap-2 text-sm text-vellum2 sm:grid-cols-2">
          <li><b className="text-vellum">Grudges.</b> A word that beat you comes back until you beat it. The incantation says so.</li>
          <li><b className="text-vellum">Mastery.</b> Three casts averaging 85 % or better master a word for good, across runs; mastered words hit 15 % harder.</li>
          <li><b className="text-vellum">Tier pips.</b> The dots on a card are the phrase level: one dot a word, two a phrase, three a sentence.</li>
          <li><b className="text-vellum">Hear it</b> (H) speaks the phrase. <b className="text-vellum">Stop</b> (Space) ends listening and scores what was heard. Silence costs nothing.</li>
          <li><b className="text-vellum">Short words.</b> Chrome hears a one-syllable word best said twice (塔 塔 scores as once). If it still hears nothing, Gemini listens to the clip.</li>
          <li><b className="text-vellum">Typing.</b> &ldquo;type instead of speak&rdquo; is the same game with a keyboard{L.hasReading ? ": characters, or pinyin like xia4 yu3 le" : ""}.</li>
          <li><b className="text-vellum">Eco</b>, the orb at the bottom right, knows which card you are looking at. Ask about &ldquo;this word&rdquo;: it names the sound to fix and never says the word for you.</li>
        </ul>

        {/* ---------- elements ---------- */}
        <H2 id="hb-elements">Elements and reactions</H2>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          {ELEMENTS.map((el) => (
            <span key={el} className="inline-flex items-center gap-2 text-sm">
              <Sigil element={el} size={22} className="drop-shadow-[0_0_6px_currentColor]" />
              <Ruby text={elementLabel(el, lang)} lang={lang} italic={L.italic} className="font-display text-base" />
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-vellum2">Cast the same element on consecutive casts to chain it: +15 % a step, up to +45 %. Change element in the right order and the two react instead:</p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(REACTIONS).map(([pair, id]) => {
            const [a, b] = pair.split(">") as [Element, Element];
            return (
              <div key={id} className="flex items-center gap-2">
                <Sigil element={a} size={16} /> <span className="text-vellum2">then</span> <Sigil element={b} size={16} />
                <span className="ml-1 text-vellum2"><b className="text-vellum">{REACTION_TEXT[id].split(":")[0]}</b>:{REACTION_TEXT[id].split(":").slice(1).join(":")}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-vellum2">An enemy <b className="text-vellum">weak</b> to an element takes double from it; one that <b className="text-vellum">resists</b> takes half. The enemy panel says which. A lone syllable with the right sound never backfires on tone alone; in phrases a wrong tone costs a third of a syllable.</p>

        {/* ---------- cards ---------- */}
        <H2 id="hb-cards">Cards</H2>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row">
          <div className="shrink-0">
            <SpellCard
              name={cardName(sample, lang)} desc={cardDesc(sample)} element={sampleSpell.element} kind={sampleSpell.kind} tier={sampleSpell.tier} cost={sampleSpell.cost} power={sampleSpell.power}
              tags={cardTags(sample)} italic={L.italic} lang={lang} hint="×2 here" className="w-[150px]"
            />
          </div>
          <ul className="grid gap-2 text-sm text-vellum2">
            <li><b className="text-vellum">Gem</b>, top left: the breath it costs. Wind-coloured when a Tailwind discount applies.</li>
            <li><b className="text-vellum">Dots</b>, top right: the tier, which is the phrase level you will have to say.</li>
            <li><b className="text-vellum">Sigil and number</b>: the element and the base power (damage, shield or heal).</li>
            <li><b className="text-vellum">Kind line</b>: attack, shield, heal, drain, hex or empower, then the element.</li>
            <li><b className="text-vellum">Badges</b> under it are keywords; the text is the exact rule.</li>
            <li><b className="text-vellum">Hint</b> at the bottom appears only now and then: what this cast would do here (a reaction, ×2 on a weakness, resisted, silenced).</li>
          </ul>
        </div>
        <div className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {KINDS.map((k) => <div key={k.name}><b className="uppercase tracking-[.15em] text-vellum">{k.name}</b> <span className="text-vellum2">{k.text}</span></div>)}
        </div>
        <div className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {KEYWORDS.map((k) => (
            <div key={k.name} className="flex gap-2">
              <span className="mt-0.5 h-fit shrink-0 rounded bg-white/10 px-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-vellum">{k.name}</span>
              <span className="text-vellum2">{k.text}</span>
            </div>
          ))}
        </div>

        {/* ---------- statuses ---------- */}
        <H2 id="hb-statuses">Statuses</H2>
        <p className="mt-3 text-sm text-vellum2">Badges next to a life bar. The large number is what matters: stacks for some, turns left for others. Hover one in play for the exact sentence.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {STATUSES.map((id) => {
            const m = STATUS_META[id];
            const onYou = id === "focus" || id === "silence" || id === "strength" || id === "regen";
            return (
              <Row key={id} icon={<StatusBadge id={id} stacks={2} turns={2} target={onYou ? "self" : "enemy"} />} title={<span style={{ color: m.color }}>{m.label} <span className="text-xs font-normal text-vellum2">{onYou ? "on you" : id === "armor" ? "on either" : "on the enemy"}</span></span>}>
                {m.description.replace("{n}", "N").replace("{t}", "T")}
              </Row>
            );
          })}
        </div>

        {/* ---------- the enemy ---------- */}
        <H2 id="hb-enemy">The enemy&apos;s next move</H2>
        <p className="mt-3 text-sm text-vellum2">The large badge on the enemy panel is what it will do when you end the turn. Red means it would hurt you through your shield and armor.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {INTENTS.map((id) => (
            <Row
              key={id}
              icon={<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: id === "heal" ? PALETTE.moss : id === "block" ? PALETTE.vellum2 : id === "curse" || id === "silence" ? ELEMENT_HEX.shadow : PALETTE.ember }} aria-hidden>{INTENT_ICON[id]}</svg>}
              title={name(INTENT_NAMES[id])}
            >
              {INTENT_TEXT[id]}
            </Row>
          ))}
        </div>

        {/* ---------- the map ---------- */}
        <H2 id="hb-map">The map</H2>
        <p className="mt-3 text-sm text-vellum2">The strip in the header is your route: moss for floors cleared, ember for where you are, faint for doors you did not take. Each shape is a kind of door; on the map itself you choose one and the others close.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {NODES.map((k) => {
            const m = DOOR_META[k];
            return (
              <Row
                key={k}
                icon={
                  <span className="flex items-center gap-2" style={{ color: m.color }}>
                    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden>{NODE_SHAPE[k]}</svg>
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{m.icon}</svg>
                  </span>
                }
                title={<span>{name({ name: NODE_LABEL[k].name, zh: NODE_LABEL[k].zh })} <span className="text-xs font-normal uppercase tracking-[.15em] text-vellum2">{NODE_LABEL[k].en}</span></span>}
              >
                {m.hint}
              </Row>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-vellum2">{`Floor 1 is always a fight; floors 2, 3, 5, 6 and 7 offer two or three doors; floor ${BOSS_FLOOR + 1} is the boss and floor ${FINAL_FLOOR + 1} the end.`}</p>

        {/* ---------- keys ---------- */}
        <H2 id="hb-keys">Keys</H2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-vellum2">
          <span><Key k="Space" /> cast, or stop listening</span>
          <span><Key k="H" /> hear it</span>
          <span><Key k="R" /> redraw</span>
          <span><Key k="E" /> end turn</span>
          <span><Key k="1–9" /> pick a card</span>
          <span><Key k="1–3" /> pick a door</span>
          <span><Key k="?" /> this handbook</span>
          <span><Key k="Esc" /> close</span>
        </div>
      </div>
    </div>
  );
}
