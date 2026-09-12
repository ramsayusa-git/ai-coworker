"use client";
import { useEffect, useRef, useState } from "react";
import type { Conversation, Message } from "@/lib/types";

const statusIcon: Record<Message["status"], string> = { sent: "✓", delivered: "✓✓", read: "✓✓", failed: "!" };

function windowLabel(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: "24h window closed — template required", ok: false };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { text: `Service window open · ${h}h ${m}m left`, ok: true };
}

export function Thread({ conversation, messages, onSend, sending }: {
  conversation: Conversation; messages: Message[]; onSend: (body: string) => Promise<void>; sending: boolean;
}) {
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  const win = windowLabel(conversation.serviceWindowExpiresAt);

  async function submit() {
    if (!draft.trim() || sending) return;
    const b = draft; setDraft("");
    await onSend(b);
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3">
        <div>
          <div className="font-medium">{conversation.contact.name}</div>
          <div className="text-xs text-zinc-500">{conversation.contact.phone} · {conversation.channel.name}</div>
        </div>
        <div className="flex items-center gap-2">
          {conversation.contact.tags.map((t) => (
            <span key={t} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{t}</span>
          ))}
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs capitalize text-white">{conversation.status}</span>
        </div>
      </header>
      <div className={`px-5 py-1 text-xs ${win.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{win.text}</div>
      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.direction === "out" ? "bg-emerald-600 text-white" : "bg-white text-zinc-900"}`}>
              <div>{m.body}</div>
              <div className={`mt-1 text-right text-[10px] ${m.direction === "out" ? "text-emerald-100" : "text-zinc-400"}`}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {m.direction === "out" && <span className={`ml-1 ${m.status === "read" ? "text-sky-200" : ""}`}>{statusIcon[m.status]}</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="border-t border-zinc-200 bg-white p-3">
        <div className="flex gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={win.ok ? "Type a message… (Enter to send, Shift+Enter for newline)" : "Window closed — choose a template"}
            disabled={!win.ok}
            className="flex-1 resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-zinc-100" />
          <button onClick={submit} disabled={!win.ok || sending || !draft.trim()}
            className="rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
