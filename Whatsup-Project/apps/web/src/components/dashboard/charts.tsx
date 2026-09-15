"use client";
import { useId } from "react";

// Small inline-SVG chart primitives. Deliberately dependency-free: they inherit
// currentColor and the brand CSS variables, so they re-skin with the theme and the
// partner's brand colour without a chart library's own palette fighting back.

export function AreaSpark({ points, height = 120, labels }: { points: number[]; height?: number; labels?: string[] }) {
  const id = useId();
  const w = 100;
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((p, i) => [i * step, 32 - (p / max) * 30] as const);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},32 L0,32 Z`;
  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 ${w} 32`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 8, 16, 24, 32].map((y) => (
          <line key={y} x1="0" y1={y} x2={w} y2={y} stroke="var(--border-1)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#g-${id})`} />
        <path d={line} fill="none" stroke="var(--brand-600)" strokeWidth="1.6" vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
        {coords.length > 0 && (
          <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="1.6"
            fill="var(--brand-600)" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {labels && (
        <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
          <span>{labels[0]}</span><span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

export function Donut({ segments, size = 128 }: { segments: Array<{ label: string; value: number; color: string }>; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 42, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="12" />
        {total > 0 && segments.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="12"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt"
              style={{ transition: "stroke-dasharray var(--dur-slow) var(--ease-out)" }} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="min-w-0 space-y-1 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate text-zinc-500">{s.label}</span>
            <span className="ml-auto font-medium">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({ items }: { items: Array<{ label: string; value: number; hint?: string }> }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-xs">
            <span className="truncate text-zinc-600">{i.label}</span>
            <span className="text-zinc-400">{i.hint ?? i.value}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${(i.value / max) * 100}%`, transition: "width var(--dur-slow) var(--ease-out)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Ring({ value, label }: { value: number; label: string }) {
  const r = 30, c = 2 * Math.PI * r;
  const len = Math.max(0, Math.min(1, value)) * c;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--brand-600)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${len} ${c - len}`} style={{ transition: "stroke-dasharray var(--dur-slow) var(--ease-out)" }} />
      </svg>
      <div className="-mt-13 text-sm font-semibold" style={{ marginTop: "-3.25rem" }}>{Math.round(value * 100)}%</div>
      <div className="mt-8 text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}
