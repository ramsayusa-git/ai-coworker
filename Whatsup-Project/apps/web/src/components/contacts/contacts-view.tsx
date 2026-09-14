"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ContactFull } from "@/lib/types";
import { apiFetch, getToken, getCachedMe } from "@/lib/api";
import { HelpLink } from "@/components/help-link";

type Row = ContactFull & { companyName?: string | null };

type ApiContact = {
  id: string; name: string; phoneE164: string; email: string | null; companyName?: string | null;
  tags: string[]; stage: ContactFull["stage"]; optIn: boolean;
  createdAt: string; lastContactedAt: string;
};

function fromApi(c: ApiContact): Row {
  return { id: c.id, name: c.name, phone: c.phoneE164, email: c.email ?? undefined, companyName: c.companyName,
    tags: c.tags ?? [], stage: c.stage, optIn: c.optIn, createdAt: c.createdAt, lastContactedAt: c.lastContactedAt };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
  const [contacts, setContacts] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<ContactFull["stage"] | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function exportCsv() {
    const token = getToken();
    const orgId = getCachedMe()?.orgId;
    const res = await fetch(`${API_BASE}/v1/orgs/${orgId}/contacts/export.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // Minimal CSV parser: handles quoted fields with embedded commas — good enough for a
  // contacts export/import round-trip and typical spreadsheet exports (Excel/Sheets/CRM).
  function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some((f) => f !== "")) rows.push(row);
        row = [];
      } else field += ch;
    }
    if (field || row.length) { row.push(field); if (row.some((f) => f !== "")) rows.push(row); }
    return rows;
  }

  async function importCsvFile(file: File) {
    setImportMsg("Importing…");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) { setImportMsg("No data rows found in that file."); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (name: string) => header.findIndex((h) => h === name);
      const nameIdx = idx("name"), phoneIdx = idx("phone") >= 0 ? idx("phone") : idx("phonee164");
      if (nameIdx < 0 || phoneIdx < 0) { setImportMsg("CSV needs at least Name and Phone columns."); return; }
      const emailIdx = idx("email"), companyIdx = idx("company"), tagsIdx = idx("tags"), stageIdx = idx("stage"), sourceIdx = idx("source");
      const payload = rows.slice(1).map((r) => ({
        name: r[nameIdx], phoneE164: r[phoneIdx],
        email: emailIdx >= 0 ? r[emailIdx] : undefined,
        companyName: companyIdx >= 0 ? r[companyIdx] : undefined,
        tags: tagsIdx >= 0 && r[tagsIdx] ? r[tagsIdx].split(";").map((t) => t.trim()).filter(Boolean) : undefined,
        stage: stageIdx >= 0 ? r[stageIdx] : undefined,
        source: sourceIdx >= 0 ? r[sourceIdx] : undefined,
      }));
      const result = await apiFetch("/contacts/import", { method: "POST", body: JSON.stringify({ rows: payload }) });
      setImportMsg(`Imported: ${result.created} new, ${result.updated} updated, ${result.skipped} skipped.`);
      await load();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Import failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <div className="flex items-center gap-2">
          <HelpLink anchor="contacts" />
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsvFile(f); e.target.value = ""; }} />
          <button onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
            Import CSV
          </button>
          <button onClick={exportCsv}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
            Export CSV
          </button>
          <button onClick={() => setShowAdd((s) => !s)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            + Add contact
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {importMsg}
          <button onClick={() => setImportMsg(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

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
              <th className="px-4 py-2 font-medium">Company</th>
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
                <td className="px-4 py-2 font-medium">
                  <Link href={`/contacts/${c.id}`} className="text-emerald-700 hover:underline">{c.name}</Link>
                </td>
                <td className="px-4 py-2 text-zinc-600">{c.companyName || "—"}</td>
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
              <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400">No contacts match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
