"use client";
import { useCallback, useEffect, useState } from "react";
import type { AutomationRule, AutomationAction, AutomationFilter, Team, Template } from "@/lib/types";
import { apiFetch } from "@/lib/api";

type ActionType = AutomationAction["type"];
const ACTION_LABELS: Record<ActionType, string> = {
  assign_team: "Assign to team", add_tag: "Add tag", send_template: "Send template", change_status: "Change status",
};
const STATUS_OPTIONS = ["open", "pending", "snoozed", "resolved"];

function summarizeFilter(f: AutomationFilter) {
  return `${f.field} ${f.op} "${f.value}"`;
}
function summarizeAction(a: AutomationAction, teams: Team[], templates: Template[]) {
  if (a.type === "assign_team") return `Assign to team: ${teams.find((t) => t.id === a.teamId)?.name ?? a.teamId}`;
  if (a.type === "add_tag") return `Add tag: ${a.tag}`;
  if (a.type === "send_template") return `Send template: ${templates.find((t) => t.id === a.templateId)?.name ?? a.templateId}`;
  return `Change status: ${a.status}`;
}

export function AutomationsView() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<"new_conversation" | "keyword_received">("keyword_received");
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<AutomationFilter[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);

  const load = useCallback(async () => { setRules(await apiFetch("/automations")); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiFetch("/teams").then(setTeams).catch(() => setTeams([]));
    apiFetch("/templates").then(setTemplates).catch(() => setTemplates([]));
  }, []);

  function resetForm() {
    setName(""); setTriggerType("keyword_received"); setKeyword(""); setFilters([]); setActions([]);
  }

  async function create() {
    if (!name.trim()) return;
    if (triggerType === "keyword_received" && !keyword.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/automations", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(), triggerType,
          triggerConfig: triggerType === "keyword_received" ? { keyword: keyword.trim() } : {},
          filters, actions,
        }),
      });
      resetForm();
      setShowNew(false);
      await load();
    } finally { setSaving(false); }
  }

  async function toggle(rule: AutomationRule) {
    await apiFetch(`/automations/${rule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) });
    await load();
  }
  async function remove(id: string) {
    await apiFetch(`/automations/${id}`, { method: "DELETE" });
    await load();
  }

  function addFilter() { setFilters((f) => [...f, { field: "tag", op: "eq", value: "" }]); }
  function updateFilter(i: number, patch: Partial<AutomationFilter>) {
    setFilters((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addAction() { setActions((a) => [...a, { type: "add_tag", tag: "" }]); }
  function updateActionType(i: number, type: ActionType) {
    setActions((a) => a.map((row, idx) => {
      if (idx !== i) return row;
      if (type === "assign_team") return { type, teamId: teams[0]?.id ?? "" };
      if (type === "add_tag") return { type, tag: "" };
      if (type === "send_template") return { type, templateId: templates[0]?.id ?? "" };
      return { type, status: "resolved" };
    }));
  }
  function updateActionField(i: number, patch: Record<string, string>) {
    setActions((a) => a.map((row, idx) => (idx === i ? { ...row, ...patch } as AutomationAction : row)));
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Automations</h1>
        <button onClick={() => setShowNew((s) => !s)}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + New rule
        </button>
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        Trigger → filter → action rules, evaluated live against real inbound WhatsApp messages — Wati&apos;s Automations &quot;Rules&quot; pattern.
        Distinct from Bots (a conversational flow), this reacts to events: a new conversation starting, or a keyword appearing in a message.
      </p>

      {showNew && (
        <div className="mb-4 space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500">Rule name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="e.g. Route refund requests" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Trigger</label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as any)}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                <option value="keyword_received">Keyword received in a message</option>
                <option value="new_conversation">New conversation started</option>
              </select>
            </div>
            {triggerType === "keyword_received" && (
              <div>
                <label className="block text-xs text-zinc-500">Keyword (case-insensitive, matched anywhere in the message)</label>
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="refund" />
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-600">Filters (all must match — leave empty to match every conversation)</p>
              <button onClick={addFilter} className="text-xs text-emerald-600 hover:underline">+ Add filter</button>
            </div>
            {filters.map((f, i) => (
              <div key={i} className="mb-1 flex items-center gap-2">
                <select value={f.field} onChange={(e) => updateFilter(i, { field: e.target.value as any })}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                  <option value="tag">Contact tag</option>
                  <option value="channel">Channel</option>
                </select>
                <select value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value as any })}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                  <option value="eq">is exactly</option>
                  <option value="contains">contains</option>
                </select>
                <input value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })}
                  className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs" placeholder="value" />
                <button onClick={() => setFilters((fs) => fs.filter((_, idx) => idx !== i))} className="text-xs text-red-500 hover:underline">Remove</button>
              </div>
            ))}
            {filters.length === 0 && <p className="text-xs text-zinc-400">No filters — applies to every matching event.</p>}
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-600">Actions (run in order)</p>
              <button onClick={addAction} className="text-xs text-emerald-600 hover:underline">+ Add action</button>
            </div>
            {actions.map((a, i) => (
              <div key={i} className="mb-1 flex items-center gap-2">
                <select value={a.type} onChange={(e) => updateActionType(i, e.target.value as ActionType)}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                  {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => <option key={t} value={t}>{ACTION_LABELS[t]}</option>)}
                </select>
                {a.type === "assign_team" && (
                  <select value={a.teamId} onChange={(e) => updateActionField(i, { teamId: e.target.value })}
                    className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs">
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                {a.type === "add_tag" && (
                  <input value={a.tag} onChange={(e) => updateActionField(i, { tag: e.target.value })}
                    className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs" placeholder="tag value" />
                )}
                {a.type === "send_template" && (
                  <select value={a.templateId} onChange={(e) => updateActionField(i, { templateId: e.target.value })}
                    className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs">
                    {templates.filter((t) => t.status === "approved").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                {a.type === "change_status" && (
                  <select value={a.status} onChange={(e) => updateActionField(i, { status: e.target.value })}
                    className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs">
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                <button onClick={() => setActions((as) => as.filter((_, idx) => idx !== i))} className="text-xs text-red-500 hover:underline">Remove</button>
              </div>
            ))}
            {actions.length === 0 && <p className="text-xs text-zinc-400">No actions yet — add at least one.</p>}
          </div>

          <div className="flex gap-2">
            <button onClick={create} disabled={saving || !name.trim() || actions.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {saving ? "Saving…" : "Create rule"}
            </button>
            <button onClick={() => { setShowNew(false); resetForm(); }} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r.id} className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => toggle(r)}
                  className={`rounded-full px-2 py-0.5 text-xs ${r.enabled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                  {r.enabled ? "Enabled" : "Disabled"}
                </button>
                <span className="text-sm font-medium">{r.name}</span>
              </div>
              <button onClick={() => remove(r.id)} className="text-xs text-red-500 hover:underline">Delete</button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Trigger: {r.triggerType === "keyword_received" ? `keyword "${r.triggerConfig.keyword}" received` : "new conversation started"}
              {r.filters.length > 0 && <> · Filters: {r.filters.map(summarizeFilter).join(", ")}</>}
            </p>
            <p className="mt-1 text-xs text-zinc-600">Actions: {r.actions.map((a) => summarizeAction(a, teams, templates)).join(" → ") || "none"}</p>
          </div>
        ))}
        {rules.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-400">
            No automation rules yet.
          </div>
        )}
      </div>
    </div>
  );
}
