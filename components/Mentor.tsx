"use client";

import { useEffect, useRef, useState } from "react";

export type MentorCtx = Record<string, unknown>;
type Msg = { role: "user" | "mentor"; text: string };

const QUICK = ["Why did that fizzle?", "How do I make this sound?", "How should I read this enemy?"];

export default function Mentor({ ctx, nudge }: { ctx: MentorCtx; nudge: number }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "mentor", text: "I'm Eco. I live in your spellbook. Ask, and I'll point; I won't cast for you." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState(false);
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
      const d = await res.json();
      setMsgs((m) => [...m, { role: "mentor", text: d.text }]);
    } catch {
      setMsgs((m) => [...m, { role: "mentor", text: "The thread between us frayed. Ask again." }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      {/* orb */}
      <button
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
            <p className="text-xs text-vellum2">guide, not oracle</p>
          </div>
          <div ref={listRef} className="max-h-72 space-y-2 overflow-y-auto px-4 pb-2">
            {msgs.map((m, i) => (
              <p key={i} className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-snug ${m.role === "user" ? "ml-auto bg-vellum text-ink" : "bg-white/5 text-vellum"}`}>{m.text}</p>
            ))}
            {busy && <p className="max-w-[90%] rounded-2xl bg-white/5 px-3 py-2 text-sm text-vellum2">…</p>}
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 py-2">
            {QUICK.map((q) => <button key={q} onClick={() => ask(q)} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-vellum2 hover:bg-white/10">{q}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2 border-t border-white/5 p-3">
            <input autoFocus className="input py-2" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Eco…" />
            <button className="btn-ember py-2" disabled={busy || !input.trim()}>Ask</button>
          </form>
        </div>
      )}
    </>
  );
}
