"use client";
import { useEffect, useState } from "react";
import type { AnalyticsSummary } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { HelpLink } from "@/components/help-link";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  useEffect(() => { apiFetch("/analytics").then(setData); }, []);
  if (!data) return <div className="text-sm text-zinc-400">Loading…</div>;

  const max = Math.max(1, ...data.dailySeries.map((d) => d.sent));
  const channelMax = Math.max(1, ...data.channelSplit.map((c) => c.count));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <HelpLink anchor="analytics" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Messages sent (30d)" value={data.messagesSent.toLocaleString()} />
        <Kpi label="Messages received (30d)" value={data.messagesReceived.toLocaleString()} />
        <Kpi label="Active conversations" value={String(data.activeConversations)} />
        <Kpi label="Avg. response time" value={data.avgResponseTimeMin != null ? `${data.avgResponseTimeMin}m` : "—"} />
        <Kpi label="Delivery rate" value={`${(data.deliveryRate * 100).toFixed(1)}%`} />
        <Kpi label="Read rate" value={`${(data.readRate * 100).toFixed(1)}%`} />
        <Kpi label="Cost mirror (30d)" value={`₹${(data.costPaise / 100).toLocaleString("en-IN")}`} sub="Estimated Meta conversation cost" />
        <Kpi label="Channels" value={String(data.channelSplit.length)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-medium">Messages — last 14 days</div>
          <div className="flex h-40 items-end gap-1.5">
            {data.dailySeries.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-0.5" title={`${d.date}: ${d.sent} sent / ${d.received} received`}>
                <div className="flex w-full flex-col justify-end gap-0.5" style={{ height: "140px" }}>
                  <div className="w-full rounded-t bg-emerald-500" style={{ height: `${(d.sent / max) * 100}%` }} />
                  <div className="w-full rounded-t bg-sky-300" style={{ height: `${(d.received / max) * 60}%` }} />
                </div>
                <span className="text-[9px] text-zinc-400">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500" /> Sent</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-sky-300" /> Received</span>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-3 text-sm font-medium">Channel split</div>
          <div className="space-y-3">
            {data.channelSplit.map((c) => (
              <div key={c.channel}>
                <div className="flex justify-between text-xs text-zinc-600"><span>{c.channel}</span><span>{c.count.toLocaleString()}</span></div>
                <div className="mt-1 h-2 rounded-full bg-zinc-100">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(c.count / channelMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-3 text-sm font-medium">Conversation status</div>
          <div className="space-y-2">
            {(["open", "pending", "snoozed", "resolved"] as const).map((s) => (
              <div key={s} className="flex items-center justify-between text-sm">
                <span className="capitalize text-zinc-600">{s}</span>
                <span className="font-medium">{data.statusBreakdown[s]}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-sm">
              <span className="text-zinc-600">New contacts (30d)</span>
              <span className="font-medium">{data.newContacts}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-medium">Agent performance</div>
          {data.agentLeaderboard.length === 0 ? (
            <div className="text-sm text-zinc-400">No conversations assigned yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr><th className="py-1 font-medium">Agent</th><th className="py-1 font-medium">Assigned</th><th className="py-1 font-medium">Resolved</th></tr>
              </thead>
              <tbody>
                {data.agentLeaderboard.map((a) => (
                  <tr key={a.name} className="border-t border-zinc-100">
                    <td className="py-1.5 font-medium">{a.name}</td>
                    <td className="py-1.5 text-zinc-600">{a.assigned}</td>
                    <td className="py-1.5 text-zinc-600">{a.resolved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium">Top campaigns</div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
            <tr><th className="px-4 py-2 font-medium">Campaign</th><th className="px-4 py-2 font-medium">Delivered</th><th className="px-4 py-2 font-medium">Read</th><th className="px-4 py-2 font-medium">CTR</th></tr>
          </thead>
          <tbody>
            {data.topCampaigns.map((c) => (
              <tr key={c.name} className="border-t border-zinc-100">
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2 text-zinc-600">{c.delivered.toLocaleString()}</td>
                <td className="px-4 py-2 text-zinc-600">{c.read.toLocaleString()}</td>
                <td className="px-4 py-2 text-zinc-600">{(c.ctr * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
