"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/nav-icons";

type Scored = {
  id: string; name: string; phoneE164: string; email: string | null; tags: string[];
  stage: string | null; source: string | null; ownerId: string | null; ownerName: string | null;
  score: number; scoreReasons: string[];
};
type Source = { source: string; total: number; customers: number; conversionRate: number };
type Rule = { id: string; name: string; criterion: string; value: string | null; points: number; enabled: boolean };
type DistRule = { id: string; name: string; strategy: string; targetTeamId: string | null; targetUserIds: string[]; enabled: boolean };

const CRITERIA = [
  ["has_tag", "Has tag"], ["source_is", "Source is"], ["stage_is", "Stage is"],
  ["has_open_deal", "Has an open deal"], ["deal_value_over", "Deal value over (paise)"],
  ["replied_within_days", "Replied within N days"],
] as const;
const input = "w-full rounded-md border border-zinc-300 px-2 py-1 text-sm";

function scoreColor(s: number) {
  if (s >= 60) return "bg-emerald-600 text-white";
  if (s >= 30) return "bg-amber-100 text-amber-700";
  return "bg-zinc-100 text-zinc-500";
}

export function LeadsView() {
  const [tab, setTab] = useState<"scored" | "sources" | "rules">("scored");
  const [leads, setLeads] = useState<Scored[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [dist, setDist] = useState<DistRule[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState({ name: "", criterion: "has_tag", value: "", points: 10 });
  const [distForm, setDistForm] = useState({ name: "", strategy: "round_robin", targetTeamId: "" });

  const load = useCallback(async () => {
    const [l, s, r, d, t] = await Promise.all([
      apiFetch("/leads/scored"), apiFetch("/leads/sources"),
      apiFetch("/lead-scoring-rules"), apiFetch("/distribution-rules"),
      apiFetch("/teams").catch(() => []),
    ]);
    setLeads(l); setSources(s); setRules(r); setDist(d); setTeams(t);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addRule() {
    if (!ruleForm.name.trim()) return;
    await apiFetch("/lead-scoring-rules", { method: "POST", body: JSON.stringify(ruleForm) });
    setRuleForm({ name: "", criterion: "has_tag", value: "", points: 10 });
    await load();
  }

  async function addDist() {
    if (!distForm.name.trim() || !distForm.targetTeamId) return;
    await apiFetch("/distribution-rules", { method: "POST", body: JSON.stringify({ ...distForm, conditions: [] }) });
    setDistForm({ name: "", strategy: "round_robin", targetTeamId: "" });
    await load();
  }

  async function distribute(dryRun: boolean) {
    setNotice(null);
    try {
      const r = await apiFetch("/leads/distribute", { method: "POST", body: JSON.stringify({ dryRun }) });
      setNotice(dryRun
        ? `Dry run: ${r.assigned} of ${r.considered} unowned leads would be assigned.`
        : `Assigned ${r.assigned} leads.`);
      if (!dryRun) await load();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const m = raw.match(/\{.*\}/);
      setNotice(m ? (JSON.parse(m[0]).error ?? raw) : raw);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-zinc-500">
          Scored by your own rules, bucketed by source, and distributed to agents automatically.
        </p>
      </div>

      <div className="mb-3 flex gap-2">
        {(["scored", "sources", "rules"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${tab === t ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {t === "rules" ? "Scoring & distribution" : t}
          </button>
        ))}
      </div>

      {notice && <p className="mb-3 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">{notice}</p>}

      {tab === "scored" && (
        <div className="lq-card overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3">
            <span className="text-sm font-medium">Hottest first</span>
            <span className="text-xs text-zinc-400">{leads.length} leads</span>
            <div className="ml-auto flex gap-2">
              <button onClick={() => distribute(true)} className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50">Preview distribution</button>
              <button onClick={() => distribute(false)} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white">Distribute unowned</button>
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="px-3 py-2">Score</th><th>Lead</th><th>Stage</th><th>Source</th><th>Owner</th><th>Why</th></tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColor(l.score)}`}>{l.score}</span>
                  </td>
                  <td>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-[11px] text-zinc-400">{l.phoneE164}</div>
                  </td>
                  <td className="text-xs capitalize">{l.stage ?? "—"}</td>
                  <td className="text-xs">{l.source ?? "—"}</td>
                  <td className="text-xs">{l.ownerName ?? <span className="text-amber-600">unowned</span>}</td>
                  <td className="text-[11px] text-zinc-500">{l.scoreReasons.join(", ") || "no rules matched"}</td>
                </tr>
              ))}
              {leads.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-sm text-zinc-400">No contacts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "sources" && (
        <div className="lq-card p-4">
          <div className="mb-3 text-sm font-medium">Where leads come from</div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="py-1">Source</th><th>Leads</th><th>Became customers</th><th>Conversion</th></tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source} className="border-t border-zinc-100">
                  <td className="py-2 capitalize">{s.source}</td>
                  <td>{s.total}</td>
                  <td>{s.customers}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${s.conversionRate}%` }} />
                      </div>
                      <span className="text-xs">{s.conversionRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {sources.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-sm text-zinc-400">No source data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "rules" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lq-card p-4">
            <div className="mb-1 text-sm font-medium">Scoring rules</div>
            <p className="mb-3 text-xs text-zinc-500">
              Scores are computed on demand, so a change here applies to every lead immediately.
            </p>
            <div className="mb-3 space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md border border-zinc-200 p-2 text-sm">
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">+{r.points}</span>
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-[11px] text-zinc-400">{r.criterion}{r.value ? `: ${r.value}` : ""}</span>
                  <button onClick={async () => { await apiFetch(`/lead-scoring-rules/${r.id}`, { method: "DELETE" }); await load(); }}
                    className="text-xs text-zinc-400 hover:text-red-600">✕</button>
                </div>
              ))}
              {rules.length === 0 && <div className="text-xs text-zinc-400">No scoring rules — every lead scores zero.</div>}
            </div>
            <div className="grid gap-2 rounded-md bg-zinc-50 p-2 sm:grid-cols-2">
              <input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                className={input} placeholder="Rule name" />
              <select value={ruleForm.criterion} onChange={(e) => setRuleForm({ ...ruleForm, criterion: e.target.value })} className={input}>
                {CRITERIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input value={ruleForm.value} onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })}
                className={input} placeholder="Value (if the criterion needs one)" />
              <div className="flex gap-2">
                <input type="number" value={ruleForm.points} onChange={(e) => setRuleForm({ ...ruleForm, points: Number(e.target.value) })}
                  className={input} placeholder="Points" />
                <button onClick={addRule} className="shrink-0 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white">Add</button>
              </div>
            </div>
          </div>

          <div className="lq-card p-4">
            <div className="mb-1 text-sm font-medium">Distribution rules</div>
            <p className="mb-3 text-xs text-zinc-500">
              Round-robin remembers where it got to, so assignment keeps rotating across restarts.
              Least-loaded picks whoever owns the fewest leads.
            </p>
            <div className="mb-3 space-y-2">
              {dist.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-md border border-zinc-200 p-2 text-sm">
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] capitalize">{d.strategy.replace("_", " ")}</span>
                  <button onClick={async () => { await apiFetch(`/distribution-rules/${d.id}`, { method: "DELETE" }); await load(); }}
                    className="text-xs text-zinc-400 hover:text-red-600">✕</button>
                </div>
              ))}
              {dist.length === 0 && <div className="text-xs text-zinc-400">No distribution rules — leads stay unowned.</div>}
            </div>
            <div className="grid gap-2 rounded-md bg-zinc-50 p-2">
              <input value={distForm.name} onChange={(e) => setDistForm({ ...distForm, name: e.target.value })}
                className={input} placeholder="Rule name" />
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={distForm.strategy} onChange={(e) => setDistForm({ ...distForm, strategy: e.target.value })} className={input}>
                  <option value="round_robin">Round robin</option>
                  <option value="least_loaded">Least loaded</option>
                  <option value="fixed">Always the first agent</option>
                </select>
                <select value={distForm.targetTeamId} onChange={(e) => setDistForm({ ...distForm, targetTeamId: e.target.value })} className={input}>
                  <option value="">Pick a team…</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <button onClick={addDist} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">Add rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
