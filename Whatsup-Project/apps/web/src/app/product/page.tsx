import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { FlowDiagram } from "@/components/marketing/diagrams";
import { features } from "@/components/marketing/marketing-data";

export const metadata = { title: "Aetos One Chat — WhatsApp Business Platform" };

const heroFlow = [
  { icon: "👋", title: "Customer messages", detail: "WhatsApp, Instagram, Messenger" },
  { icon: "🤖", title: "Bot or AI answers", detail: "Or routes to the right agent" },
  { icon: "💬", title: "Team inbox", detail: "Shared, with SLA & assignment" },
  { icon: "📈", title: "Tracked end to end", detail: "Analytics, ROI, quality score" },
];

const stats = [
  { value: "0%", label: "message markup — you pay Meta directly" },
  { value: "12", label: "modules: inbox, bots, ads, commerce & more" },
  { value: "2 min", label: "to connect a number with Quick Connect" },
  { value: "10+", label: "platforms benchmarked to build this" },
];

export default function ProductHome() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="bg-gradient-to-b from-emerald-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <span className="inline-block rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700">
            Built on the official Meta Cloud API · Tech Provider, not a BSP
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            One platform to run your entire WhatsApp business
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600">
            Inbox, broadcasts, bots, AI agents, ads, commerce and a full white-label partner console —
            benchmarked feature-by-feature against Wati, AiSensy, Interakt, Gallabox, Twilio, Infobip and more.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
              Get started free
            </Link>
            <Link href="/product/features" className="rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:border-emerald-400 hover:text-emerald-700">
              Explore features
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-zinc-100 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{s.value}</div>
              <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">How a message flows through the platform</h2>
          <p className="mt-2 text-zinc-600">From the first hello to a closed, reported conversation.</p>
        </div>
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <FlowDiagram steps={heroFlow} />
        </div>
      </section>

      {/* Feature grid */}
      <section className="bg-zinc-50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">Twelve modules. One platform.</h2>
            <p className="mt-2 text-zinc-600">Every module your team needs — no separate tools to stitch together.</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <a key={f.id} href={`/product/features#${f.id}`}
                className="rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{f.emoji}</span>
                  <span className="font-semibold text-zinc-800">{f.title}</span>
                </div>
                <p className="mt-1.5 text-xs leading-snug text-zinc-500">{f.summary}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Ahead where it counts, honest where it doesn&apos;t</h2>
          <p className="mt-2 text-zinc-600">
            We benchmarked Wati, AiSensy, Interakt, Gallabox, Emovur, Twilio, 360dialog, Infobip, Bird, Sinch,
            Gupshup and Respond.io feature-by-feature. Here&apos;s the honest picture.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
            <div className="text-sm font-semibold text-emerald-800">Ahead of everyone</div>
            <p className="mt-2 text-xs leading-relaxed text-emerald-900/80">
              Quick Connect (2-minute QR onboarding), groups &amp; communities manager, WhatsApp Channels
              publisher, status scheduler, chat-history import, and full white-label in one product —
              nobody else bundles all of this.
            </p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-5">
            <div className="text-sm font-semibold text-sky-800">Level with the best SMB tools</div>
            <p className="mt-2 text-xs leading-relaxed text-sky-900/80">
              Inbox, contacts, templates, broadcasts, retargeting, Flows, CTWA ads, bot builder, AI copilot,
              catalog and payments, GST invoicing, 0% markup — matching Wati/AiSensy/Emovur at launch.
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="text-sm font-semibold text-amber-800">Honestly, still catching up</div>
            <p className="mt-2 text-xs leading-relaxed text-amber-900/80">
              SMS/RCS/voice fallback, SSO/SAML, ISO 27001, dedicated 1,000 mps throughput and a connector
              marketplace are enterprise-CPaaS territory (Twilio, Infobip, Bird) — on our v1.x–v2 roadmap.
            </p>
          </div>
        </div>
        <div className="mt-6 text-center">
          <Link href="/product/compare" className="text-sm font-medium text-emerald-700 hover:underline">
            See the full module-by-module comparison →
          </Link>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-zinc-900 py-14 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">Ready to move your WhatsApp business here?</h2>
          <p className="mt-2 text-zinc-300">Free tier available. No credit card required to get started.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold hover:bg-emerald-400">
              Create your organization
            </Link>
            <Link href="/product/pricing" className="rounded-md border border-zinc-600 px-5 py-2.5 text-sm font-semibold hover:border-zinc-400">
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
