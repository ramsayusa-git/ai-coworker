"use client";
import { useCallback, useEffect, useState } from "react";
import type { Bot } from "@/lib/types";
import { BotGraph } from "./bot-graph";
import { apiFetch } from "@/lib/api";

type ApiBot = Omit<Bot, "channels" | "sessionsToday" | "handoffRate"> & { channelIds: string[] };

function fromApi(b: ApiBot): Bot {
  return { ...b, channels: b.channelIds, sessionsToday: 0, handoffRate: 0 };
}

export function BotsView() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

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

  const current = bots.find((b) => b.id === selected) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bots</h1>
        <button disabled className="cursor-not-allowed rounded-md bg-zinc-300 px-3 py-1.5 text-sm font-medium text-white">
          + New bot (builder coming soon)
        </button>
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
        </div>

        {current && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">{current.name} — flow</h2>
              <span className="text-xs text-zinc-400">Read-only preview · full builder coming soon</span>
            </div>
            <BotGraph bot={current} />
          </div>
        )}
      </div>
    </div>
  );
}
