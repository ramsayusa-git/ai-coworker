"use client";
import { useMemo, useState } from "react";
import type { Conversation, ConvStatus, SavedView } from "@/lib/types";
import { getCachedMe } from "@/lib/api";
import { HelpLink } from "@/components/help-link";

const filters: { key: ConvStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "pending", label: "Pending" },
  { key: "snoozed", label: "Snoozed" },
  { key: "resolved", label: "Resolved" },
];

export type AssignFilter = "all" | "mine" | "unassigned";

function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function ConversationList({
  items, selectedId, filter, assignFilter, tagFilter, onFilter, onAssignFilter, onTagFilter, onSelect,
  views, onApplyView, onSaveView, onDeleteView,
}: {
  items: Conversation[];
  selectedId: string | null;
  filter: ConvStatus | "all";
  assignFilter: AssignFilter;
  tagFilter: string | null;
  onFilter: (f: ConvStatus | "all") => void;
  onAssignFilter: (f: AssignFilter) => void;
  onTagFilter: (t: string | null) => void;
  onSelect: (id: string) => void;
  views: SavedView[];
  onApplyView: (v: SavedView) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const me = getCachedMe();

  const allTags = useMemo(() => Array.from(new Set(items.flatMap((c) => c.contact.tags ?? []))).sort(), [items]);

  const shown = useMemo(() => {
    let list = filter === "all" ? items : items.filter((c) => c.status === filter);
    if (assignFilter === "mine") list = list.filter((c) => c.assigneeId === me?.userId);
    if (assignFilter === "unassigned") list = list.filter((c) => !c.assigneeId);
    if (tagFilter) list = list.filter((c) => c.contact.tags?.includes(tagFilter));
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter((c) =>
        c.contact.name.toLowerCase().includes(query) ||
        c.contact.phone.toLowerCase().includes(query) ||
        c.lastMessage?.toLowerCase().includes(query));
    }
    return list;
  }, [items, filter, assignFilter, tagFilter, q, me?.userId]);

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-200 p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, message…"
          className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none" />
        <HelpLink anchor="inbox" label="" />
      </div>

      {views.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-zinc-200 p-2">
          {views.map((v) => (
            <span key={v.id} className="group flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700">
              <button onClick={() => onApplyView(v)} className="hover:underline">{v.name}</button>
              <button onClick={() => onDeleteView(v.id)} className="hidden text-indigo-300 hover:text-indigo-600 group-hover:inline">×</button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 p-2">
        {filters.map((f) => (
          <button key={f.key} onClick={() => onFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs ${filter === f.key ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 border-b border-zinc-200 p-2">
        {([["all", "Team"], ["mine", "Mine"], ["unassigned", "Unassigned"]] as [AssignFilter, string][]).map(([key, label]) => (
          <button key={key} onClick={() => onAssignFilter(key)}
            className={`rounded-full px-3 py-1 text-xs ${assignFilter === key ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {label}
          </button>
        ))}
        {allTags.length > 0 && (
          <select value={tagFilter ?? ""} onChange={(e) => onTagFilter(e.target.value || null)}
            className="ml-auto rounded border border-zinc-200 bg-white px-1.5 py-1 text-[11px] text-zinc-600">
            <option value="">All tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      <div className="border-b border-zinc-200 p-2">
        {savingView ? (
          <div className="flex gap-1">
            <input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && viewName.trim()) { onSaveView(viewName.trim()); setViewName(""); setSavingView(false); } }}
              placeholder="View name…" className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs" />
            <button onClick={() => { if (viewName.trim()) { onSaveView(viewName.trim()); setViewName(""); } setSavingView(false); }}
              className="rounded bg-indigo-600 px-2 text-xs text-white">Save</button>
          </div>
        ) : (
          <button onClick={() => setSavingView(true)} className="text-[11px] text-indigo-600 hover:underline">
            + Save current filters as a Team View
          </button>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto">
        {shown.length === 0 && <li className="p-6 text-center text-sm text-zinc-400">No conversations</li>}
        {shown.map((c) => (
          <li key={c.id}>
            <button onClick={() => onSelect(c.id)}
              className={`flex w-full flex-col gap-0.5 border-b border-zinc-100 px-4 py-3 text-left hover:bg-zinc-50 ${selectedId === c.id ? "bg-emerald-50" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-sm font-medium">
                  {c.pinned && <span title="Pinned">📌</span>}
                  {c.contact.name}
                </span>
                <span className="flex items-center gap-1">
                  {c.slaBreached && (
                    <span title={`Pending your reply for over 30 min`} className="rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">
                      SLA
                    </span>
                  )}
                  <span className="text-xs text-zinc-400">{timeAgo(c.lastMessageAt)}</span>
                </span>
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
                {c.assigneeName && <span className="text-[10px] text-zinc-400">→ {c.assigneeName}</span>}
                {c.contact.tags?.slice(0, 2).map((t) => (
                  <span key={t} className="rounded bg-violet-100 px-1 text-[10px] text-violet-700">{t}</span>
                ))}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
