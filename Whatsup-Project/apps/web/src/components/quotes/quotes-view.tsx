"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/nav-icons";

type Quote = {
  id: string; number: number; title: string; status: string;
  subtotalPaise: number; taxPercent: number; taxPaise: number;
  discountPaise: number; totalPaise: number;
  contactId: string | null; contactName: string | null;
  validUntil: string | null; sentAt: string | null; createdAt: string;
};
type Item = { description: string; quantity: number; unitPricePaise: number };

const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const statusColor: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600", sent: "bg-sky-100 text-sky-700",
  accepted: "bg-emerald-100 text-emerald-700", declined: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
};
const input = "w-full rounded-md border border-zinc-300 px-2 py-1 text-sm";

function errText(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/\{.*\}/);
  if (!m) return raw;
  try { const p = JSON.parse(m[0]); return p.error ?? p.message ?? raw; } catch { return raw; }
}

export function QuotesView() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", contactId: "", taxPercent: 18, discountPaise: 0, notes: "" });
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: 1, unitPricePaise: 0 }]);

  const load = useCallback(async () => {
    const [q, c] = await Promise.all([apiFetch("/quotes"), apiFetch("/contacts").catch(() => [])]);
    setQuotes(q); setContacts(c);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Previewed with the same arithmetic the server uses, so the figure on screen is the
  // figure that gets stored.
  const subtotal = items.reduce((s, i) => s + (i.quantity || 0) * (i.unitPricePaise || 0), 0);
  const taxable = Math.max(0, subtotal - (form.discountPaise || 0));
  const tax = Math.round((taxable * (form.taxPercent || 0)) / 100);
  const total = taxable + tax;

  async function create() {
    if (!form.title.trim()) return;
    setNotice(null);
    try {
      await apiFetch("/quotes", {
        method: "POST",
        body: JSON.stringify({ ...form, contactId: form.contactId || null, items: items.filter((i) => i.description.trim()) }),
      });
      setForm({ title: "", contactId: "", taxPercent: 18, discountPaise: 0, notes: "" });
      setItems([{ description: "", quantity: 1, unitPricePaise: 0 }]);
      setShowNew(false);
      await load();
    } catch (e) { setNotice(errText(e)); }
  }

  async function send(q: Quote) {
    setNotice(null);
    try {
      const r = await apiFetch(`/quotes/${q.id}/send`, { method: "POST" });
      setNotice(`Quote #${q.number} sent over WhatsApp (message ${r.status}).`);
      await load();
    } catch (e) { setNotice(errText(e)); }
  }

  async function setStatus(q: Quote, status: string) {
    await apiFetch(`/quotes/${q.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Quotes</h1>
          <p className="text-sm text-zinc-500">Priced line items, totalled server-side and sent over WhatsApp.</p>
        </div>
        <button onClick={() => setShowNew((s) => !s)}
          className="lq-ring-focus flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">
          <Icon name="plus" className="h-3.5 w-3.5" /> New quote
        </button>
      </div>

      {notice && <p className="mb-3 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">{notice}</p>}

      {showNew && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500">Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Contact</label>
              <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className={input}>
                <option value="">— none —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phoneE164}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3 text-xs font-medium text-zinc-600">Line items</div>
          {items.map((it, i) => (
            <div key={i} className="mt-1 flex flex-wrap gap-1">
              <input value={it.description} placeholder="Description"
                onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
              <input type="number" min={1} value={it.quantity} title="Quantity"
                onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
                className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
              <input type="number" min={0} value={it.unitPricePaise / 100} title="Unit price in rupees"
                onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unitPricePaise: Math.round(Number(e.target.value) * 100) } : x))}
                className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
              <button onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="px-1 text-xs text-zinc-400 hover:text-red-600">✕</button>
            </div>
          ))}
          <button onClick={() => setItems([...items, { description: "", quantity: 1, unitPricePaise: 0 }])}
            className="mt-1 text-xs text-emerald-700">+ Add line</button>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-zinc-500">Tax %</label>
              <input type="number" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: Number(e.target.value) })} className={input} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Discount (₹)</label>
              <input type="number" value={form.discountPaise / 100}
                onChange={(e) => setForm({ ...form, discountPaise: Math.round(Number(e.target.value) * 100) })} className={input} />
            </div>
            <div className="self-end text-right text-sm">
              <div className="text-xs text-zinc-500">Subtotal {rupees(subtotal)} · Tax {rupees(tax)}</div>
              <div className="text-lg font-semibold">{rupees(total)}</div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={create} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Create quote</button>
            <button onClick={() => setShowNew(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="lq-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr><th className="px-3 py-2">#</th><th>Title</th><th>Contact</th><th>Total</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-zinc-100">
                <td className="px-3 py-2 font-mono text-xs text-zinc-400">#{q.number}</td>
                <td className="font-medium">{q.title}</td>
                <td className="text-xs">{q.contactName ?? "—"}</td>
                <td>
                  <div className="font-medium">{rupees(q.totalPaise)}</div>
                  <div className="text-[11px] text-zinc-400">
                    {rupees(q.subtotalPaise)}{q.discountPaise ? ` − ${rupees(q.discountPaise)}` : ""}
                    {q.taxPercent ? ` + ${q.taxPercent}% tax` : ""}
                  </div>
                </td>
                <td><span className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${statusColor[q.status]}`}>{q.status}</span></td>
                <td className="whitespace-nowrap px-2 text-xs">
                  {q.status === "draft" && <button onClick={() => send(q)} className="text-emerald-700 hover:underline">Send</button>}
                  {q.status === "sent" && (
                    <>
                      <button onClick={() => setStatus(q, "accepted")} className="text-emerald-700 hover:underline">Accepted</button>
                      <button onClick={() => setStatus(q, "declined")} className="ml-2 text-zinc-400 hover:text-red-600">Declined</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {quotes.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-sm text-zinc-400">No quotes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
