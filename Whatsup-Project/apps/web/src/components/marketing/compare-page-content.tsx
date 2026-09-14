"use client";
import { Fragment } from "react";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { compareCompetitors, compareGroups } from "@/components/marketing/compare-data";
import { useLanguage } from "@/components/marketing/language-context";

function Mark({ v }: { v: string }) {
  const symbol = v.trim().slice(0, 1);
  const rest = v.trim().slice(1).trim();
  const color = symbol === "●" ? "text-emerald-600" : symbol === "◐" ? "text-amber-500" : "text-zinc-300";
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className={`text-base ${color}`}>{symbol}</span>
      {rest && <span className="text-[9px] text-zinc-400">{rest}</span>}
    </span>
  );
}

export function ComparePageContent() {
  const { t } = useLanguage();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">{t.compare.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{t.compare.title}</h1>
          <p className="mt-3 text-zinc-600">{t.compare.subtitle}</p>
        </div>

        <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Feature</th>
                {compareCompetitors.map((c) => (
                  <th key={c} className={`px-3 py-3 text-center font-semibold ${c === "Loqio" ? "text-emerald-700" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareGroups.map((g) => (
                <Fragment key={g.group}>
                  <tr className="bg-zinc-100/70">
                    <td colSpan={compareCompetitors.length + 1} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      {g.group}
                    </td>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.feature} className="border-t border-zinc-100">
                      <td className="px-4 py-2.5 text-zinc-700">{r.feature}</td>
                      {r.values.map((v, i) => (
                        <td key={i} className={`px-3 py-2.5 text-center ${i === 0 ? "bg-emerald-50/60" : ""}`}>
                          <Mark v={v} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-zinc-400">
          Sourced from public pricing pages, help docs and product demos as of Sep 2026; enterprise-quote
          cells should be verified directly with the vendor before you decide. We also fall behind on
          SMS/RCS/voice fallback, SSO/SAML and ISO 27001 today — see the roadmap on our{" "}
          <Link href="/product/features" className="text-emerald-600 hover:underline">features page</Link>.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-zinc-900 px-6 py-8 text-white">
          <div>
            <h3 className="text-lg font-semibold">See it running on your own number</h3>
            <p className="mt-1 text-sm text-zinc-300">Free tier, no credit card required.</p>
          </div>
          <Link href="/register" className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium hover:bg-emerald-400">
            Get started free →
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
