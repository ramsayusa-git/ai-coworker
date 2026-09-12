"use client";
import { useRef, useState } from "react";
import type { Bot, BotEdge, BotNode, BotNodeType } from "@/lib/types";

const nodeStyle: Record<BotNodeType, string> = {
  trigger: "border-emerald-400 bg-emerald-50",
  message: "border-sky-400 bg-sky-50",
  condition: "border-amber-400 bg-amber-50",
  ai: "border-purple-400 bg-purple-50",
  handoff: "border-zinc-400 bg-zinc-100",
};
const NODE_W = 200;
const NODE_H = 84;
const NODE_TYPES: BotNodeType[] = ["trigger", "message", "condition", "ai", "handoff"];

function newId(nodes: BotNode[]) {
  let i = nodes.length + 1;
  while (nodes.some((n) => n.id === `n${i}`)) i++;
  return `n${i}`;
}

export function BotFlowEditor({ bot, onSave }: { bot: Bot; onSave: (patch: { name: string; triggerSummary: string; nodes: BotNode[]; edges: BotEdge[] }) => Promise<void> }) {
  const [nodes, setNodes] = useState<BotNode[]>(bot.nodes);
  const [edges, setEdges] = useState<BotEdge[]>(bot.edges);
  const [name, setName] = useState(bot.name);
  const [triggerSummary, setTriggerSummary] = useState(bot.triggerSummary);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const width = Math.max(900, ...nodes.map((n) => n.x + NODE_W + 60));
  const height = Math.max(420, ...nodes.map((n) => n.y + NODE_H + 60));

  function markDirty() { setDirty(true); }

  function addNode(type: BotNodeType) {
    const id = newId(nodes);
    setNodes((prev) => [...prev, { id, type, label: type[0].toUpperCase() + type.slice(1), detail: "Edit this step", x: 40, y: 40 + prev.length * 30 }]);
    setSelectedId(id);
    markDirty();
  }

  function deleteNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
    if (selectedId === id) setSelectedId(null);
    if (linkingFrom === id) setLinkingFrom(null);
    markDirty();
  }

  function updateSelected(patch: Partial<BotNode>) {
    if (!selectedId) return;
    setNodes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, ...patch } : n)));
    markDirty();
  }

  function handleNodeClick(id: string) {
    if (dragRef.current?.moved) return; // don't treat a drag-release as a click
    if (linkingFrom) {
      if (linkingFrom !== id && !edges.some((e) => e.from === linkingFrom && e.to === id)) {
        setEdges((prev) => [...prev, { from: linkingFrom, to: id }]);
        markDirty();
      }
      setLinkingFrom(null);
      return;
    }
    setSelectedId(id);
  }

  function deleteEdge(index: number) {
    setEdges((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { id, moved: false };
  }
  function onPointerMove(e: React.PointerEvent, id: string) {
    if (dragRef.current?.id !== id || (e.buttons & 1) === 0) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 0) dragRef.current.moved = true;
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x: Math.max(0, n.x + e.movementX), y: Math.max(0, n.y + e.movementY) } : n)));
  }
  function onPointerUp(e: React.PointerEvent, id: string) {
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (dragRef.current?.id === id && dragRef.current.moved) markDirty();
    setTimeout(() => { dragRef.current = null; }, 0);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ name, triggerSummary, nodes, edges });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => { setName(e.target.value); markDirty(); }}
          className="rounded border border-zinc-300 px-2 py-1 text-sm font-medium" />
        <input value={triggerSummary} onChange={(e) => { setTriggerSummary(e.target.value); markDirty(); }}
          placeholder="Trigger summary" className="flex-1 min-w-[200px] rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600" />
        {NODE_TYPES.map((t) => (
          <button key={t} onClick={() => addNode(t)}
            className={`rounded border px-2 py-1 text-xs capitalize ${nodeStyle[t]}`}>+ {t}</button>
        ))}
        <button onClick={save} disabled={!dirty || saving}
          className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {linkingFrom && (
        <div className="mb-2 rounded bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
          Click the node you want to connect to — or click the 🔗 button again to cancel.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="overflow-auto rounded-lg border border-zinc-200 bg-zinc-50" style={{ maxHeight: 520 }}>
          <div className="relative" style={{ width, height }}>
            <svg width={width} height={height} className="pointer-events-none absolute inset-0">
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="#a1a1aa" />
                </marker>
              </defs>
              {edges.map((e, i) => {
                const a = byId.get(e.from), b = byId.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
                const midX = (x1 + x2) / 2;
                return <path key={i} d={`M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`} fill="none" stroke="#a1a1aa" strokeWidth={1.5} markerEnd="url(#arrow)" />;
              })}
            </svg>
            {nodes.map((n) => (
              <div key={n.id}
                onPointerDown={(e) => onPointerDown(e, n.id)}
                onPointerMove={(e) => onPointerMove(e, n.id)}
                onPointerUp={(e) => onPointerUp(e, n.id)}
                onClick={() => handleNodeClick(n.id)}
                style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                className={`absolute cursor-grab select-none rounded-lg border-2 p-2 shadow-sm active:cursor-grabbing ${nodeStyle[n.type]} ${selectedId === n.id ? "ring-2 ring-emerald-500" : ""} ${linkingFrom === n.id ? "ring-2 ring-indigo-500" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-zinc-500">{n.type}</span>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setLinkingFrom((cur) => (cur === n.id ? null : n.id)); }}
                      title="Connect to another node" className="text-xs text-zinc-400 hover:text-indigo-600">🔗</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteNode(n.id); }}
                      title="Delete node" className="text-xs text-zinc-400 hover:text-red-600">×</button>
                  </div>
                </div>
                <div className="truncate text-sm font-semibold text-zinc-800">{n.label}</div>
                <div className="truncate text-[11px] text-zinc-500">{n.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {selected ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-zinc-400">Edit node</div>
              <label className="mb-2 block text-xs text-zinc-500">
                Type
                <select value={selected.type} onChange={(e) => updateSelected({ type: e.target.value as BotNodeType })}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs">
                  {NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="mb-2 block text-xs text-zinc-500">
                Label
                <input value={selected.label} onChange={(e) => updateSelected({ label: e.target.value })}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs" />
              </label>
              <label className="block text-xs text-zinc-500">
                Detail
                <textarea value={selected.detail} onChange={(e) => updateSelected({ detail: e.target.value })} rows={3}
                  className="mt-1 w-full resize-none rounded border border-zinc-300 px-2 py-1 text-xs" />
              </label>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-400">
              Click a node to edit it, drag to reposition, or use 🔗 to connect it to another node.
            </div>
          )}

          {edges.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-zinc-400">Connections</div>
              <ul className="space-y-1 text-xs">
                {edges.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-zinc-600">
                    <span className="truncate">{byId.get(e.from)?.label ?? e.from} → {byId.get(e.to)?.label ?? e.to}</span>
                    <button onClick={() => deleteEdge(i)} className="text-zinc-400 hover:text-red-600">×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
