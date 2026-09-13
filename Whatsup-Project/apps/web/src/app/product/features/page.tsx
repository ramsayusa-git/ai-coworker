import { MarketingShell } from "@/components/marketing/marketing-shell";
import { FlowDiagram } from "@/components/marketing/diagrams";
import { features } from "@/components/marketing/marketing-data";

export const metadata = { title: "Features — Aetos One Chat" };

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Full feature tour</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Everything a WhatsApp business team needs, in one place</h1>
          <p className="mt-3 text-zinc-600">
            Twelve modules, each built to match or beat the best of Wati, AiSensy, Interakt, Gallabox and the
            enterprise CPaaS platforms — with a few things none of them offer at all.
          </p>
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
            <h3 className="text-lg font-semibold">See how we compare, module by module</h3>
            <p className="mt-1 text-sm text-zinc-300">A detailed table against 10 WhatsApp platforms worldwide.</p>
          </div>
          <a href="/product/compare" className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium hover:bg-emerald-400">
            Open comparison →
          </a>
        </div>
      </div>
    </MarketingShell>
  );
}
