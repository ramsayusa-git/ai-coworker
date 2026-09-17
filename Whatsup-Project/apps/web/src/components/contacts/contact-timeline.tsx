"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/nav-icons";

type Entry = { id: string; at: string; kind: string; title: string; detail?: string | null; meta?: Record<string, any> };
type Timeline = { contact: { id: string; name: string }; counts: Record<string, number>; entries: Entry[] };

// One visual language for every source, so the stream is scannable at a glance.
const STYLE: Record<string, { icon: string; dot: string; label: string }> = {
  message_in: { icon: "inbox", dot: "bg-sky-500", label: "Received" },
  message_out: { icon: "broadcasts", dot: "bg-emerald-500", label: "Sent" },
  note: { icon: "templates", dot: "bg-zinc-400", label: "Note" },
  task: { icon: "tasks", dot: "bg-amber-500", label: "Task" },
  deal: { icon: "deals", dot: "bg-violet-500", label: "Deal" },
  ticket: { icon: "help", dot: "bg-red-500", label: "Ticket" },
  quote: { icon: "templates", dot: "bg-teal-500", label: "Quote" },
  appointment: { icon: "tasks", dot: "bg-indigo-500", label: "Appointment" },
  survey: { icon: "analytics", dot: "bg-pink-500", label: "Survey" },
  flow: { icon: "flows", dot: "bg-cyan-500", label: "Flow" },
};

export function ContactTimeline({ contactId }: { contactId: string }) {
  const [data, setData] = useState<Timeline | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    apiFetch(`/contacts/${contactId}/timeline`).then(setData).catch(() => setData(null));
  }, [contactId]);

  if (!data) return <div className="lq-skeleton h-40 w-full" />;

  const kinds = Object.keys(data.counts);
  const shown = data.entries.filter((e) => filter === "all" || e.kind === filter);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        <button onClick={() => setFilter("all")}
          className={`rounded-full px-2.5 py-1 text-[11px] ${filter === "all" ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
          Everything ({data.entries.length})
        </button>
        {kinds.map((k) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded-full px-2.5 py-1 text-[11px] ${filter === k ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {STYLE[k]?.label ?? k} ({data.counts[k]})
          </button>
        ))}
      </div>

      <ol className="relative space-y-3 border-l border-zinc-200 pl-5">
        {shown.map((e) => {
          const st = STYLE[e.kind] ?? { icon: "dashboard", dot: "bg-zinc-400", label: e.kind };
          return (
            <li key={e.id} className="relative">
              <span className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${st.dot}`} />
              <div className="flex flex-wrap items-baseline gap-2">
                <Icon name={st.icon} className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-sm font-medium">{e.title}</span>
                <span className="text-[11px] text-zinc-400">{new Date(e.at).toLocaleString()}</span>
              </div>
              {e.detail && <p className="mt-0.5 whitespace-pre-wrap text-xs text-zinc-500">{e.detail}</p>}
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="py-6 text-center text-xs text-zinc-400">Nothing recorded for this contact yet.</li>
        )}
      </ol>
    </div>
  );
}
