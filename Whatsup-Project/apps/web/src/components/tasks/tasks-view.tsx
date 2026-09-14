"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, getCachedMe } from "@/lib/api";
import type { CrmTask, TaskType } from "@/lib/types";

const inputCls = "mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm";
const TYPE_ICON: Record<TaskType, string> = { call: "📞", whatsapp: "💬", meeting: "🗓️", follow_up: "🔁", other: "📌" };

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("follow_up");
  const [dueAt, setDueAt] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/tasks", { method: "POST", body: JSON.stringify({ title: title.trim(), type, dueAt: dueAt || undefined, description }) });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30">
      <div className="w-[420px] rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New task</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-zinc-600">Title
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call Priya about renewal" />
          </label>
          <label className="block text-xs font-medium text-zinc-600">Type
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              <option value="follow_up">Follow-up</option>
              <option value="call">Call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="meeting">Meeting</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-zinc-600">Due
            <input type="datetime-local" className={inputCls} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-zinc-600">Notes
            <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <button onClick={onClose} className="text-xs text-zinc-400 hover:underline">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? "Creating…" : "Create task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isOverdue(t: CrmTask) {
  return t.status === "open" && !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
}

export function TasksView() {
  const [rows, setRows] = useState<CrmTask[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [scope, setScope] = useState<"all" | "mine" | "open" | "done">("open");
  const me = getCachedMe();

  const load = useCallback(() => {
    const q = scope === "mine" ? "?mine=1" : scope === "open" || scope === "done" ? `?status=${scope}` : "";
    apiFetch(`/tasks${q}`).then(setRows).catch(() => setRows([]));
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  async function toggleDone(t: CrmTask) {
    setRows((prev) => prev?.map((r) => (r.id === t.id ? { ...r, status: t.status === "done" ? "open" : "done" } : r)) ?? null);
    await apiFetch(`/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: t.status === "done" ? "open" : "done" }) }).catch(load);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <button onClick={() => setShowNew(true)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + New task
        </button>
      </div>
      <div className="mb-3 flex gap-1">
        {(["open", "mine", "done", "all"] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${scope === s ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {s === "open" ? "Open" : s === "mine" ? "My tasks" : s === "done" ? "Done" : "All"}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {(rows ?? []).map((t) => (
          <div key={t.id} className={`flex items-start gap-3 rounded-lg border bg-white p-3 ${isOverdue(t) ? "border-red-200" : "border-zinc-200"}`}>
            <input type="checkbox" checked={t.status === "done"} onChange={() => toggleDone(t)} className="mt-1" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span aria-hidden>{TYPE_ICON[t.type]}</span>
                <span className={`text-sm font-medium ${t.status === "done" ? "text-zinc-400 line-through" : "text-zinc-800"}`}>{t.title}</span>
                {isOverdue(t) && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">OVERDUE</span>}
              </div>
              {t.description && <p className="mt-0.5 text-xs text-zinc-500">{t.description}</p>}
              <div className="mt-1 flex gap-3 text-[11px] text-zinc-400">
                {t.dueAt && <span>Due {new Date(t.dueAt).toLocaleString()}</span>}
                {t.contactName && <span>Contact: {t.contactName}</span>}
                {t.dealTitle && <span>Deal: {t.dealTitle}</span>}
                {t.assigneeName && <span>Assigned: {t.assigneeName}{t.assigneeId === me?.userId ? " (you)" : ""}</span>}
              </div>
            </div>
          </div>
        ))}
        {rows !== null && rows.length === 0 && <p className="py-8 text-center text-xs text-zinc-400">No tasks here.</p>}
      </div>
      {showNew && <NewTaskModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
}
