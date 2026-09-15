"use client";
import { useCallback, useEffect, useState } from "react";
import type { Flow, FlowField, FlowResponseRow, FlowScreen } from "@/lib/types";
import { apiFetch } from "@/lib/api";

const FIELD_TYPES = [
  ["text", "Short text"], ["textarea", "Long text"], ["email", "Email"], ["number", "Number"],
  ["phone", "Phone"], ["date", "Date picker"], ["dropdown", "Dropdown"], ["radio", "Single choice"],
  ["checkbox", "Multi choice"], ["optin", "Opt-in checkbox"],
] as const;

const CATEGORIES = [
  "SIGN_UP", "SIGN_IN", "APPOINTMENT_BOOKING", "LEAD_GENERATION",
  "CONTACT_US", "CUSTOMER_SUPPORT", "SURVEY", "OTHER",
];

const input = "w-full rounded-md border border-zinc-300 px-2 py-1 text-sm";
const statusColor: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  published: "bg-emerald-100 text-emerald-700",
  deprecated: "bg-red-100 text-red-700",
};

function slug(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "SCREEN";
}

export function FlowsView() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selected, setSelected] = useState<Flow | null>(null);
  const [responses, setResponses] = useState<FlowResponseRow[]>([]);
  const [tab, setTab] = useState<"build" | "responses">("build");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const rows: Flow[] = await apiFetch("/flows");
    setFlows(rows);
    setSelected((cur) => (cur ? rows.find((f) => f.id === cur.id) ?? null : null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openFlow = useCallback(async (id: string) => {
    const full = await apiFetch(`/flows/${id}`);
    setSelected(full);
    setResponses(full.responses ?? []);
    setNotice(full.publishError ? { kind: "err", text: full.publishError } : null);
    setTab("build");
  }, []);

  async function createFlow() {
    const name = prompt("Flow name", "Book a Service");
    if (!name?.trim()) return;
    const created = await apiFetch("/flows", { method: "POST", body: JSON.stringify({ name: name.trim(), categories: ["APPOINTMENT_BOOKING"] }) });
    await load();
    await openFlow(created.id);
  }

  function patchSelected(patch: Partial<Flow>) {
    setSelected((f) => (f ? { ...f, ...patch } : f));
  }

  function patchScreen(si: number, patch: Partial<FlowScreen>) {
    if (!selected) return;
    patchSelected({ screens: selected.screens.map((s, i) => (i === si ? { ...s, ...patch } : s)) });
  }

  function patchField(si: number, fi: number, patch: Partial<FlowField>) {
    if (!selected) return;
    patchScreen(si, { fields: selected.screens[si].fields.map((f, i) => (i === fi ? { ...f, ...patch } : f)) });
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/flows/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: selected.name, categories: selected.categories, screens: selected.screens }),
      });
      await load();
      setNotice({ kind: "ok", text: "Saved." });
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    try {
      await save();
      const res = await apiFetch(`/flows/${selected.id}/publish`, { method: "POST" });
      setNotice({ kind: "ok", text: `Published to Meta (flow id ${res.metaFlowId}).` });
      await load();
      await openFlow(selected.id);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const m = raw.match(/\{.*\}/);
      setNotice({ kind: "err", text: m ? (JSON.parse(m[0]).message ?? raw) : raw });
    } finally { setBusy(false); }
  }

  async function remove(f: Flow) {
    if (!confirm(`Delete flow "${f.name}"?`)) return;
    await apiFetch(`/flows/${f.id}`, { method: "DELETE" });
    setSelected(null);
    await load();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">WhatsApp Flows</h1>
          <p className="text-sm text-zinc-500">
            Native in-chat forms — booking, lead capture, surveys — that customers fill in without leaving WhatsApp.
          </p>
        </div>
        <button onClick={createFlow} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + New flow
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          {flows.map((f) => (
            <button key={f.id} onClick={() => openFlow(f.id)}
              className={`w-full rounded-lg border p-3 text-left ${selected?.id === f.id ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}>
              <div className="text-sm font-medium">{f.name}</div>
              <div className="mt-1 flex items-center gap-1">
                <span className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${statusColor[f.status]}`}>{f.status}</span>
                <span className="text-[11px] text-zinc-400">{f.screens?.length ?? 0} screen{(f.screens?.length ?? 0) === 1 ? "" : "s"}</span>
              </div>
            </button>
          ))}
          {flows.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-400">
              No flows yet.
            </div>
          )}
        </div>

        {!selected ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-400">
            Select a flow to edit it, or create one.
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={selected.name} onChange={(e) => patchSelected({ name: e.target.value })}
                className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium" />
              <select value={selected.categories?.[0] ?? "OTHER"} onChange={(e) => patchSelected({ categories: [e.target.value] })}
                className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ").toLowerCase()}</option>)}
              </select>
              <button onClick={save} disabled={busy} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40">Save</button>
              <button onClick={publish} disabled={busy}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
                {selected.status === "published" ? "Republish to Meta" : "Publish to Meta"}
              </button>
              <button onClick={() => remove(selected)} className="text-xs text-zinc-400 hover:text-red-600">Delete</button>
            </div>

            {notice && (
              <p className={`mb-3 rounded-md px-2 py-1 text-xs ${notice.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {notice.text}
              </p>
            )}
            {selected.metaFlowId && (
              <p className="mb-3 text-xs text-zinc-400">Meta flow id: <span className="font-mono">{selected.metaFlowId}</span></p>
            )}

            <div className="mb-3 flex gap-2">
              {(["build", "responses"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-xs capitalize ${tab === t ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                  {t === "responses" ? `Responses (${responses.length})` : "Build"}
                </button>
              ))}
            </div>

            {tab === "build" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  {selected.screens.map((screen, si) => (
                    <div key={si} className="rounded-md border border-zinc-200 p-3">
                      <div className="flex items-center gap-2">
                        <input value={screen.title}
                          onChange={(e) => patchScreen(si, { title: e.target.value, id: screen.id || slug(e.target.value) })}
                          className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm font-medium" placeholder="Screen title" />
                        <input value={screen.ctaLabel ?? ""} onChange={(e) => patchScreen(si, { ctaLabel: e.target.value })}
                          className="w-28 rounded border border-zinc-200 px-2 py-1 text-sm" placeholder="CTA label" />
                        {selected.screens.length > 1 && (
                          <button onClick={() => patchSelected({ screens: selected.screens.filter((_, i) => i !== si) })}
                            className="text-xs text-zinc-400 hover:text-red-600">✕</button>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        Screen id <span className="font-mono">{screen.id || slug(screen.title)}</span>
                        {si === selected.screens.length - 1 ? " · final screen (submits the form)" : " · continues to the next screen"}
                      </div>

                      {screen.fields.map((f, fi) => (
                        <div key={fi} className="mt-2 space-y-1 rounded bg-zinc-50 p-2">
                          <div className="flex items-center gap-1">
                            <input value={f.label}
                              onChange={(e) => patchField(si, fi, { label: e.target.value, name: f.name || e.target.value.toLowerCase().replace(/\W+/g, "_") })}
                              className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm" placeholder="Question label" />
                            <select value={f.type} onChange={(e) => patchField(si, fi, { type: e.target.value })}
                              className="rounded border border-zinc-200 px-1 py-1 text-xs">
                              {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                              <input type="checkbox" checked={f.required ?? false} onChange={(e) => patchField(si, fi, { required: e.target.checked })} />
                              req
                            </label>
                            <button onClick={() => patchScreen(si, { fields: screen.fields.filter((_, i) => i !== fi) })}
                              className="text-xs text-zinc-400 hover:text-red-600">✕</button>
                          </div>
                          {["dropdown", "radio", "checkbox"].includes(f.type) && (
                            <input value={(f.options ?? []).join(", ")}
                              onChange={(e) => patchField(si, fi, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                              className="w-full rounded border border-zinc-200 px-2 py-1 text-xs" placeholder="Options, comma separated" />
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => patchScreen(si, { fields: [...screen.fields, { name: `field_${screen.fields.length + 1}`, label: "", type: "text" }] })}
                        className="mt-2 text-xs text-emerald-700">+ Add field</button>
                    </div>
                  ))}
                  <button
                    onClick={() => patchSelected({
                      screens: [...selected.screens, { id: `SCREEN_${selected.screens.length + 1}`, title: "", fields: [] }],
                    })}
                    className="text-xs text-emerald-700">+ Add screen</button>
                </div>

                <div>
                  <div className="mb-1 text-xs text-zinc-500">Phone preview</div>
                  <div className="space-y-3 rounded-2xl bg-zinc-100 p-4">
                    {selected.screens.map((s, i) => (
                      <div key={i} className="rounded-xl bg-white p-3 shadow-sm">
                        <div className="mb-2 text-sm font-semibold">{s.title || "Untitled screen"}</div>
                        {s.fields.map((f, fi) => (
                          <div key={fi} className="mb-2">
                            <div className="text-[11px] text-zinc-500">{f.label || "Question"}{f.required ? " *" : ""}</div>
                            <div className="mt-0.5 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-400">
                              {["dropdown", "radio", "checkbox"].includes(f.type)
                                ? (f.options ?? []).join(" / ") || "options…"
                                : f.type === "date" ? "dd/mm/yyyy" : f.type}
                            </div>
                          </div>
                        ))}
                        <div className="mt-2 rounded-full bg-emerald-600 py-1.5 text-center text-xs font-medium text-white">
                          {s.ctaLabel || (i === selected.screens.length - 1 ? "Submit" : "Continue")}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    Publishing compiles these screens into Meta&apos;s Flow JSON and uploads it. It needs the channel&apos;s
                    access token and WhatsApp Business Account ID (wabaId) in Channels.
                  </p>
                </div>
              </div>
            )}

            {tab === "responses" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr><th className="py-1">When</th><th>Contact</th><th>Answers</th></tr>
                  </thead>
                  <tbody>
                    {responses.map((r) => (
                      <tr key={r.id} className="border-t border-zinc-100 align-top">
                        <td className="py-2 text-xs text-zinc-500">{new Date(r.createdAt).toLocaleString()}</td>
                        <td className="py-2 text-xs">{r.contactName ?? r.contactPhone ?? "—"}</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(r.answers ?? {})
                              .filter(([k]) => k !== "flow_token")
                              .map(([k, v]) => (
                                <span key={k} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px]">
                                  <span className="text-zinc-500">{k}:</span> {String(v)}
                                </span>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {responses.length === 0 && (
                      <tr><td colSpan={3} className="py-8 text-center text-sm text-zinc-400">No submissions yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
