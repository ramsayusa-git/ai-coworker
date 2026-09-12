"use client";
import { useCallback, useEffect, useState } from "react";
import type { AdCampaign, AdPlatform, Channel } from "@/lib/types";
import { AD_PLATFORMS, AD_PLATFORM_LABELS } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { SocialPostsPanel } from "./social-posts-panel";

const statusColor: Record<AdCampaign["status"], string> = {
  draft: "bg-zinc-100 text-zinc-600", scheduled: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700", failed: "bg-red-100 text-red-700",
};

function paiseToRupees(p: number) { return `₹${(p / 100).toLocaleString()}`; }

function AdCampaignsPanel() {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", dailyBudget: 500, channelId: "", platform: "whatsapp" as AdPlatform, scheduledAt: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [st, list, ch] = await Promise.all([apiFetch("/ads/status"), apiFetch("/ads/campaigns"), apiFetch("/channels")]);
    setStatus(st);
    setCampaigns(list);
    setChannels(ch);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.name.trim() || form.dailyBudget <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const row = await apiFetch("/ads/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(), dailyBudgetPaise: Math.round(form.dailyBudget * 100),
          channelId: form.platform === "whatsapp" ? form.channelId || undefined : undefined,
          platform: form.platform,
          scheduledAt: form.scheduledAt || undefined,
        }),
      });
      if (row?.status === "failed") setError(row.errorMessage ?? "Campaign creation failed");
      setForm({ name: "", dailyBudget: 500, channelId: "", platform: "whatsapp", scheduledAt: "" });
      setShowNew(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ad Campaigns</h2>
        <button onClick={() => setShowNew((s) => !s)}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + New campaign
        </button>
      </div>
      <p className="mb-4 text-xs text-zinc-500">Real paid ad campaigns across WhatsApp, Facebook, Instagram, Twitter/X, LinkedIn, Google Ads and TikTok.</p>

      {status && !status[form.platform] && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {AD_PLATFORM_LABELS[form.platform]} Ads is not connected yet — you can still create a campaign below to see the real
          error naming which credentials are missing; nothing is sent to the platform until those are set in the server&apos;s environment.
        </div>
      )}

      {showNew && (
        <div className="mb-4 space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500">Platform</label>
              <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as AdPlatform })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                {AD_PLATFORMS.map((p) => (
                  <option key={p} value={p}>{AD_PLATFORM_LABELS[p]} {status && !status[p] ? "(not connected)" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Campaign name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="e.g. Diwali Sale" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Daily budget (₹)</label>
              <input type="number" min={1} value={form.dailyBudget} onChange={(e) => setForm({ ...form, dailyBudget: Number(e.target.value) })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            </div>
            {form.platform === "whatsapp" && (
              <div>
                <label className="block text-xs text-zinc-500">Destination WhatsApp channel</label>
                <select value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
                  <option value="">No specific channel</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>{c.displayName} ({c.phone})</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-zinc-500">Send or schedule</label>
              <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
              <p className="mt-0.5 text-[11px] text-zinc-400">Leave empty to launch immediately on save.</p>
            </div>
          </div>
          <p className="text-xs text-zinc-400">
            This creates the real top-level Campaign object on the platform (paused). Ad-set targeting, budget pacing and the
            ad creative still need to be finished in that platform&apos;s own Ads Manager directly — this app doesn&apos;t collect
            creative assets or per-platform Page/account linkage yet.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={create} disabled={saving || !form.name.trim()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {saving ? "Saving…" : form.scheduledAt ? "Schedule campaign" : "Create campaign"}
            </button>
            <button onClick={() => setShowNew(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Campaign</th>
              <th className="px-4 py-2 font-medium">Platform</th>
              <th className="px-4 py-2 font-medium">Daily budget</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">External ID</th>
              <th className="px-4 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2 text-zinc-600">{AD_PLATFORM_LABELS[c.platform]}</td>
                <td className="px-4 py-2 text-zinc-600">{paiseToRupees(c.dailyBudgetPaise)}/day</td>
                <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-xs capitalize ${statusColor[c.status]}`}>{c.status}</span></td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-500">{c.externalCampaignId ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-red-500">{c.errorMessage ?? ""}</td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400">No ad campaigns yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdsManagerView() {
  const [tab, setTab] = useState<"ads" | "social">("ads");
  return (
    <div>
      <h1 className="mb-3 text-2xl font-semibold">Ads &amp; Social Manager</h1>
      <div className="mb-4 flex gap-4 border-b border-zinc-200 text-sm">
        <button onClick={() => setTab("ads")} className={`border-b-2 px-1 pb-2 ${tab === "ads" ? "border-emerald-600 font-medium text-emerald-700" : "border-transparent text-zinc-500"}`}>Ad Campaigns</button>
        <button onClick={() => setTab("social")} className={`border-b-2 px-1 pb-2 ${tab === "social" ? "border-emerald-600 font-medium text-emerald-700" : "border-transparent text-zinc-500"}`}>Organic Posts</button>
      </div>
      {tab === "ads" ? <AdCampaignsPanel /> : <SocialPostsPanel />}
    </div>
  );
}
