"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { Company } from "@/lib/types";

const inputCls = "mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm";

function NewCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setError("Company name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/companies", { method: "POST", body: JSON.stringify({ name: name.trim(), domain, industry, phone }) });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create company");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30">
      <div className="w-[420px] rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New company</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-zinc-600">Name
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
          </label>
          <label className="block text-xs font-medium text-zinc-600">Domain
            <input className={inputCls} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
          </label>
          <label className="block text-xs font-medium text-zinc-600">Industry
            <input className={inputCls} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Retail" />
          </label>
          <label className="block text-xs font-medium text-zinc-600">Phone
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-between pt-1">
            <button onClick={onClose} className="text-xs text-zinc-400 hover:underline">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? "Creating…" : "Create company"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompaniesView() {
  const [rows, setRows] = useState<Company[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(() => { apiFetch("/companies").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = (rows ?? []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Companies</h1>
        <button onClick={() => setShowNew(true)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + Add company
        </button>
      </div>
      <input className="mb-3 w-full max-w-sm rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        placeholder="Search companies…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Industry</th>
              <th className="px-4 py-2 font-medium">Domain</th>
              <th className="px-4 py-2 font-medium">Contacts</th>
              <th className="px-4 py-2 font-medium">Open deals</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/companies/${c.id}`} className="text-emerald-700 hover:underline">{c.name}</Link>
                </td>
                <td className="px-4 py-2 text-zinc-600">{c.industry || "—"}</td>
                <td className="px-4 py-2 text-zinc-600">{c.domain || "—"}</td>
                <td className="px-4 py-2 text-zinc-600">{c.contactCount}</td>
                <td className="px-4 py-2 text-zinc-600">{c.openDealCount}</td>
              </tr>
            ))}
            {rows !== null && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-zinc-400">No companies yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {showNew && <NewCompanyModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
}
