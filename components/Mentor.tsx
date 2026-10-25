"use client";

import { useEffect, useRef, useState } from "react";
import { withPinyin } from "@/components/fx";

/** Everything Game.tsx knows about the run, shaped for /api/mentor (every field optional there). */
export type MentorCtx = Record<string, unknown> & { lang?: string };
type Msg = { role: "user" | "mentor"; text: string };
type Reply = { text?: string; mode?: "gemini" | "template"; why?: string };

const quickPrompts = (lang: string) => [
  "Why did that fizzle?",
  lang === "zh" ? "How do I make this tone?" : "How do I roll the rr?",
  "What should I cast?",
];

export default function Mentor({ ctx, nudge }: { ctx: MentorCtx; nudge: number }) {
  const lang = typeof ctx.lang === "string" ? ctx.lang : "es";
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "mentor", text: "I'm Eco. I live in your spellbook. Ask, and I'll point; I won't cast for you." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState(false);
  const [resting, setResting] = useState(false);   // Gemini quota / cooldown: Eco answers from memory
  const listRef = useRef<HTMLDivElement>(null);

  // a backfire makes the orb flare until opened
  useEffect(() => { if (nudge > 0) setAlert(true); }, [nudge]);
  useEffect(() => { if (open) setAlert(false); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [msgs, open]);

  async function ask(text: string) {
    const t = text.trim(); if (!t || busy) return;
    const next = [...msgs, { role: "user" as const, text: t }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/mentor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, ctx }) });
      const d = (await res.json()) as Reply;
      setMsgs((m) => [...m, { role: "mentor", text: d.text?.trim() || "The thread between us frayed. Ask again." }]);
      setResting(d.mode === "template" && (d.why === "quota" || d.why === "cooldown"));
    } catch {
      setMsgs((m) => [...m, { role: "mentor", text: "The thread between us frayed. Ask again." }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      {/* orb */}
      <button
        type="button"
        aria-label={open ? "Close Eco" : "Ask Eco for guidance"}
        onClick={() => setOpen((o) => !o)}
        className={`orb fixed bottom-6 right-6 z-40 h-16 w-16 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${alert ? "orb-alert" : ""} ${busy ? "orb-busy" : ""}`}
      >
        <span className="orb-ring" /><span className="orb-ring orb-ring-2" />
        <span className="orb-core" />
      </button>

      {/* panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-40 flex w-[min(92vw,22rem)] flex-col overflow-hidden rounded-2xl bg-dusk/95 shadow-2xl shadow-black/60 ring-1 ring-white/10 backdrop-blur animate-reveal">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="font-display text-lg italic">Eco</p>
            <p className="text-xs text-vellum2">
              guide, not oracle
              {resting && <span className="ml-2 text-[10px] text-vellum2/70" title="The coach's quota is spent; Eco answers from the book for now.">(Eco is resting)</span>}
            </p>
          </div>
          <div ref={listRef} className="max-h-72 space-y-2 overflow-y-auto px-4 pb-2">
            {msgs.map((m, i) => (
              <p key={i} className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-snug ${m.role === "user" ? "ml-auto bg-vellum text-ink" : "bg-white/5 text-vellum"}`}>{lang === "zh" ? withPinyin(m.text, "zh") : m.text}</p>
            ))}
            {busy && <p className="max-w-[90%] rounded-2xl bg-white/5 px-3 py-2 text-sm text-vellum2">…</p>}
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 py-2">
            {quickPrompts(lang).map((q) => (
              <button key={q} type="button" onClick={() => ask(q)} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-vellum2 hover:bg-white/10">{q}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2 border-t border-white/5 p-3">
            <input autoFocus className="input py-2" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Eco…" aria-label="Ask Eco" />
            <button type="submit" className="btn-ember py-2" disabled={busy || !input.trim()}>Ask</button>
          </form>
        </div>
      )}
    </>
  );
}
