"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import type { License, LicenseActivation, Plan } from "@/lib/types";
import { partnerFetch, platformFetch } from "@/lib/api";
import { Icon } from "@/components/nav-icons";

const input = "w-full rounded-md border border-zinc-300 px-2 py-1 text-sm";
const statusColor: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-amber-100 text-amber-700",
  revoked: "bg-red-100 text-red-700",
  expired: "bg-zinc-100 text-zinc-600",
};

function errText(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/\{.*\}/);
  if (!m) return raw;
  try { const p = JSON.parse(m[0]); return p.error ?? p.message ?? raw; } catch { return raw; }
}

// Licences exist only for the deployments we do not host: the customer runs the
// software, so entitlements travel with a signed key instead of with their session.
export function LicensesPanel({ partnerId }: { partnerId: string }) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activations, setActivations] = useState<Record<string, LicenseActivation[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    planId: "", issuedToName: "", issuedToEmail: "",
    seats: -1, channels: -1, maxInstances: 1, months: 12, notes: "",
  });

  const load = useCallback(async () => {
    const [rows, allPlans] = await Promise.all([
      partnerFetch(`/partners/${partnerId}/licenses`),
      platformFetch("/plans"),
    ]);
    setLicenses(rows);
    // Only self-hosted and dedicated editions are licensable — a hosted plan runs on
    // our servers and needs no key.
    const licensable = (allPlans as Plan[]).filter(
      (p) => p.deployment !== "hosted" && p.audience !== "direct"
    );
    setPlans(licensable);
    setForm((f) => ({ ...f, planId: f.planId || licensable[0]?.id || "" }));
  }, [partnerId]);
  useEffect(() => { load(); }, [load]);

  async function issue() {
    if (!form.planId || !form.issuedToName.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await partnerFetch(`/partners/${partnerId}/licenses`, { method: "POST", body: JSON.stringify(form) });
      setIssuedKey(res.key);
      setShowNew(false);
      setForm((f) => ({ ...f, issuedToName: "", issuedToEmail: "", notes: "" }));
      await load();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  async function setStatus(l: License, status: string) {
    setError(null);
    try {
      await partnerFetch(`/partners/${partnerId}/licenses/${l.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (e) { setError(errText(e)); }
  }

  async function toggleActivations(l: License) {
    if (open === l.id) { setOpen(null); return; }
    setOpen(l.id);
    if (!activations[l.id]) {
      const rows = await partnerFetch(`/partners/${partnerId}/licenses/${l.id}/activations`).catch(() => []);
      setActivations((a) => ({ ...a, [l.id]: rows }));
    }
  }

  async function deactivate(l: License, a: LicenseActivation) {
    if (!confirm(`Free the instance slot used by ${a.hostname || a.instanceId}?`)) return;
    await partnerFetch(`/partners/${partnerId}/licenses/${l.id}/activations/${a.id}`, { method: "DELETE" });
    const rows = await partnerFetch(`/partners/${partnerId}/licenses/${l.id}/activations`).catch(() => []);
    setActivations((s) => ({ ...s, [l.id]: rows }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Client licences</div>
          <div className="text-xs text-zinc-500">
            For self-hosted and private-cloud clients. Each key is signed and carries its own
            entitlements, so an instance can verify it offline; suspending a licence here stops
            its next activation check.
          </div>
        </div>
        <button onClick={() => { setShowNew((s) => !s); setError(null); }}
          className="lq-ring-focus flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">
          <Icon name="plus" className="h-3.5 w-3.5" /> Issue licence
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {issuedKey && (
        <div className="rounded-lg bg-amber-50 p-3 text-xs">
          <div className="font-medium text-amber-900">Licence key — copy it now, it is never shown in full again:</div>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 font-mono">{issuedKey}</code>
          <div className="mt-1 flex gap-3">
            <button onClick={() => navigator.clipboard?.writeText(issuedKey)} className="text-amber-800 underline">Copy</button>
            <button onClick={() => setIssuedKey(null)} className="text-amber-800 underline">Dismiss</button>
          </div>
        </div>
      )}

      {showNew && (
        <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-500">Edition</label>
            <select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} className={input}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {plans.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">No licensable editions found — seed the deployment editions first.</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Issued to</label>
            <input value={form.issuedToName} onChange={(e) => setForm({ ...form, issuedToName: e.target.value })}
              className={input} placeholder="Client company name" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Contact email</label>
            <input value={form.issuedToEmail} onChange={(e) => setForm({ ...form, issuedToEmail: e.target.value })}
              className={input} placeholder="ops@client.com" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Agent seats (-1 = unlimited)</label>
            <input type="number" value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })} className={input} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Channels (-1 = unlimited)</label>
            <input type="number" value={form.channels} onChange={(e) => setForm({ ...form, channels: Number(e.target.value) })} className={input} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Instances allowed</label>
            <input type="number" min={1} value={form.maxInstances}
              onChange={(e) => setForm({ ...form, maxInstances: Number(e.target.value) })} className={input} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Term (months, 0 = perpetual)</label>
            <input type="number" min={0} value={form.months}
              onChange={(e) => setForm({ ...form, months: Number(e.target.value) })} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-500">Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input}
              placeholder="PO number, contract reference…" />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button onClick={issue} disabled={busy}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {busy ? "Issuing…" : "Issue licence"}
            </button>
            <button onClick={() => setShowNew(false)} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Client</th><th>Edition</th><th>Limits</th>
              <th>Valid until</th><th>Status</th><th>Key</th><th />
            </tr>
          </thead>
          <tbody>
            {licenses.map((l) => (
              <Fragment key={l.id}>
                <tr className="border-t border-zinc-100">
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.issuedToName}</div>
                    <div className="text-[11px] text-zinc-400">{l.issuedToEmail}</div>
                  </td>
                  <td className="text-xs">
                    {l.planId}
                    <div className="text-[11px] text-zinc-400">{l.deployment.replace("_", "-")}</div>
                  </td>
                  <td className="text-xs text-zinc-500">
                    {l.seats < 0 ? "∞" : l.seats} seats · {l.channels < 0 ? "∞" : l.channels} channels · {l.maxInstances} inst.
                  </td>
                  <td className="text-xs">{l.validUntil ? new Date(l.validUntil).toLocaleDateString() : "perpetual"}</td>
                  <td><span className={`rounded px-1.5 py-0.5 text-[11px] ${statusColor[l.status]}`}>{l.status}</span></td>
                  <td className="font-mono text-[11px] text-zinc-400">…{l.keyTail}</td>
                  <td className="whitespace-nowrap px-2 text-xs">
                    <button onClick={() => toggleActivations(l)} className="text-zinc-500 hover:text-emerald-700">
                      {open === l.id ? "Hide" : "Instances"}
                    </button>
                    {l.status === "active" ? (
                      <button onClick={() => setStatus(l, "suspended")} className="ml-2 text-zinc-500 hover:text-amber-700">Suspend</button>
                    ) : l.status === "suspended" ? (
                      <button onClick={() => setStatus(l, "active")} className="ml-2 text-zinc-500 hover:text-emerald-700">Resume</button>
                    ) : null}
                    {l.status !== "revoked" && (
                      <button onClick={() => { if (confirm("Revoke this licence permanently?")) setStatus(l, "revoked"); }}
                        className="ml-2 text-zinc-400 hover:text-red-600">Revoke</button>
                    )}
                  </td>
                </tr>
                {open === l.id && (
                  <tr className="border-t border-zinc-100 bg-zinc-50/60">
                    <td colSpan={7} className="px-3 py-2">
                      <div className="text-xs font-medium text-zinc-600">Activated instances</div>
                      {(activations[l.id] ?? []).length === 0 ? (
                        <div className="py-2 text-xs text-zinc-400">Never activated — the client has not started an instance with this key yet.</div>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {(activations[l.id] ?? []).map((a) => (
                            <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className={`h-1.5 w-1.5 rounded-full ${a.revokedAt ? "bg-zinc-300" : "bg-emerald-500"}`} />
                              <span className="font-medium">{a.hostname || a.instanceId}</span>
                              <span className="text-zinc-400">{a.version ? `v${a.version}` : ""} {a.ipAddress ?? ""}</span>
                              <span className="text-zinc-400">last seen {new Date(a.lastSeenAt).toLocaleString()}</span>
                              {!a.revokedAt && (
                                <button onClick={() => deactivate(l, a)} className="ml-auto text-zinc-400 hover:text-red-600">
                                  Free slot
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {licenses.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-400">No licences issued yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
