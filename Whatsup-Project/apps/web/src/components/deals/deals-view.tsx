"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Deal, DealsAnalytics, Pipeline } from "@/lib/types";
import { HelpLink } from "@/components/help-link";
import { DealSheet } from "@/components/deals/deal-sheet";

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function DealsView() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [analytics, setAnalytics] = useState<DealsAnalytics | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | "new" | null>(null);
  const [newStageId, setNewStageId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");

  const loadPipelines = useCallback(async () => {
    const rows: Pipeline[] = await apiFetch("/pipelines");
    setPipelines(rows);
    if (rows.length && !pipelineId) setPipelineId(rows[0].id);
  }, [pipelineId]);

  const loadDeals = useCallback(async (pid: string) => {
    const [dealRows, analyticsRow]: [Deal[], DealsAnalytics] = await Promise.all([
      apiFetch(`/deals?pipelineId=${pid}`),
      apiFetch(`/deals/analytics?pipelineId=${pid}`),
    ]);
    setDeals(dealRows);
    setAnalytics(analyticsRow);
  }, []);

  useEffect(() => { loadPipelines(); }, [loadPipelines]);
  useEffect(() => { if (pipelineId) loadDeals(pipelineId); }, [pipelineId, loadDeals]);

  const pipeline = useMemo(() => pipelines.find((p) => p.id === pipelineId) ?? null, [pipelines, pipelineId]);
  const stages = useMemo(() => [...(pipeline?.stages ?? [])].sort((a, b) => a.position - b.position), [pipeline]);
  const dealsByStage = useMemo(() => {
    const m: Record<string, Deal[]> = {};
    for (const s of stages) m[s.id] = [];
    for (const d of deals) (m[d.stageId] ??= []).push(d);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.position - b.position);
    return m;
  }, [deals, stages]);

  async function moveDeal(dealId: string, stageId: string) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stageId } : d)));
    await apiFetch(`/deals/${dealId}`, { method: "PATCH", body: JSON.stringify({ stageId }) });
    if (pipelineId) loadDeals(pipelineId);
  }

  async function createPipeline() {
    if (!newPipelineName.trim()) return;
    const row: Pipeline = await apiFetch("/pipelines", { method: "POST", body: JSON.stringify({ name: newPipelineName.trim() }) });
    setNewPipelineName("");
    setShowNewPipeline(false);
    await loadPipelines();
    setPipelineId(row.id);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Deals</h1>
          {pipelines.length > 1 && (
            <select value={pipelineId ?? ""} onChange={(e) => setPipelineId(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <HelpLink anchor="deals" />
          <button onClick={() => setShowNewPipeline((s) => !s)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
            + Pipeline
          </button>
          <button onClick={() => setActiveDeal("new")} disabled={!stages.length}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
            + Add deal
          </button>
        </div>
      </div>

      {showNewPipeline && (
        <div className="mb-4 flex items-end gap-2 rounded-lg border border-zinc-200 bg-white p-4">
          <div>
            <label className="block text-xs text-zinc-500">Pipeline name</label>
            <input value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="e.g. Renewals" />
          </div>
          <button onClick={createPipeline} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Create</button>
          <button onClick={() => setShowNewPipeline(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
        </div>
      )}

      {analytics && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs text-zinc-500">Open pipeline value</div>
            <div className="text-lg font-semibold">{rupees(analytics.totalOpenValuePaise)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs text-zinc-500">Open deals</div>
            <div className="text-lg font-semibold">{analytics.openDealCount}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs text-zinc-500">Win rate (90d)</div>
            <div className="text-lg font-semibold">{analytics.winRate90d === null ? "—" : `${analytics.winRate90d}%`}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs text-zinc-500">Won / Lost (90d)</div>
            <div className="text-lg font-semibold">{analytics.won90d} / {analytics.lost90d}</div>
          </div>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((s) => {
          const colDeals = dealsByStage[s.id] ?? [];
          const colValue = colDeals.filter((d) => d.status === "open").reduce((sum, d) => sum + d.valuePaise, 0);
          return (
            <div key={s.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) moveDeal(dragId, s.id); setDragId(null); }}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50">
              <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-xs text-zinc-400">{colDeals.length}</span>
                </div>
                <button onClick={() => { setNewStageId(s.id); setActiveDeal("new"); }}
                  className="text-zinc-400 hover:text-emerald-600" title="Add deal to this stage">+</button>
              </div>
              <div className="px-3 py-1 text-xs text-zinc-400">{rupees(colValue)}</div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {colDeals.map((d) => (
                  <div key={d.id} draggable onDragStart={() => setDragId(d.id)} onClick={() => setActiveDeal(d)}
                    className="cursor-pointer rounded-md border border-zinc-200 bg-white p-2.5 shadow-sm hover:border-emerald-300">
                    <div className="text-sm font-medium">{d.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">{rupees(d.valuePaise)}</span>
                      {d.status !== "open" && (
                        <span className={`rounded px-1.5 py-0.5 ${d.status === "won" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                          {d.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {colDeals.length === 0 && <div className="px-1 py-4 text-center text-xs text-zinc-400">No deals</div>}
              </div>
            </div>
          );
        })}
        {stages.length === 0 && <div className="text-sm text-zinc-400">No pipeline yet — create one above.</div>}
      </div>

      {activeDeal && pipelineId && (
        <DealSheet
          deal={activeDeal === "new" ? null : activeDeal}
          pipelineId={pipelineId}
          defaultStageId={newStageId ?? stages[0]?.id ?? ""}
          onClose={() => { setActiveDeal(null); setNewStageId(null); }}
          onSaved={() => { setActiveDeal(null); setNewStageId(null); if (pipelineId) loadDeals(pipelineId); }}
        />
      )}
    </div>
  );
}
