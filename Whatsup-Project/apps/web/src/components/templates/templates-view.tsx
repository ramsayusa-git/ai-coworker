"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Template, TemplateCategory } from "@/lib/types";
import { apiFetch } from "@/lib/api";

const statusColor: Record<Template["status"], string> = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  draft: "bg-zinc-100 text-zinc-600",
};
const categoryColor: Record<TemplateCategory, string> = {
  marketing: "bg-purple-100 text-purple-700",
  utility: "bg-sky-100 text-sky-700",
  authentication: "bg-zinc-800 text-white",
};
const qualityDot: Record<NonNullable<Template["quality"]>, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500",
};

function render(body: string, vars: string[]) {
  let out = body;
  vars.forEach((v, i) => { out = out.replace(`{{${v}}}`, `[${v || `var${i + 1}`}]`); });
  return out.replace(/\{\{\w+\}\}/g, (m) => `[${m}]`);
}

export function TemplatesView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [status, setStatus] = useState<Template["status"] | "all">("all");
  const [channel, setChannel] = useState<Template["channel"] | "all">("all");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", category: "utility" as TemplateCategory, body: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setTemplates(await apiFetch("/templates"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => templates
      .filter((t) => status === "all" || t.status === status)
      .filter((t) => channel === "all" || t.channel === channel),
    [templates, status, channel]
  );

  const previewVars = useMemo(() => Array.from(form.body.matchAll(/\{\{(\w*)\}\}/g)).map((m) => m[1]), [form.body]);

  async function create() {
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/templates", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", category: "utility", body: "" });
      setShowNew(false);
      await load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <button onClick={() => setShowNew((s) => !s)}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + New template
        </button>
      </div>

      {showNew && (
        <div className="mb-4 grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-500">Name (snake_case)</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="order_shipped" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TemplateCategory })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                <option value="utility">Utility</option>
                <option value="marketing">Marketing</option>
                <option value="authentication">Authentication</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Body — use {"{{1}}"} for variables</label>
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="Hi {{1}}, your order has shipped." />
            </div>
            <div className="flex gap-2">
              <button onClick={create} disabled={saving}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
                {saving ? "Submitting…" : "Submit for review"}
              </button>
              <button onClick={() => setShowNew(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-zinc-500">WhatsApp preview</div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <div className="max-w-[85%] rounded-2xl bg-white px-3 py-2 text-sm shadow-sm">
                {form.body ? render(form.body, previewVars) : <span className="text-zinc-400">Preview will appear here…</span>}
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-400">Submitted templates go to &quot;pending&quot; and are reviewed by Meta (typically minutes to a few hours).</p>
          </div>
        </div>
      )}

      <div className="mb-2 flex gap-2">
        {(["all", "whatsapp", "sms"] as const).map((c) => (
          <button key={c} onClick={() => setChannel(c)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${channel === c ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {c === "all" ? "All channels" : c}
          </button>
        ))}
      </div>
      <div className="mb-3 flex gap-2">
        {(["all", "approved", "pending", "rejected", "draft"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${status === s ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((t) => (
          <div key={t.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-sm font-medium">{t.name}</div>
                <div className="mt-1 flex gap-1">
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${t.channel === "sms" ? "bg-indigo-100 text-indigo-700" : "bg-green-100 text-green-700"}`}>{t.channel}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${categoryColor[t.category]}`}>{t.category}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${statusColor[t.status]}`}>{t.status}</span>
                </div>
              </div>
              {t.quality && (
                <div className="flex items-center gap-1 text-xs text-zinc-400">
                  <span className={`h-2 w-2 rounded-full ${qualityDot[t.quality]}`} /> {t.quality}
                </div>
              )}
            </div>
            <p className="mt-3 rounded-md bg-zinc-50 p-2 text-sm text-zinc-700">{t.body}</p>
            {t.status === "rejected" && t.rejectionReason && (
              <p className="mt-2 text-xs text-red-600">Rejected: {t.rejectionReason}</p>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-400">
            No templates in this status.
          </div>
        )}
      </div>
    </div>
  );
}
