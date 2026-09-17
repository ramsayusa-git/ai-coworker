"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/nav-icons";

type Appt = {
  id: string; title: string; startsAt: string; durationMinutes: number;
  location: string | null; status: string; notes: string | null;
  contactId: string | null; contactName: string | null; contactPhone: string | null;
  assigneeId: string | null; assigneeName: string | null;
  reminderMinutesBefore: number | null; reminderSentAt: string | null;
};

const STATUSES = ["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const;
const statusColor: Record<string, string> = {
  scheduled: "bg-sky-100 text-sky-700", confirmed: "bg-emerald-100 text-emerald-700",
  completed: "bg-zinc-100 text-zinc-600", cancelled: "bg-red-100 text-red-700",
  no_show: "bg-amber-100 text-amber-700",
};
const input = "w-full rounded-md border border-zinc-300 px-2 py-1 text-sm";

export function AppointmentsView() {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    title: "", contactId: "", assigneeId: "", startsAt: "",
    durationMinutes: 30, location: "", notes: "", reminderMinutesBefore: 60,
  });

  const load = useCallback(async () => {
    const [a, c, m] = await Promise.all([
      apiFetch("/appointments"),
      apiFetch("/contacts").catch(() => []),
      apiFetch("/members").catch(() => []),
    ]);
    setAppts(a); setContacts(c); setMembers(m);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Grouped by day so the list reads like a diary rather than a table of timestamps.
  const byDay = useMemo(() => {
    const groups = new Map<string, Appt[]>();
    for (const a of appts) {
      const key = new Date(a.startsAt).toDateString();
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    return [...groups.entries()];
  }, [appts]);

  async function create() {
    if (!form.title.trim() || !form.startsAt) return;
    await apiFetch("/appointments", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        contactId: form.contactId || null,
        assigneeId: form.assigneeId || null,
        startsAt: new Date(form.startsAt).toISOString(),
      }),
    });
    setForm({ title: "", contactId: "", assigneeId: "", startsAt: "", durationMinutes: 30, location: "", notes: "", reminderMinutesBefore: 60 });
    setShowNew(false);
    await load();
  }

  async function setStatus(a: Appt, status: string) {
    await apiFetch(`/appointments/${a.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Appointments</h1>
          <p className="text-sm text-zinc-500">Bookings against a contact, with a WhatsApp reminder before each one.</p>
        </div>
        <button onClick={() => setShowNew((s) => !s)}
          className="lq-ring-focus flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">
          <Icon name="plus" className="h-3.5 w-3.5" /> New appointment
        </button>
      </div>

      {showNew && (
        <div className="mb-4 grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-500">Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={input} placeholder="Test drive — Fronx Sigma" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Starts</label>
            <input type="datetime-local" value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={input} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Duration (minutes)</label>
            <input type="number" min={5} step={5} value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} className={input} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Contact</label>
            <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className={input}>
              <option value="">— none —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phoneE164}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Assigned to</label>
            <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className={input}>
              <option value="">— unassigned —</option>
              {members.map((m) => <option key={m.userId ?? m.id} value={m.userId ?? m.id}>{m.name ?? m.email}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              className={input} placeholder="Delhi showroom" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Remind (minutes before)</label>
            <input type="number" min={0} value={form.reminderMinutesBefore}
              onChange={(e) => setForm({ ...form, reminderMinutesBefore: Number(e.target.value) })} className={input} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={create} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Create</button>
            <button onClick={() => setShowNew(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {byDay.map(([day, list]) => (
          <div key={day}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">{day}</div>
            <div className="space-y-2">
              {list.map((a) => (
                <div key={a.id} className="lq-card flex flex-wrap items-center gap-3 p-3">
                  <div className="w-16 shrink-0 text-sm font-semibold">
                    {new Date(a.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.title}</div>
                    <div className="text-[11px] text-zinc-400">
                      {a.durationMinutes} min
                      {a.contactName ? ` · ${a.contactName}` : ""}
                      {a.location ? ` · ${a.location}` : ""}
                      {a.assigneeName ? ` · ${a.assigneeName}` : ""}
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${statusColor[a.status]}`}>
                    {a.status.replace("_", " ")}
                  </span>
                  <select value={a.status} onChange={(e) => setStatus(a, e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
        {appts.length === 0 && (
          <div className="lq-card p-10 text-center text-sm text-zinc-400">Nothing booked yet.</div>
        )}
      </div>
    </div>
  );
}
