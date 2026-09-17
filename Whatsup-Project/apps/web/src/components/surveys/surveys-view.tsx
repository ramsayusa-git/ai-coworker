"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/nav-icons";
import { Ring } from "@/components/dashboard/charts";

type Survey = {
  id: string; name: string; kind: string; question: string; trigger: string; enabled: boolean;
  delayMinutes: number; sent: number; answered: number; responseRate: number;
  averageScore: number | null; nps: number | null;
};
type Response = {
  id: string; score: number | null; comment: string | null; status: string;
  sentAt: string; answeredAt: string | null; contactName: string | null;
};

const input = "w-full rounded-md border border-zinc-300 px-2 py-1 text-sm";
const TRIGGERS = [
  ["none", "Manual only"],
  ["conversation_resolved", "When a conversation is resolved"],
  ["ticket_closed", "When a ticket is closed"],
] as const;

export function SurveysView() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [csat, setCsat] = useState<{
    sent: number; answered: number; responseRate: number;
    averageScore: number; csatAnswered: number;
    nps: number | null; npsAnswered: number;
  } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "csat", question: "How did we do today?", trigger: "none", delayMinutes: 15 });

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([apiFetch("/surveys"), apiFetch("/csat").catch(() => null)]);
    setSurveys(s); setCsat(c);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function open(s: Survey) {
    if (openId === s.id) { setOpenId(null); return; }
    setOpenId(s.id);
    setResponses(await apiFetch(`/surveys/${s.id}/responses`));
  }

  async function create() {
    if (!form.name.trim() || !form.question.trim()) return;
    await apiFetch("/surveys", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", kind: "csat", question: "How did we do today?", trigger: "none", delayMinutes: 15 });
    setShowNew(false);
    await load();
  }

  async function toggle(s: Survey) {
    await apiFetch(`/surveys/${s.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !s.enabled }) });
    await load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Surveys</h1>
          <p className="text-sm text-zinc-500">
            CSAT and NPS over WhatsApp. A number replied within 48 hours is recorded as the score.
          </p>
        </div>
        <button onClick={() => setShowNew((s) => !s)}
          className="lq-ring-focus flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">
          <Icon name="plus" className="h-3.5 w-3.5" /> New survey
        </button>
      </div>

      {csat && csat.sent > 0 && (
        <div className="lq-card mb-4 flex flex-wrap items-center gap-8 p-4">
          <Ring value={csat.averageScore / 5} label="Average CSAT" />
          <div>
            <div className="text-xs text-zinc-500">Average score</div>
            <div className="text-2xl font-semibold">{csat.averageScore}<span className="text-sm text-zinc-400"> / 5</span></div>
          </div>
          {csat.nps !== null && csat.nps !== undefined && (
            <div>
              <div className="text-xs text-zinc-500">NPS</div>
              <div className="text-2xl font-semibold">{csat.nps}</div>
              <div className="text-[11px] text-zinc-400">{csat.npsAnswered} response{csat.npsAnswered === 1 ? "" : "s"}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-zinc-500">Responses</div>
            <div className="text-2xl font-semibold">{csat.answered}<span className="text-sm text-zinc-400"> / {csat.sent}</span></div>
            <div className="text-[11px] text-zinc-400">{csat.responseRate}% reply rate</div>
          </div>
        </div>
      )}

      {showNew && (
        <div className="mb-4 grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-zinc-500">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={input} placeholder="Post-service CSAT" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Type</label>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={input}>
              <option value="csat">CSAT (1-5)</option>
              <option value="nps">NPS (0-10)</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-500">Question</label>
            <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} className={input} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Send when</label>
            <select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} className={input}>
              {TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Wait first (minutes)</label>
            <input type="number" min={0} value={form.delayMinutes}
              onChange={(e) => setForm({ ...form, delayMinutes: Number(e.target.value) })} className={input} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={create} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Create</button>
            <button onClick={() => setShowNew(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {surveys.map((s) => (
          <div key={s.id} className="lq-card overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-3">
              <button onClick={() => open(s)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] uppercase">{s.kind}</span>
                  {!s.enabled && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">paused</span>}
                </div>
                <div className="truncate text-[11px] text-zinc-400">{s.question}</div>
              </button>
              <div className="text-right">
                <div className="text-sm font-semibold">
                  {s.kind === "nps" ? (s.nps ?? "—") : (s.averageScore ?? "—")}
                  <span className="text-[11px] font-normal text-zinc-400">{s.kind === "nps" ? " NPS" : " avg"}</span>
                </div>
                <div className="text-[11px] text-zinc-400">{s.answered}/{s.sent} · {s.responseRate}%</div>
              </div>
              <button onClick={() => toggle(s)} className="text-xs text-zinc-500 hover:text-emerald-700">
                {s.enabled ? "Pause" : "Resume"}
              </button>
              <Icon name="chevron" className={`h-3.5 w-3.5 text-zinc-300 transition-transform ${openId === s.id ? "rotate-90" : ""}`} />
            </div>

            {openId === s.id && (
              <div className="border-t border-zinc-100 bg-zinc-50/60 p-3">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr><th className="py-1">Contact</th><th>Score</th><th>Comment</th><th>When</th></tr>
                  </thead>
                  <tbody>
                    {responses.map((r) => (
                      <tr key={r.id} className="border-t border-zinc-100">
                        <td className="py-1.5 text-xs">{r.contactName ?? "—"}</td>
                        <td>
                          {r.score === null
                            ? <span className="text-[11px] text-zinc-400">awaiting reply</span>
                            : <span className="font-semibold">{r.score}</span>}
                        </td>
                        <td className="text-xs text-zinc-500">{r.comment ?? ""}</td>
                        <td className="text-[11px] text-zinc-400">
                          {new Date(r.answeredAt ?? r.sentAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {responses.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-xs text-zinc-400">Not sent to anyone yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {surveys.length === 0 && (
          <div className="lq-card p-10 text-center text-sm text-zinc-400">No surveys yet.</div>
        )}
      </div>
    </div>
  );
}
