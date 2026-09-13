"use client";

export type FlowStep = { icon: string; title: string; detail: string };

/** Responsive step-by-step flow diagram: horizontal row on desktop, stacked on mobile. */
export function FlowDiagram({ steps, tone = "emerald" }: { steps: FlowStep[]; tone?: "emerald" | "sky" | "amber" }) {
  const ring = tone === "sky" ? "border-sky-200 bg-sky-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50";
  const badge = tone === "sky" ? "bg-sky-600" : tone === "amber" ? "bg-amber-600" : "bg-emerald-600";
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-0">
      {steps.map((s, i) => (
        <div key={s.title} className="flex flex-1 flex-col items-center sm:flex-row">
          <div className={`w-full rounded-lg border ${ring} p-3 text-center sm:min-h-[104px]`}>
            <div className={`mx-auto mb-1.5 grid h-7 w-7 place-items-center rounded-full ${badge} text-sm text-white`}>
              {s.icon}
            </div>
            <div className="text-xs font-semibold text-zinc-800">{s.title}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{s.detail}</div>
          </div>
          {i < steps.length - 1 && (
            <div className="my-1 flex h-6 items-center justify-center text-zinc-300 sm:my-0 sm:h-auto sm:px-1.5">
              <span className="hidden sm:inline text-lg">→</span>
              <span className="sm:hidden text-lg">↓</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
