"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { useLanguage } from "@/components/marketing/language-context";
import type { ConversationRate, Plan } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Cycle = "monthly" | "quarterly" | "annual";
const CYCLES: Array<[Cycle, string, string]> = [
  ["monthly", "Billed monthly", ""],
  ["quarterly", "Billed quarterly", "save ~17%"],
  ["annual", "Billed annually", "save ~40%"],
];

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
// Conversation rates are stored in milli-paise so Meta's 3-4 decimal rupee rates survive.
const rateRupees = (milliPaise: number) => `₹${(milliPaise / 100000).toFixed(3)}`;

const usageNote = [
  { label: "WhatsApp conversations", detail: "0% markup — you pay exactly what Meta charges, per 24-hour conversation" },
  { label: "Per conversation, not per message", detail: "Every message inside the same 24-hour window is free" },
  { label: "Service conversations", detail: "Free — Meta removed service-conversation charges" },
  { label: "Prepaid wallet", detail: "Top up, watch the live ledger, no surprise invoice" },
];

// The published tier list, mirroring the seeded plans. Used only as the first paint and
// as a fallback when the catalogue API is unreachable — a marketing page must never show
// an empty pricing table just because the backend is down. Live data replaces it as soon
// as the fetch resolves, so the real plans remain the source of truth.
const FALLBACK_PLANS: Plan[] = [
  {
    id: "free", name: "Free Forever", tagline: "Packed with essentials", position: 0,
    priceMonthlyPaise: 0, priceQuarterlyPaise: 0, priceAnnualPaise: 0, limits: {}, features: {},
    highlights: [
      "Free blue-tick verification assistance", "Rs 50 free conversation credits",
      "Inbox: WhatsApp", "Chatbot: unlimited sessions, 10 triggers", "Team inbox: 1 agent",
      "Click-to-WhatsApp Ads Manager", "Upload & manage contacts",
    ],
  },
  {
    id: "starter", name: "Starter", tagline: "Everything in Free, plus", position: 1,
    priceMonthlyPaise: 179900, priceQuarterlyPaise: 149900, priceAnnualPaise: 99900, limits: {}, features: {},
    highlights: [
      "Team inbox: unlimited agents", "Chatbot: unlimited triggers",
      "Broadcast scheduling + retargeting", "WhatsApp Flows",
      "Template Send Message API", "Chat support",
    ],
  },
  {
    id: "advanced", name: "Advanced", tagline: "Everything in Starter, plus", position: 2,
    priceMonthlyPaise: 299900, priceQuarterlyPaise: 249900, priceAnnualPaise: 199900, limits: {}, features: {},
    highlights: [
      "Dedicated relationship manager", "Drip campaigns", "Webhooks",
      "Inbox: WhatsApp, Facebook, Instagram & Email", "Full developer API access",
    ],
  },
];

// The plans and rates below are the same rows the product bills against — this page
// reads them from the public catalogue API rather than keeping its own copy that
// quietly drifts out of date.
export function PricingPageContent() {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [rates, setRates] = useState<ConversationRate[]>([]);
  const [cycle, setCycle] = useState<Cycle>("monthly");

  useEffect(() => {
    fetch(`${API_BASE}/v1/plans`)
      .then((r) => r.json())
      .then((rows: Plan[]) => { if (Array.isArray(rows) && rows.length) setPlans(rows); })
      .catch(() => undefined); // keep the published fallback list on the page
    fetch(`${API_BASE}/v1/conversation-rates`).then((r) => r.json()).then(setRates).catch(() => setRates([]));
  }, []);

  const priceFor = (p: Plan) =>
    cycle === "annual" ? p.priceAnnualPaise : cycle === "quarterly" ? p.priceQuarterlyPaise : p.priceMonthlyPaise;

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">{t.pricing.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{t.pricing.title}</h1>
          <p className="mt-3 text-zinc-600">{t.pricing.subtitle}</p>
        </div>

        <div className="mt-8 flex justify-center gap-1">
          {CYCLES.map(([v, labelText, save]) => (
            <button key={v} onClick={() => setCycle(v)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium ${cycle === v ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
              {labelText}{save && <span className={`ml-1 ${cycle === v ? "text-emerald-300" : "text-emerald-600"}`}>{save}</span>}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-4">
          {plans.map((p) => {
            const highlight = p.id === "advanced";
            return (
              <div key={p.id}
                className={`flex flex-col rounded-xl border p-6 ${highlight ? "border-emerald-400 bg-emerald-50 shadow-md" : "border-zinc-200 bg-white"}`}>
                {highlight && (
                  <span className="mb-3 w-fit rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Most popular
                  </span>
                )}
                <div className="text-lg font-semibold text-zinc-900">{p.name}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-zinc-900">{priceFor(p) === 0 ? "₹0" : rupees(priceFor(p))}</span>
                  <span className="text-sm text-zinc-500">/month</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">{p.tagline}</p>
                <ul className="mt-4 flex-1 space-y-1.5 text-xs text-zinc-700">
                  {p.highlights.map((f) => (
                    <li key={f} className="flex gap-1.5"><span className="text-emerald-500">✓</span><span>{f}</span></li>
                  ))}
                </ul>
                <Link href="/register"
                  className={`mt-5 rounded-md px-3 py-2 text-center text-sm font-medium ${
                    highlight ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-zinc-300 text-zinc-700 hover:border-emerald-400 hover:text-emerald-700"
                  }`}>
                  {p.id === "free" ? "Start free" : "Start free trial"}
                </Link>
              </div>
            );
          })}

          <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-6">
            <div className="text-lg font-semibold text-zinc-900">Partner</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-zinc-900">Custom</span>
              <span className="text-sm text-zinc-500">quote</span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">For agencies and resellers running client accounts.</p>
            <ul className="mt-4 flex-1 space-y-1.5 text-xs text-zinc-700">
              {[
                "Everything in Advanced, plus:",
                "Partner console with client sub-organisations",
                "Full white-label: logo, colours, custom domain",
                "Wholesale billing and revenue share",
                "Client-owned WABA — no lock-in",
              ].map((f) => (
                <li key={f} className="flex gap-1.5"><span className="text-emerald-500">✓</span><span>{f}</span></li>
              ))}
            </ul>
            <Link href="/product/compare"
              className="mt-5 rounded-md border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-700 hover:border-emerald-400 hover:text-emerald-700">
              Talk to us
            </Link>
          </div>
        </div>

        {rates.length > 0 && (
          <div className="mt-12 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Conversation charges — at Meta actuals</h2>
            <p className="mt-1 text-xs text-zinc-500">
              No markup, on every plan including Free. These are the same rates the platform meters your wallet against.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr><th className="py-1">Country</th><th>Marketing</th><th>Utility</th><th>Authentication</th><th>Service</th></tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100">
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
        )}

        <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">How usage-based costs work</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {usageNote.map((u) => (
              <div key={u.label}>
                <div className="text-sm font-semibold text-zinc-800">{u.label}</div>
                <div className="mt-1 text-xs text-zinc-500">{u.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400">{t.pricing.footnote}</p>
      </div>
    </MarketingShell>
  );
}
