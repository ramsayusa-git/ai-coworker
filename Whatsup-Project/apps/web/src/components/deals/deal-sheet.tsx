"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Deal } from "@/lib/types";

type ContactOption = { id: string; name: string };

export function DealSheet({
  deal, pipelineId, defaultStageId, onClose, onSaved,
}: {
  deal: Deal | null; pipelineId: string; defaultStageId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(deal?.title ?? "");
  const [valueRupees, setValueRupees] = useState(deal ? String(deal.valuePaise / 100) : "");
  const [contactId, setContactId] = useState(deal?.contactId ?? "");
  const [expectedCloseDate, setExpectedCloseDate] = useState(deal?.expectedCloseDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(deal?.notes ?? "");
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/contacts").then((rows: ContactOption[]) => setContacts(rows)).catch(() => {});
  }, []);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        valuePaise: Math.round(Number(valueRupees || 0) * 100),
        contactId: contactId || null,
        expectedCloseDate: expectedCloseDate || null,
        notes: notes || null,
      };
      if (deal) {
        await apiFetch(`/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/deals", { method: "POST", body: JSON.stringify({ ...body, pipelineId, stageId: defaultStageId }) });
      }
      onSaved();
    } finally { setSaving(false); }
  }

  async function setStatus(status: "won" | "lost" | "open") {
    if (!deal) return;
    await apiFetch(`/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    onSaved();
  }

  async function remove() {
    if (!deal) return;
    await apiFetch(`/deals/${deal.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-96 flex-col overflow-y-auto bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{deal ? "Edit deal" : "New deal"}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-zinc-500">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="e.g. Acme Corp — annual plan" />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-zinc-500">Value (₹)</span>
          <input value={valueRupees} onChange={(e) => setValueRupees(e.target.value)} type="number" min="0"
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="0" />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-zinc-500">Contact</span>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
            <option value="">— none —</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-zinc-500">Expected close date</span>
          <input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-zinc-500">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </label>

        {deal && (
          <div className="mb-4">
            <span className="mb-1 block text-xs text-zinc-500">Status</span>
            <div className="flex gap-2">
              {(["open", "won", "lost"] as const).map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`rounded-full px-3 py-1 text-xs capitalize ${
                    deal.status === s ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-3">
          <button onClick={save} disabled={saving}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
          {deal && (
            <button onClick={remove} className="ml-auto text-xs text-red-500 hover:underline">Delete deal</button>
          )}
        </div>
      </div>
    </div>
  );
}
