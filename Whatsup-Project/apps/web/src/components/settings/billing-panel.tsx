"use client";
import { useCallback, useEffect, useState } from "react";
import type { BillingSummary, ConversationRate, Plan, WalletTransaction } from "@/lib/types";
import { apiFetch, platformFetch } from "@/lib/api";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Conversation rates are stored in milli-paise (₹0.865 = 86 500) so Meta's 3-4 decimal
// rupee rates survive the round trip.
const rateRupees = (milliPaise: number) => `₹${(milliPaise / 100000).toFixed(3)}`;

const CYCLES = [
  ["monthly", "Billed monthly"], ["quarterly", "Billed quarterly"], ["annual", "Billed annually"],
] as const;

export function BillingPanel() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [rates, setRates] = useState<ConversationRate[]>([]);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [cycle, setCycle] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, p, r, t] = await Promise.all([
      apiFetch("/billing"),
      platformFetch("/plans"),
      platformFetch("/conversation-rates"),
      apiFetch("/billing/transactions"),
    ]);
    setSummary(s); setPlans(p); setRates(r); setTxs(t);
    setCycle(s.planCycle ?? "monthly");
  }, []);
  useEffect(() => { load(); }, [load]);

  async function changePlan(planId: string) {
    setBusy(true);
    try {
      const res = await apiFetch("/billing/plan", { method: "POST", body: JSON.stringify({ planId, cycle }) });
      setNotice(res.note ?? null);
      await load();
    } finally { setBusy(false); }
  }

  async function changeCountry(code: string) {
    setBusy(true);
    try {
      await apiFetch("/billing/plan", { method: "POST", body: JSON.stringify({ billingCountryCode: code }) });
      await load();
    } finally { setBusy(false); }
  }

  async function topUp() {
    const amount = prompt("Top-up amount in rupees", "500");
    const rupeesNum = Number(amount);
    if (!rupeesNum || rupeesNum <= 0) return;
    setBusy(true);
    try {
      const res = await apiFetch("/billing/topup", { method: "POST", body: JSON.stringify({ amountPaise: Math.round(rupeesNum * 100) }) });
      setNotice(res.note ?? null);
      await load();
    } finally { setBusy(false); }
  }

  if (!summary) return <div className="text-sm text-zinc-400">Loading billing…</div>;

  const priceFor = (p: Plan) =>
    cycle === "annual" ? p.priceAnnualPaise : cycle === "quarterly" ? p.priceQuarterlyPaise : p.priceMonthlyPaise;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-sm text-zinc-500">Wallet balance</div>
          <div className="text-2xl font-semibold">{rupees(summary.walletPaise)}</div>
          <button onClick={topUp} disabled={busy}
            className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Top up</button>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-sm text-zinc-500">Spent this month</div>
          <div className="text-2xl font-semibold">{rupees(summary.usageThisMonth.spentPaise)}</div>
          <div className="mt-1 space-y-0.5 text-xs text-zinc-500">
            {summary.usageThisMonth.byCategory.length === 0 && <div>No billable conversations yet.</div>}
            {summary.usageThisMonth.byCategory.map((c) => (
              <div key={c.category} className="capitalize">{c.category}: {c.conversations} conversation{c.conversations === 1 ? "" : "s"}</div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-sm text-zinc-500">Current plan</div>
          <div className="text-2xl font-semibold">{summary.plan?.name ?? "—"}</div>
          <div className="mt-1 text-xs text-zinc-500">
            {summary.planCycle} · {summary.planRenewsAt ? `renews ${new Date(summary.planRenewsAt).toLocaleDateString()}` : "no renewal date set"}
          </div>
        </div>
      </div>

      {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>}

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">Plans</div>
          <div className="flex gap-1">
            {CYCLES.map(([v, labelText]) => (
              <button key={v} onClick={() => setCycle(v)}
                className={`rounded-full px-3 py-1 text-xs ${cycle === v ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                {labelText}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((p) => {
            const current = summary.plan?.id === p.id;
            return (
              <div key={p.id} className={`rounded-lg border p-3 ${current ? "border-emerald-500 bg-emerald-50" : "border-zinc-200"}`}>
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-2xl font-semibold">
                  {priceFor(p) === 0 ? "₹0" : rupees(priceFor(p))}<span className="text-xs font-normal text-zinc-500">/mo</span>
                </div>
                <div className="text-xs text-zinc-500">{p.tagline}</div>
                <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-600">
                  {p.highlights.map((h) => <li key={h}>· {h}</li>)}
                </ul>
                <button onClick={() => changePlan(p.id)} disabled={busy || current}
                  className={`mt-3 w-full rounded-md px-3 py-1.5 text-xs font-medium ${current ? "bg-zinc-100 text-zinc-400" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                  {current ? "Current plan" : "Switch to this plan"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-zinc-400">
          No payment gateway is connected to this deployment yet — switching a plan records the change and bills nothing.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Conversation charges</div>
            <div className="text-xs text-zinc-500">
              Charged at WhatsApp&apos;s own per-conversation rates, with no markup
              ({summary.rateCard ? `${summary.rateCard.markupBps / 100}%` : "0%"} added). Meta bills per 24-hour
              conversation window, not per message — a second message in the same window is free.
            </div>
          </div>
          <select value={summary.billingCountryCode} onChange={(e) => changeCountry(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
            {rates.map((r) => <option key={r.countryCode} value={r.countryCode}>{r.country}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="py-1">Country</th><th>Marketing</th><th>Utility</th><th>Authentication</th><th>Service</th></tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className={`border-t border-zinc-100 ${r.countryCode === summary.billingCountryCode ? "bg-emerald-50/50 font-medium" : ""}`}>
                  <td className="py-1.5">{r.country}</td>
                  <td>{rateRupees(r.marketingMilliPaise)}</td>
                  <td>{rateRupees(r.utilityMilliPaise)}</td>
                  <td>{rateRupees(r.authenticationMilliPaise)}</td>
                  <td>{r.serviceMilliPaise === 0 ? "Free" : rateRupees(r.serviceMilliPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-2 text-sm font-medium">Wallet ledger</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="py-1">When</th><th>Reason</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-t border-zinc-100">
                  <td className="py-1.5 text-xs text-zinc-500">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="text-xs">{t.reason}</td>
                  <td className={`text-right ${t.amountPaise < 0 ? "text-red-600" : "text-emerald-700"}`}>{rupees(t.amountPaise)}</td>
                  <td className="text-right text-zinc-500">{rupees(t.balanceAfterPaise)}</td>
                </tr>
              ))}
              {txs.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-sm text-zinc-400">No wallet activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
