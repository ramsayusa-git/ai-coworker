"use client";
import { useCallback, useEffect, useState } from "react";
import type { Bot, BotEdge, BotNode } from "@/lib/types";
import { BotFlowEditor } from "./bot-flow-editor";
import { apiFetch } from "@/lib/api";
import { HelpLink } from "@/components/help-link";

type ApiBot = Omit<Bot, "channels" | "sessionsToday" | "handoffRate"> & { channelIds: string[] };

function fromApi(b: ApiBot): Bot {
  return { ...b, channels: b.channelIds, sessionsToday: 0, handoffRate: 0 };
}

export function BotsView() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    const rows: ApiBot[] = await apiFetch("/bots");
    const data = rows.map(fromApi);
    setBots(data);
    setSelected((s) => s ?? data[0]?.id ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(id: string, enabled: boolean) {
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, enabled } : b)));
    await apiFetch(`/bots/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
  }

  async function createBot() {
    if (!newName.trim()) return;
    const bot: ApiBot = await apiFetch("/bots", { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
    setNewName("");
    setCreating(false);
    await load();
    setSelected(bot.id);
  }

  async function saveFlow(id: string, patch: { name: string; triggerSummary: string; nodes: BotNode[]; edges: BotEdge[] }) {
    const updated: ApiBot = await apiFetch(`/bots/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    setBots((prev) => prev.map((b) => (b.id === id ? fromApi(updated) : b)));
  }

  const current = bots.find((b) => b.id === selected) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bots</h1>
        <div className="flex items-center gap-2">
        <HelpLink anchor="bots" />
        {creating ? (
          <div className="flex gap-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createBot(); }}
              placeholder="Bot name" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            <button onClick={createBot} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Create</button>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            + New bot
          </button>
        )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {bots.map((b) => (
            <button key={b.id} onClick={() => setSelected(b.id)}
              className={`w-full rounded-lg border p-3 text-left ${selected === b.id ? "border-emerald-400 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{b.name}</span>
                <span onClick={(e) => { e.stopPropagation(); toggle(b.id, !b.enabled); }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.enabled ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-500"}`}>
                  {b.enabled ? "ON" : "OFF"}
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">{b.triggerSummary}</div>
              <div className="mt-2 flex gap-3 text-xs text-zinc-400">
                <span>{b.sessionsToday} sessions today</span>
                <span>{Math.round(b.handoffRate * 100)}% handoff</span>
              </div>
            </button>
          ))}
          {bots.length === 0 && <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400">No bots yet — create one above.</div>}
        </div>

        {current && (
          // key={current.id} forces a fresh editor instance (and local state) per bot
          <BotFlowEditor key={current.id} bot={current} onSave={(patch) => saveFlow(current.id, patch)} />
        )}
      </div>
    </div>
  );
}
