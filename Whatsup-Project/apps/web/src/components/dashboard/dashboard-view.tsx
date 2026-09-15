"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getCachedMe } from "@/lib/api";
import { Icon } from "@/components/nav-icons";
import { WIDGETS, WIDGET_BY_TYPE, type DashboardData } from "./widgets";

type Placed = { id: string; type: string; w: number; h: number };

const ROW_PX = 148; // one grid row; h=2 widgets are two of these plus the gap

// Everything here is arrangement state: which widgets, in what order, at what size.
// It is persisted per user on the server (/dashboard-layout), so the same grid follows
// them to another browser — localStorage would not.
export function DashboardView() {
  const me = getCachedMe();
  const [widgets, setWidgets] = useState<Placed[] | null>(null);
  const [data, setData] = useState<DashboardData>({ analytics: null, billing: null, tasks: null, deals: null, conversations: null });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/dashboard-layout")
      .then((r) => setWidgets(r.widgets))
      .catch(() => setWidgets(WIDGETS.slice(0, 4).map((w, i) => ({ id: `w${i}`, type: w.type, w: w.defaultW, h: w.defaultH }))));
  }, []);

  useEffect(() => {
    // Each panel is independent: one failing endpoint must not blank the whole dashboard,
    // so every fetch resolves to null on its own rather than rejecting the batch.
    const safe = (p: string) => apiFetch(p).catch(() => null);
    Promise.all([
      safe("/analytics"), safe("/billing"), safe("/tasks"), safe("/deals/analytics"), safe("/conversations"),
    ]).then(([analytics, billing, tasks, deals, conversations]) => {
      setData({ analytics, billing, tasks, deals, conversations });
      setLoading(false);
    });
  }, []);

  const save = useCallback(async (next: Placed[]) => {
    setWidgets(next);
    setDirty(false);
    await apiFetch("/dashboard-layout", { method: "PUT", body: JSON.stringify({ widgets: next }) }).catch(() => setDirty(true));
  }, []);

  function move(from: string, to: string) {
    if (!widgets || from === to) return;
    const next = [...widgets];
    const fi = next.findIndex((w) => w.id === from);
    const ti = next.findIndex((w) => w.id === to);
    if (fi < 0 || ti < 0) return;
    const [moved] = next.splice(fi, 1);
    next.splice(ti, 0, moved);
    save(next);
  }

  function resize(id: string, dw: number, dh: number) {
    if (!widgets) return;
    save(widgets.map((w) => w.id === id
      ? { ...w, w: Math.max(1, Math.min(4, w.w + dw)), h: Math.max(1, Math.min(3, w.h + dh)) }
      : w));
  }

  function remove(id: string) {
    if (!widgets) return;
    save(widgets.filter((w) => w.id !== id));
  }

  function add(type: string) {
    if (!widgets) return;
    const def = WIDGET_BY_TYPE[type];
    save([...widgets, { id: `w${Date.now().toString(36)}`, type, w: def.defaultW, h: def.defaultH }]);
    setShowAdd(false);
  }

  async function reset() {
    const r = await apiFetch("/dashboard-layout", { method: "DELETE" });
    setWidgets(r.widgets);
  }

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }, []);

  return (
    <div>
      {/* Hero. The wash layer shifts slightly with scroll — a parallax cue that the
          page has depth, kept subtle enough not to distract (and disabled entirely
          under prefers-reduced-motion by the global rule). */}
      <ParallaxHero
        greeting={greeting}
        name={me?.name || me?.email?.split("@")[0] || "there"}
        org={me?.orgName ?? ""}
        right={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <span className="text-[11px] text-amber-600">Layout not saved — retrying…</span>}
            <button onClick={() => setShowAdd(true)}
              className="lq-ring-focus flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-700">
              <Icon name="plus" className="h-3.5 w-3.5" /> Add widget
            </button>
            <button onClick={() => setEditing((e) => !e)}
              className={`lq-ring-focus flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 ${
                editing ? "bg-emerald-600 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:border-emerald-300"
              }`}>
              <Icon name="grip" className="h-3.5 w-3.5" /> {editing ? "Done" : "Customise"}
            </button>
          </div>
        }
      />

      {editing && (
        <p className="lq-fade mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Drag a card by its handle to reorder. Use the arrows to resize it, or ✕ to remove it.
          Your layout saves automatically and follows you to any browser.
          <button onClick={reset} className="ml-2 underline">Reset to default</button>
        </p>
      )}

      <div ref={gridRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {widgets === null
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="lq-skeleton h-36 sm:col-span-2" />)
          : widgets.map((w, idx) => {
              const def = WIDGET_BY_TYPE[w.type];
              if (!def) return null;
              const dragging = dragId === w.id;
              // The dragged id travels in the dataTransfer as well as in state: the drop
              // handler's closure can hold a stale `dragId` if React hasn't re-rendered
              // between dragstart and drop, and the payload never can.
              return (
                <section
                  key={w.id}
                  draggable={editing}
                  onDragStart={(e) => {
                    setDragId(w.id);
                    e.dataTransfer.effectAllowed = "move";
                    try { e.dataTransfer.setData("text/widget-id", w.id); } catch { /* ignore */ }
                  }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDragOver={(e) => { e.preventDefault(); setOverId(w.id); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = e.dataTransfer.getData("text/widget-id") || dragId;
                    if (from) move(from, w.id);
                    setDragId(null);
                    setOverId(null);
                  }}
                  style={{
                    gridColumn: `span ${w.w} / span ${w.w}`,
                    minHeight: w.h * ROW_PX,
                    animationDelay: `${Math.min(idx * 45, 360)}ms`,
                  }}
                  className={`lq-card lq-rise relative flex flex-col overflow-hidden p-4 ${
                    editing ? "lq-card-hover" : ""
                  } ${dragging ? "lq-dragging" : ""} ${overId === w.id && !dragging ? "lq-drop-target" : ""}`}
                >
                  <header className="mb-3 flex items-center gap-2">
                    {editing && (
                      <span className="cursor-grab text-zinc-300 active:cursor-grabbing" title="Drag to reorder">
                        <Icon name="grip" className="h-4 w-4" />
                      </span>
                    )}
                    <Icon name={def.icon} className="h-4 w-4 text-emerald-600" />
                    <h2 className="truncate text-sm font-medium">{def.title}</h2>
                    {editing && (
                      <div className="ml-auto flex items-center gap-0.5">
                        <SizeBtn label="Narrower" onClick={() => resize(w.id, -1, 0)} rotate={180} />
                        <SizeBtn label="Wider" onClick={() => resize(w.id, 1, 0)} />
                        <SizeBtn label="Shorter" onClick={() => resize(w.id, 0, -1)} rotate={-90} />
                        <SizeBtn label="Taller" onClick={() => resize(w.id, 0, 1)} rotate={90} />
                        <button onClick={() => remove(w.id)} title="Remove"
                          className="lq-ring-focus rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600">
                          <Icon name="close" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </header>
                  <div className="min-h-0 flex-1">
                    {loading ? <div className="lq-skeleton h-full min-h-16 w-full" /> : def.render(data)}
                  </div>
                </section>
              );
            })}
      </div>

      {widgets?.length === 0 && (
        <div className="lq-card mt-4 p-10 text-center text-sm text-zinc-400">
          Your dashboard is empty. Add a widget to get started.
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setShowAdd(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="lq-pop max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center">
              <h3 className="text-sm font-semibold">Add a widget</h3>
              <button onClick={() => setShowAdd(false)} className="ml-auto rounded p-1 text-zinc-400 hover:bg-zinc-100">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {WIDGETS.map((def) => (
                <button key={def.type} onClick={() => add(def.type)}
                  className="lq-ring-focus flex items-start gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Icon name={def.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{def.title}</span>
                    <span className="block text-xs text-zinc-500">{def.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SizeBtn({ label, onClick, rotate = 0 }: { label: string; onClick: () => void; rotate?: number }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className="lq-ring-focus rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
      <span className="block" style={{ transform: `rotate(${rotate}deg)` }}>
        <Icon name="chevron" className="h-3.5 w-3.5" />
      </span>
      <span className="sr-only">{label}</span>
    </button>
  );
}

function ParallaxHero({ greeting, name, org, right }: {
  greeting: string; name: string; org: string; right: React.ReactNode;
}) {
  const [y, setY] = useState(0);
  useEffect(() => {
    const onScroll = () => setY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="lq-accent-wash pointer-events-none absolute inset-0"
        style={{ transform: `translate3d(0, ${y * 0.18}px, 0)`, transition: "transform 60ms linear" }} />
      <div className="lq-grid-lines pointer-events-none absolute inset-0 opacity-40"
        style={{ transform: `translate3d(0, ${y * 0.06}px, 0)` }} />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {name}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">{org}</p>
        </div>
        {right}
      </div>
    </div>
  );
}
