"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Flow, Template, TemplateCategory } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { HelpLink } from "@/components/help-link";
import { InteractiveBuilder, emptyInteractive, type InteractiveDraft } from "./interactive-builder";
import { InteractiveBubble } from "./interactive-preview";

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
const typeBadge: Record<string, string> = {
  buttons: "bg-amber-100 text-amber-700",
  list: "bg-teal-100 text-teal-700",
  catalog: "bg-fuchsia-100 text-fuchsia-700",
  flow: "bg-blue-100 text-blue-700",
};

function render(body: string, vars: string[]) {
  let out = body;
  vars.forEach((v, i) => { out = out.replace(`{{${v}}}`, `[${v || `var${i + 1}`}]`); });
  return out.replace(/\{\{\w+\}\}/g, (m) => `[${m}]`);
}

function draftFrom(t: Template): InteractiveDraft {
  return {
    headerType: (t.headerType ?? "none") as InteractiveDraft["headerType"],
    headerText: t.headerText ?? "",
    headerMediaUrl: t.headerMediaUrl ?? "",
    footer: t.footer ?? "",
    interactiveType: t.interactiveType ?? "none",
    buttons: t.buttons ?? [],
    listButtonText: t.listButtonText ?? "Select",
    listSections: t.listSections?.length ? t.listSections : [{ title: "Options", rows: [] }],
    catalogId: t.catalogId ?? "",
    catalogSections: t.catalogSections?.length ? t.catalogSections : [{ title: "Products", productRetailerIds: [] }],
    flowId: t.flowId ?? "",
    flowCtaText: t.flowCtaText ?? "Open",
  };
}

export function TemplatesView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [status, setStatus] = useState<Template["status"] | "all">("all");
  const [channel, setChannel] = useState<Template["channel"] | "all">("all");
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "utility" as TemplateCategory, body: "", channel: "whatsapp" as Template["channel"] });
  const [interactive, setInteractive] = useState<InteractiveDraft>(emptyInteractive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTemplates(await apiFetch("/templates"));
    try { setFlows(await apiFetch("/flows")); } catch { setFlows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => templates
      .filter((t) => status === "all" || t.status === status)
      .filter((t) => channel === "all" || t.channel === channel),
    [templates, status, channel]
  );

  const previewVars = useMemo(() => Array.from(form.body.matchAll(/\{\{(\w*)\}\}/g)).map((m) => m[1]), [form.body]);

  function resetForm() {
    setForm({ name: "", category: "utility", body: "", channel: "whatsapp" });
    setInteractive(emptyInteractive);
    setEditingId(null);
    setError(null);
  }

  function startEdit(t: Template) {
    setForm({ name: t.name, category: t.category, body: t.body, channel: t.channel });
    setInteractive(draftFrom(t));
    setEditingId(t.id);
    setShowNew(true);
    setError(null);
  }

  async function save() {
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    setError(null);
    // SMS templates are plain text by definition — never send interactive fields for them.
    const payload = form.channel === "sms"
      ? { ...form, interactiveType: "none" }
      : { ...form, ...interactive, flowId: interactive.flowId || null };
    try {
      if (editingId) {
        await apiFetch(`/templates/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/templates", { method: "POST", body: JSON.stringify(payload) });
      }
      resetForm();
      setShowNew(false);
      await load();
    } catch (e) {
      // The API returns WhatsApp's own component limits as plain messages — surface them.
      const raw = e instanceof Error ? e.message : String(e);
      const match = raw.match(/\{.*\}/);
      setError(match ? (JSON.parse(match[0]).error ?? raw) : raw);
    } finally { setSaving(false); }
  }

  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    await apiFetch(`/templates/${t.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <div className="flex items-center gap-2">
          <HelpLink anchor="templates" />
          <button onClick={() => { resetForm(); setShowNew((s) => !s); }}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            + New template
          </button>
        </div>
      </div>

      {showNew && (
        <div className="mb-4 grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-zinc-500">Name (snake_case)</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="order_shipped" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500">Channel</label>
                <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Template["channel"] })}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TemplateCategory })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                <option value="utility">Utility</option>
                <option value="marketing">Marketing</option>
                <option value="authentication">Authentication</option>
              </select>
              <p className="mt-1 text-[11px] text-zinc-400">
                Category decides what Meta charges per conversation — see Settings &gt; Billing for your rate card.
              </p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Body — use {"{{1}}"} for variables</label>
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="Hi {{1}}, your order has shipped." />
            </div>

            {form.channel === "whatsapp" && (
              <InteractiveBuilder value={interactive} onChange={setInteractive} flows={flows} />
            )}

            {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}

            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
                {saving ? "Saving…" : editingId ? "Save changes" : "Submit for review"}
              </button>
              <button onClick={() => { resetForm(); setShowNew(false); }} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-zinc-500">WhatsApp preview</div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <InteractiveBubble
                body={form.body ? render(form.body, previewVars) : ""}
                spec={form.channel === "sms" ? { interactiveType: "none" } : interactive}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {editingId
                ? "Editing the content of an approved WhatsApp template sends it back to Meta for review."
                : "Submitted templates go to “pending” and are reviewed by Meta (typically minutes to a few hours)."}
            </p>
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
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${t.channel === "sms" ? "bg-indigo-100 text-indigo-700" : "bg-green-100 text-green-700"}`}>{t.channel}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${categoryColor[t.category]}`}>{t.category}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${statusColor[t.status]}`}>{t.status}</span>
                  {t.interactiveType && t.interactiveType !== "none" && (
                    <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${typeBadge[t.interactiveType] ?? "bg-zinc-100 text-zinc-600"}`}>
                      {t.interactiveType === "catalog" ? "catalogue" : t.interactiveType}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <button onClick={() => startEdit(t)} className="text-zinc-500 hover:text-emerald-700">Edit</button>
                <button onClick={() => remove(t)} className="text-zinc-400 hover:text-red-600">Delete</button>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-emerald-50 p-3">
              <InteractiveBubble body={t.body} spec={t} />
            </div>
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
