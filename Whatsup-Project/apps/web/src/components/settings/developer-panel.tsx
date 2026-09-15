"use client";
import { useCallback, useEffect, useState } from "react";
import type { ApiKey, WebhookDelivery, WebhookEndpoint } from "@/lib/types";
import { apiFetch } from "@/lib/api";

const input = "w-full rounded-md border border-zinc-300 px-2 py-1 text-sm";
const deliveryColor: Record<string, string> = {
  delivered: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

function errText(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/\{.*\}/);
  if (!m) return raw;
  try {
    const parsed = JSON.parse(m[0]);
    return parsed.message ?? parsed.error ?? raw;
  } catch { return raw; }
}

export function DeveloperPanel() {
  const [events, setEvents] = useState<string[]>([]);
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [form, setForm] = useState({ url: "", description: "", events: ["message.received"] as string[] });
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [ev, eps, dels, ks] = await Promise.all([
      apiFetch("/webhook-events"), apiFetch("/webhook-endpoints"),
      apiFetch("/webhook-deliveries"), apiFetch("/api-keys"),
    ]);
    setEvents(ev.events ?? []); setEndpoints(eps); setDeliveries(dels); setKeys(ks);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addEndpoint() {
    if (!form.url.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await apiFetch("/webhook-endpoints", { method: "POST", body: JSON.stringify(form) });
      setNewSecret(res.secret);
      setForm({ url: "", description: "", events: ["message.received"] });
      await load();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  async function toggle(ep: WebhookEndpoint) {
    await apiFetch(`/webhook-endpoints/${ep.id}`, { method: "PATCH", body: JSON.stringify({ active: !ep.active }) });
    await load();
  }

  async function test(ep: WebhookEndpoint) {
    setError(null);
    try {
      const res = await apiFetch(`/webhook-endpoints/${ep.id}/test`, { method: "POST" });
      setError(`Test POST to ${ep.url} returned HTTP ${res.status}.`);
    } catch (e) { setError(errText(e)); }
    await load();
  }

  async function removeEndpoint(ep: WebhookEndpoint) {
    if (!confirm(`Delete webhook endpoint ${ep.url}?`)) return;
    await apiFetch(`/webhook-endpoints/${ep.id}`, { method: "DELETE" });
    await load();
  }

  async function createKey() {
    const name = prompt("Name this key (e.g. 'Website integration')");
    if (!name?.trim()) return;
    setError(null);
    try {
      const res = await apiFetch("/api-keys", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setNewKey(res.key);
      await load();
    } catch (e) { setError(errText(e)); }
  }

  async function revokeKey(k: ApiKey) {
    if (!confirm(`Revoke key ${k.prefix}…? Integrations using it stop working immediately.`)) return;
    await apiFetch(`/api-keys/${k.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">{error}</p>}

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="text-sm font-medium">Outbound webhooks</div>
        <p className="mt-0.5 text-xs text-zinc-500">
          Every event is POSTed as JSON with an <code className="rounded bg-zinc-100 px-1">x-loqio-signature</code> header —
          <code className="rounded bg-zinc-100 px-1">sha256=HMAC_SHA256(secret, &quot;{"{timestamp}"}.{"{body}"}&quot;)</code> — plus
          <code className="rounded bg-zinc-100 px-1">x-loqio-timestamp</code> and <code className="rounded bg-zinc-100 px-1">x-loqio-event</code>.
          Failed deliveries retry 5 times with exponential backoff.
        </p>

        {newSecret && (
          <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs">
            <div className="font-medium text-amber-900">Signing secret — copy it now, it is never shown again:</div>
            <code className="mt-1 block break-all rounded bg-white px-2 py-1">{newSecret}</code>
            <button onClick={() => setNewSecret(null)} className="mt-1 text-amber-800 underline">Dismiss</button>
          </div>
        )}

        <div className="mt-3 space-y-2 rounded-md bg-zinc-50 p-3">
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className={input} placeholder="https://your-app.example.com/webhooks/loqio" />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} placeholder="Description (optional)" />
          <div className="flex flex-wrap gap-1">
            {events.map((ev) => (
              <label key={ev} className={`cursor-pointer rounded-full px-2 py-1 text-[11px] ${form.events.includes(ev) ? "bg-emerald-600 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>
                <input type="checkbox" className="hidden" checked={form.events.includes(ev)}
                  onChange={(e) => setForm({ ...form, events: e.target.checked ? [...form.events, ev] : form.events.filter((x) => x !== ev) })} />
                {ev}
              </label>
            ))}
          </div>
          <button onClick={addEndpoint} disabled={busy}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Add endpoint</button>
        </div>

        <div className="mt-3 space-y-2">
          {endpoints.map((ep) => (
            <div key={ep.id} className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 p-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${ep.active ? "bg-emerald-500" : "bg-zinc-300"}`} />
              <span className="flex-1 break-all font-mono text-xs">{ep.url}</span>
              <span className="text-[11px] text-zinc-400">{ep.events.join(", ")}</span>
              <button onClick={() => test(ep)} className="text-xs text-zinc-500 hover:text-emerald-700">Send test</button>
              <button onClick={() => toggle(ep)} className="text-xs text-zinc-500 hover:text-emerald-700">{ep.active ? "Disable" : "Enable"}</button>
              <button onClick={() => removeEndpoint(ep)} className="text-xs text-zinc-400 hover:text-red-600">Delete</button>
            </div>
          ))}
          {endpoints.length === 0 && <div className="text-xs text-zinc-400">No endpoints yet.</div>}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-2 text-sm font-medium">Recent deliveries</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="py-1">When</th><th>Event</th><th>Status</th><th>Attempts</th><th>Response</th></tr>
            </thead>
            <tbody>
              {deliveries.slice(0, 20).map((d) => (
                <tr key={d.id} className="border-t border-zinc-100">
                  <td className="py-1.5 text-xs text-zinc-500">{new Date(d.createdAt).toLocaleString()}</td>
                  <td className="text-xs font-mono">{d.event}</td>
                  <td><span className={`rounded px-1.5 py-0.5 text-[11px] ${deliveryColor[d.status] ?? "bg-zinc-100"}`}>{d.status}</span></td>
                  <td className="text-xs">{d.attempts}</td>
                  <td className="text-xs text-zinc-500">{d.responseCode ?? d.error ?? "—"}</td>
                </tr>
              ))}
              {deliveries.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-sm text-zinc-400">Nothing delivered yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">API keys</div>
            <div className="text-xs text-zinc-500">
              Base URL <code className="rounded bg-zinc-100 px-1">/api/v1</code> · send the key as the
              <code className="rounded bg-zinc-100 px-1">x-api-key</code> header.
            </div>
          </div>
          <button onClick={createKey} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">+ New key</button>
        </div>

        {newKey && (
          <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs">
            <div className="font-medium text-amber-900">Copy this key now — only its hash is stored:</div>
            <code className="mt-1 block break-all rounded bg-white px-2 py-1">{newKey}</code>
            <button onClick={() => setNewKey(null)} className="mt-1 text-amber-800 underline">Dismiss</button>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 p-2 text-sm">
              <span className="font-medium">{k.name}</span>
              <code className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{k.prefix}…</code>
              <span className="text-[11px] text-zinc-400">{k.scopes.join(", ")}</span>
              <span className="text-[11px] text-zinc-400">
                {k.revokedAt ? "revoked" : k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "never used"}
              </span>
              {!k.revokedAt && <button onClick={() => revokeKey(k)} className="ml-auto text-xs text-zinc-400 hover:text-red-600">Revoke</button>}
            </div>
          ))}
          {keys.length === 0 && <div className="text-xs text-zinc-400">No API keys yet.</div>}
        </div>

        <details className="mt-3 text-xs text-zinc-600">
          <summary className="cursor-pointer text-zinc-500">Template Send Message API example</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-900 p-3 text-[11px] text-zinc-100">{`curl -X POST $BASE/api/v1/messages/template \\
  -H "x-api-key: loq_live_..." \\
  -H "content-type: application/json" \\
  -d '{
    "to": "+919900112233",
    "templateName": "order_shipped",
    "variables": ["Ramsay"]
  }'`}</pre>
        </details>
      </div>
    </div>
  );
}
