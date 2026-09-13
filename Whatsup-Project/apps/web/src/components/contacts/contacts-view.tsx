"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContactFull } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { HelpLink } from "@/components/help-link";

type ApiContact = {
  id: string; name: string; phoneE164: string; email: string | null;
  tags: string[]; stage: ContactFull["stage"]; optIn: boolean;
  createdAt: string; lastContactedAt: string;
};

function fromApi(c: ApiContact): ContactFull {
  return { id: c.id, name: c.name, phone: c.phoneE164, email: c.email ?? undefined,
    tags: c.tags ?? [], stage: c.stage, optIn: c.optIn, createdAt: c.createdAt, lastContactedAt: c.lastContactedAt };
}

const stageColor: Record<ContactFull["stage"], string> = {
  lead: "bg-amber-100 text-amber-700",
  customer: "bg-sky-100 text-sky-700",
  vip: "bg-purple-100 text-purple-700",
};

function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function ContactsView() {
  const [contacts, setContacts] = useState<ContactFull[]>([]);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<ContactFull["stage"] | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const rows: ApiContact[] = await apiFetch("/contacts");
    setContacts(rows.map(fromApi));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const matchStage = stage === "all" || c.stage === stage;
      const q = query.trim().toLowerCase();
      const matchQuery = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.tags.some((t) => t.includes(q));
      return matchStage && matchQuery;
    });
  }, [contacts, query, stage]);

  async function addContact() {
    if (!form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/contacts", {
        method: "POST", body: JSON.stringify({ name: form.name, phoneE164: form.phone, email: form.email || undefined }),
      });
      setForm({ name: "", phone: "", email: "" });
      setShowAdd(false);
      await load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    await apiFetch(`/contacts/${id}`, { method: "DELETE" });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <div className="flex items-center gap-2">
          <HelpLink anchor="contacts" />
          <button onClick={() => setShowAdd((s) => !s)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            + Add contact
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-white p-4">
          <div>
            <label className="block text-xs text-zinc-500">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="Full name" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="+91 …" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Email (optional)</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="name@example.com" />
          </div>
          <button onClick={addContact} disabled={saving}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setShowAdd(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">
            Cancel
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, tag…"
          className="w-64 rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        {(["all", "lead", "customer", "vip"] as const).map((s) => (
          <button key={s} onClick={() => setStage(s)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${stage === s ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-400">{filtered.length} contacts</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 font-medium">Tags</th>
              <th className="px-4 py-2 font-medium">Opt-in</th>
              <th className="px-4 py-2 font-medium">Last contacted</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2 text-zinc-600">{c.phone}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${stageColor[c.stage]}`}>{c.stage}</span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.map((t) => <span key={t} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{t}</span>)}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs ${c.optIn ? "text-emerald-600" : "text-red-500"}`}>{c.optIn ? "Opted in" : "Opted out"}</span>
                </td>
                <td className="px-4 py-2 text-xs text-zinc-400">{timeAgo(c.lastContactedAt)}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => remove(c.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">No contacts match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
