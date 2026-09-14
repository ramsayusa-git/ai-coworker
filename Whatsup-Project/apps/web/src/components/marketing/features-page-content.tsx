"use client";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { FlowDiagram } from "@/components/marketing/diagrams";
import { features } from "@/components/marketing/marketing-data";
import { useLanguage } from "@/components/marketing/language-context";

export function FeaturesPageContent() {
  const { t } = useLanguage();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">{t.features.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{t.features.title}</h1>
          <p className="mt-3 text-zinc-600">{t.features.subtitle}</p>
        </div>

        <nav className="mt-8 flex flex-wrap gap-2">
          {features.map((f) => (
            <a key={f.id} href={`#${f.id}`}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 hover:border-emerald-400 hover:text-emerald-700">
              {f.emoji} {f.title}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-10">
          {features.map((f) => (
            <section key={f.id} id={f.id} className="scroll-mt-20 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{f.emoji} {f.title}</h2>
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {f.tag}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-zinc-600">{f.summary}</p>

              <div className="mt-5 grid gap-6 lg:grid-cols-5">
                <ul className="space-y-1.5 text-sm text-zinc-700 lg:col-span-2">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="text-emerald-500">✓</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="lg:col-span-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">How it flows</div>
                  <FlowDiagram steps={f.flow} tone={f.tone} />
                </div>
              </div>

              <p className="mt-4 rounded-md border-l-2 border-emerald-400 bg-emerald-50 px-3 py-2 text-xs text-zinc-600">
                <span className="font-semibold text-emerald-700">Why it matters: </span>{f.edge}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-zinc-900 px-6 py-8 text-white">
          <div>
            <h3 className="text-lg font-semibold">{t.features.ctaTitle}</h3>
            <p className="mt-1 text-sm text-zinc-300">{t.features.ctaSubtitle}</p>
          </div>
          <a href="/product/compare" className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium hover:bg-emerald-400">
            {t.features.ctaButton}
          </a>
        </div>
      </div>
    </MarketingShell>
  );
}
