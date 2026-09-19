'use client';
import { useState } from 'react';
import { paise } from '@/lib/api';

/** Fleet cost categories, in FIXED order — never cycled, never reordered per view.
 *  Hues validated with the dataviz palette validator (all pairs, light surface):
 *  lightness band, chroma floor, CVD separation and contrast all PASS. The tritan
 *  pair sits in the 6–8 floor band, which is legal only with secondary encoding —
 *  hence the 2px gaps between segments, the legend, and the direct labels below.
 *  "Other" is a residual bucket, not a competing identity, so it is neutral gray. */
export const COST_KEYS = [
  { key: 'hirePaise', label: 'Hire', color: '#2e7d4f' },
  { key: 'fuelPaise', label: 'Fuel', color: '#b8862b' },
  { key: 'maintenancePaise', label: 'Maintenance', color: '#2563eb' },
  { key: 'otherPaise', label: 'Other', color: '#9ca3af' },
] as const;

type Row = { id: string; label: string; sub?: string; parts: Record<string, number>; total: number };

function Segments({ row, max, onHover }: { row: Row; max: number; onHover: (t: string | null) => void }) {
  return <div className="relative flex h-5 w-full items-stretch gap-[2px]">
    {COST_KEYS.map(({ key, label, color }) => {
      const v = row.parts[key] || 0;
      if (v <= 0) return null;
      // Width is a share of the widest row, so bars are comparable across vehicles.
      return <div key={key} style={{ width: `${(v / max) * 100}%`, background: color }}
        className="h-full first:rounded-l-[4px] last:rounded-r-[4px] cursor-default transition-opacity hover:opacity-80"
        onMouseEnter={() => onHover(`${row.label} · ${label} ${paise(v)}`)}
        onMouseLeave={() => onHover(null)} />;
    })}
  </div>;
}

export function CostLegend() {
  return <div className="flex flex-wrap gap-3 text-xs">
    {COST_KEYS.map(({ key, label, color }) =>
      <span key={key} className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        <span className="text-gray-600">{label}</span>
      </span>)}
  </div>;
}

/** Month total as one composition bar, with each slice directly labelled.
 *  Direct labels are the secondary encoding that lets the tritan floor pair ship. */
export function CostComposition({ parts, total }: { parts: Record<string, number>; total: number }) {
  const [tip, setTip] = useState<string | null>(null);
  if (!total) return <div className="text-sm text-gray-400">No cost recorded this month.</div>;
  return <div>
    <div className="flex h-7 w-full items-stretch gap-[2px]">
      {COST_KEYS.map(({ key, label, color }) => {
        const v = parts[key] || 0;
        if (v <= 0) return null;
        return <div key={key} style={{ width: `${(v / total) * 100}%`, background: color }}
          className="h-full first:rounded-l-[4px] last:rounded-r-[4px] transition-opacity hover:opacity-80"
          onMouseEnter={() => setTip(`${label} ${paise(v)} · ${Math.round((v / total) * 100)}%`)}
          onMouseLeave={() => setTip(null)} />;
      })}
    </div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {COST_KEYS.filter(({ key }) => (parts[key] || 0) > 0).map(({ key, label, color }) =>
        <span key={key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          <span className="text-gray-600">{label}</span>
          <b className="text-gray-800">{paise(parts[key])}</b>
          <span className="text-gray-400">{Math.round((parts[key] / total) * 100)}%</span>
        </span>)}
    </div>
    <div className="mt-1 h-4 text-xs text-gray-500">{tip}</div>
  </div>;
}

/** Per-vehicle stacked bars, sorted by spend. Magnitude is comparable across rows
 *  because every bar is scaled to the same max. */
export function CostByVehicle({ rows, limit = 10 }: { rows: Row[]; limit?: number }) {
  const [tip, setTip] = useState<string | null>(null);
  const sorted = [...rows].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const shown = sorted.slice(0, limit);
  const max = shown[0]?.total || 1;
  if (!shown.length) return <div className="text-sm text-gray-400">No vehicle costs recorded this month.</div>;
  return <div>
    <div className="space-y-2">
      {shown.map((r) => <div key={r.id} className="grid grid-cols-[8rem_1fr_5.5rem] items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{r.label}</div>
          {r.sub && <div className="truncate text-[11px] text-gray-500">{r.sub}</div>}
        </div>
        <Segments row={r} max={max} onHover={setTip} />
        <div className="text-right text-sm font-medium tabular-nums">{paise(r.total)}</div>
      </div>)}
    </div>
    <div className="mt-2 flex items-center justify-between">
      <CostLegend />
      <div className="h-4 text-xs text-gray-500">{tip}</div>
    </div>
    {sorted.length > limit && <div className="mt-1 text-xs text-gray-400">Showing the {limit} costliest of {sorted.length} vehicles — the full table is below.</div>}
  </div>;
}
