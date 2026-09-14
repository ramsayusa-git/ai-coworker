"use client";
import Link from "next/link";
import { FlowDiagram } from "@/components/marketing/diagrams";
import { features } from "@/components/marketing/marketing-data";
import { useLanguage } from "@/components/marketing/language-context";

// The step diagram stays in English for now (diagram labels aren't in the translation dict yet).
const heroFlow = [
  { icon: "👋", title: "Customer messages", detail: "WhatsApp, Instagram, Messenger" },
  { icon: "🤖", title: "Bot or AI answers", detail: "Or routes to the right agent" },
  { icon: "💬", title: "Team inbox", detail: "Shared, with SLA & assignment" },
  { icon: "📈", title: "Tracked end to end", detail: "Analytics, ROI, quality score" },
];

export function ProductHomeContent() {
  const { t } = useLanguage();
  const stats = [
    { value: "0%", label: t.home.stat1 },
    { value: "12", label: t.home.stat2 },
    { value: "2 min", label: t.home.stat3 },
    { value: "10+", label: t.home.stat4 },
  ];
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-emerald-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <span className="inline-block rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700">
            {t.home.badge}
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            {t.home.title}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600">{t.home.subtitle}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
              {t.home.ctaPrimary}
            </Link>
            <Link href="/product/features" className="rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:border-emerald-400 hover:text-emerald-700">
              {t.home.ctaSecondary}
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
          <h2 className="text-2xl font-bold sm:text-3xl">{t.home.howTitle}</h2>
          <p className="mt-2 text-zinc-600">{t.home.howSubtitle}</p>
        </div>
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <FlowDiagram steps={heroFlow} />
        </div>
      </section>

      {/* Feature grid */}
      <section className="bg-zinc-50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">{t.home.modulesTitle}</h2>
            <p className="mt-2 text-zinc-600">{t.home.modulesSubtitle}</p>
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
          <h2 className="text-2xl font-bold sm:text-3xl">{t.home.whyTitle}</h2>
          <p className="mt-2 text-zinc-600">{t.home.whySubtitle}</p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
            <div className="text-sm font-semibold text-emerald-800">{t.home.aheadTitle}</div>
            <p className="mt-2 text-xs leading-relaxed text-emerald-900/80">{t.home.aheadBody}</p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-5">
            <div className="text-sm font-semibold text-sky-800">{t.home.levelTitle}</div>
            <p className="mt-2 text-xs leading-relaxed text-sky-900/80">{t.home.levelBody}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="text-sm font-semibold text-amber-800">{t.home.behindTitle}</div>
            <p className="mt-2 text-xs leading-relaxed text-amber-900/80">{t.home.behindBody}</p>
          </div>
        </div>
        <div className="mt-6 text-center">
          <Link href="/product/compare" className="text-sm font-medium text-emerald-700 hover:underline">
            {t.home.compareLink}
          </Link>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-zinc-900 py-14 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">{t.home.closingTitle}</h2>
          <p className="mt-2 text-zinc-300">{t.home.closingSubtitle}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold hover:bg-emerald-400">
              {t.home.closingPrimary}
            </Link>
            <Link href="/product/pricing" className="rounded-md border border-zinc-600 px-5 py-2.5 text-sm font-semibold hover:border-zinc-400">
              {t.home.closingSecondary}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
