import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";

export const metadata = { title: "Pricing — Aetos One Chat" };

type Plan = {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  cta: string;
  highlight?: boolean;
};

const plans: Plan[] = [
  {
    name: "Free",
    price: "₹0",
    cadence: "forever",
    blurb: "Try the full inbox and one channel with a small team.",
    features: [
      "1 WhatsApp number (Quick Connect or Official)",
      "Up to 3 agents, shared inbox",
      "1,000 contacts, basic segments",
      "1 bot flow, broadcasts with daily cap",
      "Community support",
    ],
    cta: "Start free",
  },
  {
    name: "Starter",
    price: "₹999",
    cadence: "/month",
    blurb: "For a small team running real campaigns.",
    features: [
      "2 numbers, unlimited agents",
      "10,000 contacts, full segments & CRM sync",
      "Unlimited broadcasts & drips, A/B tests",
      "5 bot flows, canned replies, SLA timers",
      "Email support",
    ],
    cta: "Start free trial",
  },
  {
    name: "Growth",
    price: "₹2,999",
    cadence: "/month",
    blurb: "For teams running AI agents, ads and commerce.",
    features: [
      "Unlimited numbers and agents",
      "Unlimited contacts, lifecycle stages, lead scoring",
      "AI agent with RAG + tools, agent-assist",
      "Click-to-WhatsApp ads manager, Channels & groups",
      "Catalog, cart, orders, payment links",
      "Priority support",
    ],
    cta: "Start free trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "quote",
    blurb: "For agencies, partners and large organisations.",
    features: [
      "Everything in Growth, plus:",
      "Partner console, white-label, custom domain",
      "Wholesale billing & revenue-share ledger",
      "RBAC, audit log, GST invoicing",
      "SSO/SAML & data residency (roadmap, early access)",
      "Dedicated support & onboarding",
    ],
    cta: "Talk to sales",
  },
];

const usageNote = [
  { label: "WhatsApp messages", detail: "0% markup — billed directly by Meta to your own WABA" },
  { label: "Quick Connect channels", detail: "Billed per channel-day, no Meta fees" },
  { label: "AI tokens", detail: "Included allowance per plan, top up from your wallet" },
  { label: "Billing", detail: "INR via Razorpay (UPI/cards/GST invoice) or USD via Stripe" },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Pricing</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Simple plans, 0% message markup</h1>
          <p className="mt-3 text-zinc-600">
            You always pay Meta directly for WhatsApp conversations — we only charge for the software.
            No per-agent inbox tax, ever.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-4">
          {plans.map((p) => (
            <div key={p.name}
              className={`flex flex-col rounded-xl border p-6 ${p.highlight ? "border-emerald-400 bg-emerald-50 shadow-md" : "border-zinc-200 bg-white"}`}>
              {p.highlight && (
                <span className="mb-3 w-fit rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Most popular
                </span>
              )}
              <div className="text-lg font-semibold text-zinc-900">{p.name}</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-zinc-900">{p.price}</span>
                <span className="text-sm text-zinc-500">{p.cadence}</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">{p.blurb}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-xs text-zinc-700">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-1.5"><span className="text-emerald-500">✓</span><span>{f}</span></li>
                ))}
              </ul>
              <Link href={p.name === "Enterprise" ? "/product/compare" : "/register"}
                className={`mt-5 rounded-md px-3 py-2 text-center text-sm font-medium ${
                  p.highlight ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-zinc-300 text-zinc-700 hover:border-emerald-400 hover:text-emerald-700"
                }`}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
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

        <p className="mt-8 text-center text-xs text-zinc-400">
          Prices shown are illustrative launch pricing and may change. GST is added where applicable.
        </p>
      </div>
    </MarketingShell>
  );
}
