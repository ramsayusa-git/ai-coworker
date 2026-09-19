'use client';
import { useEffect, useState } from 'react';

/** A dashboard widget. `span` is how many of the 4 grid columns it occupies. */
export type Widget = { id: string; title: string; node: React.ReactNode; defaultSpan?: 1 | 2 | 3 | 4 };
type Slot = { id: string; span: 1 | 2 | 3 | 4; hidden?: boolean };

const SPANS: Record<number, string> = {
  1: 'col-span-2 lg:col-span-1',
  2: 'col-span-2',
  3: 'col-span-2 lg:col-span-3',
  4: 'col-span-2 lg:col-span-4',
};

/** Merge the saved layout with the widget list: keeps saved order/sizes, appends
 *  widgets added since the layout was saved, drops ones that no longer exist. */
function reconcile(saved: Slot[] | null, widgets: Widget[]): Slot[] {
  const known = new Set(widgets.map((w) => w.id));
  const kept = (saved || []).filter((s) => known.has(s.id));
  const seen = new Set(kept.map((s) => s.id));
  const added = widgets.filter((w) => !seen.has(w.id)).map((w) => ({ id: w.id, span: (w.defaultSpan || 1) as 1 | 2 | 3 | 4 }));
  return [...kept, ...added];
}

export function WidgetGrid({ widgets, storageKey }: { widgets: Widget[]; storageKey: string }) {
  const [slots, setSlots] = useState<Slot[]>(() => reconcile(null, widgets));
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load saved layout after mount so server and first client render match.
  useEffect(() => {
    let saved: Slot[] | null = null;
    try { const raw = localStorage.getItem(storageKey); if (raw) saved = JSON.parse(raw); } catch {}
    setSlots(reconcile(saved, widgets));
    setLoaded(true);
    // widgets is rebuilt every render by the parent; keying on ids keeps this stable.
  }, [storageKey, widgets.map((w) => w.id).join(',')]);

  const persist = (next: Slot[]) => {
    setSlots(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  const move = (from: string, to: string) => {
    if (from === to) return;
    const next = [...slots];
    const fi = next.findIndex((s) => s.id === from);
    const ti = next.findIndex((s) => s.id === to);
    if (fi < 0 || ti < 0) return;
    const [m] = next.splice(fi, 1);
    next.splice(ti, 0, m);
    persist(next);
  };

  const resize = (id: string) => persist(slots.map((s) => s.id === id ? { ...s, span: ((s.span % 4) + 1) as 1 | 2 | 3 | 4 } : s));
  const toggle = (id: string) => persist(slots.map((s) => s.id === id ? { ...s, hidden: !s.hidden } : s));
  const reset = () => { try { localStorage.removeItem(storageKey); } catch {} setSlots(reconcile(null, widgets)); };

  const byId = new Map(widgets.map((w) => [w.id, w]));
  const hiddenCount = slots.filter((s) => s.hidden).length;

  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-gray-500">
        {editing ? 'Drag a card to reorder · ⤢ resizes · × hides it' : `${slots.length - hiddenCount} widgets`}
        {!editing && hiddenCount > 0 && ` · ${hiddenCount} hidden`}
      </div>
      <div className="flex gap-2">
        {editing && <button className="btn-secondary !py-1 text-xs" onClick={reset}>Reset layout</button>}
        <button className={editing ? 'btn-primary !py-1 text-xs' : 'btn-secondary !py-1 text-xs'} onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : '✥ Customise'}
        </button>
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ opacity: loaded ? 1 : 0, transition: 'opacity .15s' }}>
      {slots.filter((s) => editing || !s.hidden).map((s) => {
        const w = byId.get(s.id);
        if (!w) return null;
        return <div key={s.id}
          draggable={editing}
          onDragStart={() => setDrag(s.id)}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(s.id); } }}
          onDrop={(e) => { e.preventDefault(); if (drag) move(drag, s.id); setDrag(null); setOver(null); }}
          className={`${SPANS[s.span]} relative transition-all duration-150
            ${editing ? 'cursor-grab active:cursor-grabbing' : ''}
            ${drag === s.id ? 'opacity-40 scale-[.98]' : ''}
            ${over === s.id && drag !== s.id ? 'ring-2 ring-leaf-500 rounded-2xl' : ''}
            ${s.hidden ? 'opacity-40' : ''}`}>
          {editing && <div className="absolute -top-2 -right-2 z-10 flex gap-1">
            <button onClick={() => resize(s.id)} title={`Width ${s.span}/4 — click to grow`}
              className="h-6 w-6 rounded-full border bg-white text-xs shadow hover:bg-gray-50">⤢</button>
            <button onClick={() => toggle(s.id)} title={s.hidden ? 'Show' : 'Hide'}
              className="h-6 w-6 rounded-full border bg-white text-xs shadow hover:bg-gray-50">{s.hidden ? '＋' : '×'}</button>
          </div>}
          {w.node}
        </div>;
      })}
    </div>
  </div>;
}
