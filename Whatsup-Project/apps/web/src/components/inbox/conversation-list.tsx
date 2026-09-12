"use client";
import type { Conversation, ConvStatus } from "@/lib/types";

const filters: { key: ConvStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "pending", label: "Pending" },
  { key: "snoozed", label: "Snoozed" },
  { key: "resolved", label: "Resolved" },
];

function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function ConversationList({
  items, selectedId, filter, onFilter, onSelect,
}: {
  items: Conversation[];
  selectedId: string | null;
  filter: ConvStatus | "all";
  onFilter: (f: ConvStatus | "all") => void;
  onSelect: (id: string) => void;
}) {
  const shown = filter === "all" ? items : items.filter((c) => c.status === filter);
  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 p-2">
        {filters.map((f) => (
          <button key={f.key} onClick={() => onFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs ${filter === f.key ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {f.label}
          </button>
        ))}
      </div>
      <ul className="flex-1 overflow-y-auto">
        {shown.length === 0 && <li className="p-6 text-center text-sm text-zinc-400">No conversations</li>}
        {shown.map((c) => (
          <li key={c.id}>
            <button onClick={() => onSelect(c.id)}
              className={`flex w-full flex-col gap-0.5 border-b border-zinc-100 px-4 py-3 text-left hover:bg-zinc-50 ${selectedId === c.id ? "bg-emerald-50" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{c.contact.name}</span>
                <span className="text-xs text-zinc-400">{timeAgo(c.lastMessageAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-zinc-500">{c.lastMessage}</span>
                {c.unread > 0 && (
                  <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">{c.unread}</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <span className={`rounded px-1 text-[10px] ${c.channel.provider === "meta" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                  {c.channel.provider === "meta" ? "Official" : "Quick Connect"}
                </span>
                {c.assignee && <span className="text-[10px] text-zinc-400">→ {c.assignee}</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
