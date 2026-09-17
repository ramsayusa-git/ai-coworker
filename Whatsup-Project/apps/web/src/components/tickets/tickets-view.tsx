"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/nav-icons";

type Ticket = {
  id: string; number: number; subject: string; body?: string | null; priority: string;
  category: string | null; status: string; source: string; tags: string[];
  contactId: string | null; contactName: string | null; contactPhone: string | null;
  assigneeId: string | null; assigneeName: string | null; teamName: string | null;
  slaDueAt: string | null; firstResponseAt: string | null; slaBreached: boolean;
  createdAt: string;
};
type TicketEvent = { id: string; kind: string; body: string | null; actorName: string | null; createdAt: string };

const priorityColor: Record<string, string> = {
  urgent: "bg-red-100 text-red-700", high: "bg-amber-100 text-amber-700",
  normal: "bg-sky-100 text-sky-700", low: "bg-zinc-100 text-zinc-600",
};
const statusColor: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700",
  on_hold: "bg-zinc-100 text-zinc-600", resolved: "bg-sky-100 text-sky-700",
  closed: "bg-zinc-100 text-zinc-500",
};
const STATUSES = ["open", "pending", "on_hold", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const input = "w-full rounded-md border border-zinc-300 px-2 py-1 text-sm";

function errText(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/\{.*\}/);
  if (!m) return raw;
  try { const p = JSON.parse(m[0]); return p.error ?? p.message ?? raw; } catch { return raw; }
}

export function TicketsView() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<(Ticket & { events: TicketEvent[] }) | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState<"note" | "reply">("note");
  const [form, setForm] = useState({ subject: "", body: "", priority: "normal", category: "", contactId: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, c, m] = await Promise.all([
      apiFetch("/tickets"),
      apiFetch("/contacts").catch(() => []),
      apiFetch("/members").catch(() => []),
    ]);
    setTickets(t); setContacts(c); setMembers(m);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openTicket = useCallback(async (id: string) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(await apiFetch(`/tickets/${id}`));
  }, [openId]);

  const shown = useMemo(
    () => tickets.filter((t) => filter === "all" || t.status === filter),
    [tickets, filter]
  );
  const breached = tickets.filter((t) => t.slaBreached).length;

  async function create() {
    if (!form.subject.trim()) return;
    setError(null);
    try {
      await apiFetch("/tickets", {
        method: "POST",
        body: JSON.stringify({ ...form, contactId: form.contactId || null }),
      });
      setForm({ subject: "", body: "", priority: "normal", category: "", contactId: "" });
      setShowNew(false);
      await load();
    } catch (e) { setError(errText(e)); }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await apiFetch(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await load();
    if (openId === id) setDetail(await apiFetch(`/tickets/${id}`));
  }

  async function addEvent(id: string) {
    if (!note.trim()) return;
    await apiFetch(`/tickets/${id}/events`, { method: "POST", body: JSON.stringify({ kind: noteKind, body: note }) });
    setNote("");
    setDetail(await apiFetch(`/tickets/${id}`));
    await load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Tickets</h1>
          <p className="text-sm text-zinc-500">
            Support requests with routing, SLA timers and a full activity log.
            {breached > 0 && <span className="ml-1 font-medium text-red-600">{breached} past SLA.</span>}
          </p>
        </div>
        <button onClick={() => setShowNew((s) => !s)}
          className="lq-ring-focus flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">
          <Icon name="plus" className="h-3.5 w-3.5" /> New ticket
        </button>
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {showNew && (
        <div className="mb-4 grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-500">Subject</label>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className={input} placeholder="What is the customer asking about?" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-500">Details</label>
            <textarea rows={2} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={input} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Priority</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={input}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Category</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={input} placeholder="billing, delivery…" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-500">Contact</label>
            <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className={input}>
              <option value="">— none —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phoneE164}</option>)}
            </select>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={create} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Create</button>
            <button onClick={() => setShowNew(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
          </div>
          <p className="text-[11px] text-zinc-400 sm:col-span-2">
            Routing rules run on creation — they can set priority and category, and assign to a team or the
            least-loaded agent. The SLA deadline follows the final priority.
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {(["all", ...STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${filter === s ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {shown.map((t) => (
          <div key={t.id} className="lq-card overflow-hidden">
            <button onClick={() => openTicket(t.id)} className="flex w-full flex-wrap items-center gap-2 p-3 text-left">
              <span className="font-mono text-xs text-zinc-400">#{t.number}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.subject}</span>
              {t.slaBreached && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">SLA</span>}
              <span className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${priorityColor[t.priority]}`}>{t.priority}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${statusColor[t.status]}`}>{t.status.replace("_", " ")}</span>
              <span className="text-[11px] text-zinc-400">{t.assigneeName ?? t.teamName ?? "unassigned"}</span>
              <Icon name="chevron" className={`h-3.5 w-3.5 text-zinc-300 transition-transform ${openId === t.id ? "rotate-90" : ""}`} />
            </button>

            {openId === t.id && detail && (
              <div className="border-t border-zinc-100 bg-zinc-50/60 p-3">
                <div className="mb-3 flex flex-wrap gap-2">
                  <select value={detail.status} onChange={(e) => patch(t.id, { status: e.target.value })}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                  <select value={detail.priority} onChange={(e) => patch(t.id, { priority: e.target.value })}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={detail.assigneeId ?? ""} onChange={(e) => patch(t.id, { assigneeId: e.target.value || null })}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.userId ?? m.id} value={m.userId ?? m.id}>{m.name ?? m.email}</option>)}
                  </select>
                  {detail.contactName && (
                    <span className="self-center text-[11px] text-zinc-500">{detail.contactName} · {detail.contactPhone}</span>
                  )}
                  {detail.slaDueAt && (
                    <span className={`self-center text-[11px] ${detail.slaBreached ? "text-red-600" : "text-zinc-400"}`}>
                      {detail.firstResponseAt ? "First reply sent" : `SLA due ${new Date(detail.slaDueAt).toLocaleString()}`}
                    </span>
                  )}
                </div>

                {detail.body && <p className="mb-3 whitespace-pre-wrap rounded-md bg-white p-2 text-sm">{detail.body}</p>}

                <div className="mb-2 text-xs font-medium text-zinc-600">Activity</div>
                <ul className="mb-3 space-y-1.5">
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex gap-2 text-xs">
                      <span className="shrink-0 text-zinc-400">{new Date(e.createdAt).toLocaleString()}</span>
                      <span className={`shrink-0 rounded px-1 text-[10px] uppercase ${e.kind === "reply" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-600"}`}>{e.kind}</span>
                      <span className="min-w-0 flex-1">{e.body}</span>
                      {e.actorName && <span className="shrink-0 text-zinc-400">{e.actorName}</span>}
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap gap-2">
                  <select value={noteKind} onChange={(e) => setNoteKind(e.target.value as "note" | "reply")}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                    <option value="note">Internal note</option>
                    <option value="reply">Customer reply</option>
                  </select>
                  <input value={note} onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addEvent(t.id); }}
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                    placeholder={noteKind === "reply" ? "Logging a reply stops the SLA clock…" : "Only your team sees this…"} />
                  <button onClick={() => addEvent(t.id)} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white">Add</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && (
          <div className="lq-card p-10 text-center text-sm text-zinc-400">No tickets in this status.</div>
        )}
      </div>
    </div>
  );
}
