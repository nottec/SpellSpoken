"use client";

/**
 * The merchant: four spells and two relics with prices, two services (forget / upgrade a card),
 * Leave. A refused purchase comes back as the same run reference; we show "Not enough ink."
 */
import { useEffect, useRef, useState } from "react";
import { SpellCard } from "@/components/fx";
import { buyCard, buyRelic, buyRemove, buyUpgrade, leaveShop, type Run } from "@/lib/engine";
import { LANGS, nodeLabel, type LangId } from "@/lib/lang";
import { spellName } from "@/data/spells";
import { relicName } from "@/data/relics";
import RunHeader from "./RunHeader";
import DeckPicker from "./DeckPicker";

export type MerchantScreenProps = { run: Run; lang: LangId; onRun: (next: Run) => void };

export default function MerchantScreen({ run, lang, onRun }: MerchantScreenProps) {
  const L = LANGS[lang];
  const shop = run.shop;
  const [picker, setPicker] = useState<"remove" | "upgrade" | null>(null);
  const [refused, setRefused] = useState(false);
  const [delta, setDelta] = useState<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** Commit a purchase, or flash the refusal when the engine handed the same run back. */
  function attempt(next: Run) {
    if (next === run) {
      setRefused(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setRefused(false), 1500);
      return;
    }
    setDelta(next.ink - run.ink);
    onRun(next);
  }

  if (!shop) {
    return (
      <div className="animate-reveal">
        <RunHeader run={run} lang={lang} />
        <div className="panel mt-10 p-6 text-center text-vellum2">
          The stall is empty.
          <button type="button" onClick={() => onRun(leaveShop(run))} className="btn-quiet ml-3">Leave</button>
        </div>
      </div>
    );
  }

  const canRemove = run.deck.length > 1;
  const canUpgrade = run.deck.some((c) => !c.up);
  const service = (kind: "remove" | "upgrade", price: number) => {
    if (run.ink < price) { attempt(run); return; }   // same reference → "Not enough ink."
    setPicker(kind);
  };

  return (
    <div className="animate-reveal">
      <RunHeader run={run} lang={lang} inkDelta={delta} />

      <section className="mt-10 text-center">
        <p className="text-[10px] uppercase tracking-[.2em] text-light">merchant</p>
        <h2 className={`mt-2 font-display text-4xl font-light text-vellum ${L.italic ? "italic" : ""}`}>{nodeLabel("merchant", lang)}</h2>
        <p className="mt-2 text-sm text-vellum2">She unrolls her wares and names her prices. Ink only.</p>
        <p className={`mt-2 h-5 text-sm text-blood transition-opacity duration-300 ${refused ? "opacity-100" : "opacity-0"}`} role="status" aria-live="polite">
          {refused ? "Not enough ink." : ""}
        </p>
      </section>

      <section className="mt-2">
        <h3 className="text-[10px] uppercase tracking-[.2em] text-vellum2">Spells</h3>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          {shop.cards.map((it, i) => {
            const s = it.spell;
            const poor = run.ink < it.price;
            return (
              <SpellCard
                key={`${s.id}-${i}`}
                name={spellName(s, lang)} desc={s.desc} element={s.element} kind={s.kind} tier={s.tier} cost={s.cost}
                power={s.power || undefined} italic={L.italic}
                disabled={it.sold || poor} hint={it.sold ? "sold" : `${it.price} ink`}
                onClick={() => attempt(buyCard(run, i))}
              />
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-[10px] uppercase tracking-[.2em] text-vellum2">Relics</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {shop.relics.map((it, i) => {
            const x = it.relic;
            const poor = run.ink < it.price;
            return (
              <button
                key={x.id} type="button" disabled={it.sold || poor} onClick={() => attempt(buyRelic(run, i))}
                className="panel flex items-start justify-between gap-4 p-4 text-left transition hover:bg-dusk2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-dusk/80"
              >
                <span className="min-w-0">
                  <span className={`block font-display text-xl text-vellum ${L.italic ? "italic" : ""}`}>
                    <span aria-hidden>{x.emoji}</span> {relicName(x, lang)}
                  </span>
                  <span className="block text-xs text-vellum2">{x.gloss}</span>
                  <span className="mt-1 block text-sm text-vellum">{x.desc}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${it.sold ? "bg-white/5 text-vellum2" : poor ? "bg-blood/20 text-blood" : "bg-light/15 text-light"}`}>
                  {it.sold ? "sold" : `${it.price} ink`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-[10px] uppercase tracking-[.2em] text-vellum2">Services</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className="btn-quiet" disabled={!canRemove} onClick={() => service("remove", shop.removePrice)} title={canRemove ? undefined : "You cannot forget your last card."}>
            Forget a card ({shop.removePrice} ink)
          </button>
          <button type="button" className="btn-quiet" disabled={!canUpgrade} onClick={() => service("upgrade", shop.upgradePrice)} title={canUpgrade ? undefined : "Every card is already upgraded."}>
            Upgrade a card ({shop.upgradePrice} ink)
          </button>
        </div>
      </section>

      <div className="mt-10 text-center">
        <button type="button" onClick={() => onRun(leaveShop(run))} className="btn-ember px-8 py-3 text-base">Leave</button>
      </div>

      {picker && (
        <DeckPicker
          run={run} lang={lang}
          title={picker === "remove" ? `Forget which card? (${shop.removePrice} ink)` : `Upgrade which card? (${shop.upgradePrice} ink)`}
          filter={picker === "upgrade" ? (c) => !c.up : undefined} filteredHint="already +"
          onPick={(uid) => { setPicker(null); attempt(picker === "remove" ? buyRemove(run, uid) : buyUpgrade(run, uid)); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
