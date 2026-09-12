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
  const [form, setForm] = useState({ name: "", templateId: "", segment: segments[0], dailyLimit: 250, scheduledAt: "" });
  const [kind, setKind] = useState<"single" | "drip">("single");
  const [smsFallback, setSmsFallback] = useState(false);
  const [steps, setSteps] = useState<{ templateId: string; delayHours: number }[]>([{ templateId: "", delayHours: 0 }]);
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
    if (!form.name.trim()) return;
    if (kind === "single" && !form.templateId) return;
    if (kind === "drip" && steps.some((s) => !s.templateId)) return;
    setSaving(true);
    try {
      await apiFetch("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          templateId: kind === "drip" ? steps[0].templateId : form.templateId,
          kind, smsFallback,
          steps: kind === "drip" ? steps : undefined,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
        }),
      });
      setForm({ name: "", templateId: "", segment: segments[0], dailyLimit: 250, scheduledAt: "" });
      setKind("single"); setSmsFallback(false); setSteps([{ templateId: "", delayHours: 0 }]);
      setShowNew(false);
      await load();
    } finally { setSaving(false); }
  }

  function updateStep(i: number, patch: Partial<{ templateId: string; delayHours: number }>) {
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...patch } : step)));
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
          <div className="flex gap-1 rounded-md bg-zinc-100 p-1 text-sm w-fit">
            <button onClick={() => setKind("single")}
              className={`rounded px-3 py-1 ${kind === "single" ? "bg-white shadow-sm font-medium" : "text-zinc-500"}`}>Single message</button>
            <button onClick={() => setKind("drip")}
              className={`rounded px-3 py-1 ${kind === "drip" ? "bg-white shadow-sm font-medium" : "text-zinc-500"}`}>Drip sequence</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500">Campaign name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="e.g. Diwali Sale Blast" />
            </div>
            {kind === "single" && (
              <div>
                <label className="block text-xs text-zinc-500">Template (approved only)</label>
                <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                  <option value="">Select template…</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-zinc-500">Segment</label>
              <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                {segments.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Daily send limit</label>
              <input type="number" min={1} value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
              <p className="mt-1 text-[11px] text-zinc-400">Sends are staggered across days at this cap — protects your Meta quality rating on large lists.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Schedule (leave blank to start sending now)</label>
              <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            </div>
          </div>

          {kind === "drip" && (
            <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-600">Sequence steps — sent in order, each after its own delay from the previous step. A reply from the contact pauses them in the sequence automatically.</p>
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 text-xs text-zinc-400">#{i + 1}</span>
                  <select value={step.templateId} onChange={(e) => updateStep(i, { templateId: e.target.value })}
                    className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm">
                    <option value="">Select template…</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input type="number" min={0} value={step.delayHours} onChange={(e) => updateStep(i, { delayHours: Number(e.target.value) })}
                    className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm" title="Delay in hours after the previous step" />
                  <span className="text-xs text-zinc-400">hrs after prev.</span>
                  {steps.length > 1 && (
                    <button onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))} className="text-xs text-red-500 hover:underline">Remove</button>
                  )}
                </div>
              ))}
              <button onClick={() => setSteps((s) => [...s, { templateId: "", delayHours: 24 }])}
                className="text-xs text-emerald-600 hover:underline">+ Add step</button>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-zinc-600">
            <input type="checkbox" checked={smsFallback} onChange={(e) => setSmsFallback(e.target.checked)} />
            Fall back to SMS if a WhatsApp send fails (requires an SMS provider configured on the server — MSG91 or Twilio)
          </label>

          <p className="text-xs text-zinc-400">Audience is resolved for real when you save: every opted-in contact for &quot;All opted-in contacts&quot;, or every opted-in contact carrying that exact tag for the other segments — no estimate, no placeholder count.</p>
          <div className="flex gap-2">
            <button onClick={create} disabled={saving || (kind === "single" ? !form.templateId : steps.some((s) => !s.templateId))}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {saving ? "Saving…" : form.scheduledAt ? "Schedule" : "Start sending"}
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
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Template</th>
              <th className="px-4 py-2 font-medium">Segment</th>
              <th className="px-4 py-2 font-medium">Audience</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Scheduled</th>
              <th className="px-4 py-2 font-medium">Daily cap</th>
              <th className="px-4 py-2 font-medium">Funnel (Sent · Delivered · Read · Failed · Queued)</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => (
              <tr key={b.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-2 font-medium">{b.name}</td>
                <td className="px-4 py-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 ${b.kind === "drip" ? "bg-violet-50 text-violet-700" : "bg-zinc-100 text-zinc-600"}`}>
                    {b.kind === "drip" ? `Drip · ${b.steps.length} steps` : "Single"}
                  </span>
                  {b.smsFallback && <span className="ml-1 rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">SMS fallback</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-600">{templateName(b.templateId)}</td>
                <td className="px-4 py-2 text-zinc-600">{b.segment}</td>
                <td className="px-4 py-2 text-zinc-600">{b.audienceCount.toLocaleString()}</td>
                <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-xs capitalize ${statusColor[b.status]}`}>{b.status}</span></td>
                <td className="px-4 py-2 text-xs text-zinc-400">{fmt(b.scheduledAt)}</td>
                <td className="px-4 py-2 text-xs text-zinc-500">{b.dailyLimit}/day</td>
                <td className="px-4 py-2 text-xs">
                  <div className="flex flex-wrap gap-1">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">Sent {b.funnel.sent}</span>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">Delivered {b.funnel.delivered}</span>
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">Read {b.funnel.read}</span>
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">Failed {b.funnel.failed}</span>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Queued {b.funnel.queued}</span>
                  </div>
                </td>
              </tr>
            ))}
            {broadcasts.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-400">No broadcasts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
