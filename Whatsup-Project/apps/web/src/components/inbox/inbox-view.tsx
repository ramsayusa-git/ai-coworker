"use client";
import { useCallback, useEffect, useState } from "react";
import type { Conversation, ConvStatus, Message } from "@/lib/types";
import { ConversationList } from "./conversation-list";
import { Thread } from "./thread";
import { apiFetch } from "@/lib/api";

function withTags(c: Conversation): Conversation {
  return { ...c, contact: { ...c.contact, tags: c.contact.tags ?? [] } };
}

export function InboxView() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<ConvStatus | "all">("all");
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);

  const loadConvs = useCallback(async () => {
    const rows: Conversation[] = await apiFetch("/conversations");
    setConvs(rows.map(withTags));
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    apiFetch(`/conversations/${selected}/messages`).then((d) => { if (alive) setMsgs(d); });
    return () => { alive = false; };
  }, [selected]);

  async function send(body: string) {
    if (!selected) return;
    setSending(true);
    try {
      const m: Message = await apiFetch(`/conversations/${selected}/messages`, {
        method: "POST", body: JSON.stringify({ body }),
      });
      setMsgs((prev) => [...prev, m]);
      await loadConvs();
    } finally { setSending(false); }
  }

  const current = convs.find((c) => c.id === selected) ?? null;

  return (
    <div className="-m-6 flex h-screen">
      <ConversationList items={convs} selectedId={selected} filter={filter} onFilter={setFilter} onSelect={setSelected} />
      {current ? (
        <Thread conversation={current} messages={msgs} onSend={send} sending={sending} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Select a conversation</div>
      )}
    </div>
  );
}
