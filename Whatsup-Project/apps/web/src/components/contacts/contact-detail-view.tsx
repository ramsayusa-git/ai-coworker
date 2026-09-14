"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { ContactDetail, Company } from "@/lib/types";

const inputCls = "mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm";
const money = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

export function ContactDetailView({ contactId }: { contactId: string }) {
  const [data, setData] = useState<ContactDetail | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", jobTitle: "", companyId: "", stage: "lead", source: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d: ContactDetail = await apiFetch(`/contacts/${contactId}`);
      setData(d);
      setForm({
        name: d.contact.name, email: d.contact.email ?? "", jobTitle: d.contact.jobTitle ?? "",
        companyId: d.contact.companyId ?? "", stage: d.contact.stage, source: d.contact.source ?? "",
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load contact"); }
  }, [contactId]);

  useEffect(() => { load(); apiFetch("/companies").then(setCompanies).catch(() => {}); }, [load]);

  async function save() {
    try {
      await apiFetch(`/contacts/${contactId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name, email: form.email || null, jobTitle: form.jobTitle || null,
          companyId: form.companyId || null, stage: form.stage, source: form.source || null,
        }),
      });
      setEditing(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;
  const { contact, deals, tasks, conversations } = data;

  return (
    <div>
      <Link href="/contacts" className="text-xs text-zinc-400 hover:underline">← Contacts</Link>
      <div className="mt-1 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{contact.name}</h1>
          <p className="text-sm text-zinc-500">{contact.phoneE164}{contact.jobTitle ? ` · ${contact.jobTitle}` : ""}{contact.companyName ? ` · ${contact.companyName}` : ""}</p>
        </div>
        <button onClick={() => setEditing((v) => !v)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="mt-4 grid max-w-lg grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          <label className="text-xs text-zinc-500">Name
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="text-xs text-zinc-500">Email
            <input className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="text-xs text-zinc-500">Job title
            <input className={inputCls} value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          </label>
          <label className="text-xs text-zinc-500">Company
            <select className={inputCls} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              <option value="">— none —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-zinc-500">Stage
            <select className={inputCls} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              <option value="lead">Lead</option>
              <option value="customer">Customer</option>
              <option value="vip">VIP</option>
            </select>
          </label>
          <label className="text-xs text-zinc-500">Source
            <input className={inputCls} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="website, referral…" />
          </label>
          <div className="col-span-2">
            <button onClick={save} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              Save changes
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded bg-zinc-100 px-2 py-1 text-xs capitalize text-zinc-600">{contact.stage}</span>
          {contact.tags.map((t) => <span key={t} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{t}</span>)}
          {contact.source && <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-500">source: {contact.source}</span>}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700">Deals ({deals.length})</h2>
          <div className="space-y-2">
            {deals.map((d) => (
              <div key={d.id} className="rounded-md border border-zinc-200 bg-white p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{d.title}</span>
                  <span className={`text-xs ${d.status === "won" ? "text-emerald-600" : d.status === "lost" ? "text-red-500" : "text-zinc-400"}`}>{d.status}</span>
                </div>
                <div className="text-xs text-zinc-500">{money(d.valuePaise)}</div>
              </div>
            ))}
            {deals.length === 0 && <p className="text-xs text-zinc-400">No deals yet.</p>}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700">Tasks ({tasks.length})</h2>
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="rounded-md border border-zinc-200 bg-white p-2 text-sm">
                <div className={`font-medium ${t.status === "done" ? "text-zinc-400 line-through" : ""}`}>{t.title}</div>
                {t.dueAt && <div className="text-xs text-zinc-500">Due {new Date(t.dueAt).toLocaleDateString()}</div>}
              </div>
            ))}
            {tasks.length === 0 && <p className="text-xs text-zinc-400">No tasks yet.</p>}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700">Conversations ({conversations.length})</h2>
          <div className="space-y-2">
            {conversations.map((c) => (
              <Link key={c.id} href="/inbox" className="block rounded-md border border-zinc-200 bg-white p-2 text-sm hover:bg-zinc-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs capitalize text-zinc-500">{c.status}</span>
                  <span className="text-[11px] text-zinc-400">{new Date(c.lastMessageAt).toLocaleDateString()}</span>
                </div>
                <p className="truncate text-zinc-700">{c.lastMessage}</p>
              </Link>
            ))}
            {conversations.length === 0 && <p className="text-xs text-zinc-400">No conversations yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
