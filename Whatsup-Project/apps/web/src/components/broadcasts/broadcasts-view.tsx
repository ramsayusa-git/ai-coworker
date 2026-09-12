"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Broadcast, Template } from "@/lib/types";
import { apiFetch } from "@/lib/api";

const statusColor: Record<Broadcast["status"], string> = {
  draft: "bg-zinc-100 text-zinc-600",
  scheduled: "bg-sky-100 text-sky-700",
  sending: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  paused: "bg-red-100 text-red-700",
};

const segments = ["All opted-in contacts", "Delhi leads", "VIP customers", "Cart abandoned (7d)", "Mumbai customers"];

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function BroadcastsView() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", templateId: "", segment: segments[0], audienceCount: 500, scheduledAt: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [b, t] = await Promise.all([apiFetch("/campaigns"), apiFetch("/templates")]);
    setBroadcasts(b);
    setTemplates(t.filter((tpl: Template) => tpl.status === "approved"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const templateName = useMemo(() => {
    const map = new Map(templates.map((t) => [t.id, t.name]));
    return (id: string) => map.get(id) ?? id;
  }, [templates]);

  async function create() {
    if (!form.name.trim() || !form.templateId) return;
    setSaving(true);
    try {
      await apiFetch("/campaigns", {
        method: "POST",
        body: JSON.stringify({ ...form, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null }),
      });
      setForm({ name: "", templateId: "", segment: segments[0], audienceCount: 500, scheduledAt: "" });
      setShowNew(false);
      await load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Broadcasts</h1>
        <button onClick={() => setShowNew((s) => !s)}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + New broadcast
        </button>
      </div>

      {showNew && (
        <div className="mb-4 space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500">Campaign name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="e.g. Diwali Sale Blast" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Template (approved only)</label>
              <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                <option value="">Select template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Segment</label>
              <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                {segments.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Estimated audience</label>
              <input type="number" value={form.audienceCount} onChange={(e) => setForm({ ...form, audienceCount: Number(e.target.value) })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Schedule (leave blank to save as draft)</label>
              <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            </div>
          </div>
          <p className="text-xs text-zinc-400">Cost estimate: ₹{(form.audienceCount * 0.35).toFixed(2)} (marketing rate ~₹0.35/msg, India). Excludes opted-out and quality-gated contacts at send time.</p>
          <div className="flex gap-2">
            <button onClick={create} disabled={saving || !form.templateId}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {saving ? "Saving…" : form.scheduledAt ? "Schedule" : "Save as draft"}
            </button>
            <button onClick={() => setShowNew(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Campaign</th>
              <th className="px-4 py-2 font-medium">Template</th>
              <th className="px-4 py-2 font-medium">Segment</th>
              <th className="px-4 py-2 font-medium">Audience</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Scheduled</th>
              <th className="px-4 py-2 font-medium">Delivered / Read / Failed</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => (
              <tr key={b.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-2 font-medium">{b.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-600">{templateName(b.templateId)}</td>
                <td className="px-4 py-2 text-zinc-600">{b.segment}</td>
                <td className="px-4 py-2 text-zinc-600">{b.audienceCount.toLocaleString()}</td>
                <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-xs capitalize ${statusColor[b.status]}`}>{b.status}</span></td>
                <td className="px-4 py-2 text-xs text-zinc-400">{fmt(b.scheduledAt)}</td>
                <td className="px-4 py-2 text-xs text-zinc-600">
                  {b.status === "draft" ? "—" : `${b.stats.delivered} / ${b.stats.read} / ${b.stats.failed}`}
                </td>
              </tr>
            ))}
            {broadcasts.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">No broadcasts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
