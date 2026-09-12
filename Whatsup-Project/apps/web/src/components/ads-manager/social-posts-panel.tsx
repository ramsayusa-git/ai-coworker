"use client";
import { useCallback, useEffect, useState } from "react";
import type { OrganicPlatform, SocialPost } from "@/lib/types";
import { ORGANIC_PLATFORMS, ORGANIC_PLATFORM_LABELS } from "@/lib/types";
import { apiFetch } from "@/lib/api";

const statusColor: Record<SocialPost["status"], string> = {
  draft: "bg-zinc-100 text-zinc-600", scheduled: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700", failed: "bg-red-100 text-red-700",
};

export function SocialPostsPanel() {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ platforms: [] as OrganicPlatform[], caption: "", mediaUrl: "", scheduledAt: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [st, list] = await Promise.all([apiFetch("/social/status"), apiFetch("/social/posts")]);
    setStatus(st);
    setPosts(list);
  }, []);
  useEffect(() => { load(); }, [load]);

  function togglePlatform(p: OrganicPlatform) {
    setForm((f) => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] }));
  }

  async function create() {
    if (!form.caption.trim() || form.platforms.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const row = await apiFetch("/social/posts", {
        method: "POST",
        body: JSON.stringify({
          platforms: form.platforms, caption: form.caption.trim(),
          mediaUrl: form.mediaUrl || undefined, scheduledAt: form.scheduledAt || undefined,
        }),
      });
      if (row?.status === "failed") setError("One or more platforms failed to publish — see the Results column below.");
      setForm({ platforms: [], caption: "", mediaUrl: "", scheduledAt: "" });
      setShowNew(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create post");
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Organic Posts</h2>
        <button onClick={() => setShowNew((s) => !s)}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + New post
        </button>
      </div>
      <p className="mb-4 text-xs text-zinc-500">Publish (or schedule) one caption to any combination of Facebook, Instagram, Twitter/X, LinkedIn and TikTok — real per-platform API calls.</p>

      {showNew && (
        <div className="mb-4 space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <div>
            <label className="block text-xs text-zinc-500">Platforms</label>
            <div className="mt-1 flex flex-wrap gap-3">
              {ORGANIC_PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.platforms.includes(p)} onChange={() => togglePlatform(p)} />
                  {ORGANIC_PLATFORM_LABELS[p]} {status && !status[p] ? <span className="text-[11px] text-amber-600">(not connected)</span> : null}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Caption</label>
            <textarea value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} rows={3}
              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="What do you want to say?" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500">Media URL (image/video, required for Instagram &amp; TikTok)</label>
              <input value={form.mediaUrl} onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" placeholder="https://…" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Send or schedule</label>
              <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
              <p className="mt-0.5 text-[11px] text-zinc-400">Leave empty to publish immediately on save.</p>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={create} disabled={saving || !form.caption.trim() || form.platforms.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {saving ? "Saving…" : form.scheduledAt ? "Schedule post" : "Publish now"}
            </button>
            <button onClick={() => setShowNew(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Caption</th>
              <th className="px-4 py-2 font-medium">Platforms</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Per-platform results</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 align-top">
                <td className="max-w-xs truncate px-4 py-2 font-medium">{p.caption}</td>
                <td className="px-4 py-2 text-zinc-600">{p.platforms.map((pl) => ORGANIC_PLATFORM_LABELS[pl]).join(", ")}</td>
                <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-xs capitalize ${statusColor[p.status]}`}>{p.status}</span></td>
                <td className="px-4 py-2 text-xs">
                  {Object.entries(p.results ?? {}).map(([platform, r]) => (
                    <div key={platform} className={r.status === "published" ? "text-emerald-600" : "text-red-500"}>
                      {ORGANIC_PLATFORM_LABELS[platform as OrganicPlatform] ?? platform}: {r.status === "published" ? (r.externalId ?? "published") : r.error}
                    </div>
                  ))}
                  {(!p.results || Object.keys(p.results).length === 0) && <span className="text-zinc-400">—</span>}
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400">No posts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
