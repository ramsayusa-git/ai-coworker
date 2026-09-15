"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, getCachedMe } from "@/lib/api";
import type { Team } from "@/lib/types";
import { FUNCTIONAL_ROLES, type FunctionalRole } from "@/lib/types";
import { HelpLink } from "@/components/help-link";
import { BillingPanel } from "./billing-panel";
import { DeveloperPanel } from "./developer-panel";

const FUNCTIONAL_ROLE_LABELS: Record<FunctionalRole, string> = {
  administrator: "Administrator", broadcast_manager: "Broadcast Manager", template_manager: "Template Manager",
  contact_manager: "Contact Manager", operator: "Operator", developer: "Developer",
  billing_manager: "Billing Manager", dashboard_viewer: "Dashboard Viewer",
};

const tabs = ["Organization", "Branding", "Team & Roles", "Roles & Permissions", "Billing", "API & Webhooks"] as const;

const RBAC_MATRIX: Array<{ role: string; scope: string; can: string }> = [
  { role: "platform_admin", scope: "Platform", can: "Full access across every partner and org (Loqio ops team only)." },
  { role: "partner_owner", scope: "Partner", can: "Full control of the partner account: branding, billing, client orgs, other partner members." },
  { role: "partner_admin", scope: "Partner", can: "Same as partner_owner except cannot remove the owner or change billing mode." },
  { role: "partner_support", scope: "Partner", can: "Read-only: view client orgs and health, no branding/billing edits, no client data unless the org grants access." },
  { role: "org_owner", scope: "Org", can: "Full control of one org: billing, channels, team, settings, all data." },
  { role: "org_admin", scope: "Org", can: "Manage channels, team, templates, campaigns. Cannot change billing or delete the org." },
  { role: "supervisor", scope: "Org", can: "Manage inbox assignment, view all conversations/analytics, cannot manage billing or channels." },
  { role: "agent", scope: "Org", can: "Handle assigned/open conversations, use templates, cannot manage settings or see billing." },
  { role: "viewer", scope: "Org", can: "Read-only across inbox and analytics — for auditors or stakeholders." },
];
type Tab = (typeof tabs)[number];

type Member = { userId: string; name: string | null; email: string; role: string; status: string; functionalRoles?: string[] };
type Invite = { id: string; email: string; role: string; acceptUrl?: string; token: string; expiresAt: string };

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <label className="block text-xs text-zinc-500">{label}</label>
      <input defaultValue={value} className="mt-1 w-full max-w-md rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function submit() {
    if (!email.trim()) { setError("Email is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const invite: Invite = await apiFetch("/invites", { method: "POST", body: JSON.stringify({ email: email.trim(), role }) });
      const base = typeof window !== "undefined" ? window.location.origin : "";
      setLink(`${base}${invite.acceptUrl}`);
      onInvited();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30">
      <div className="w-[380px] rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Invite a team member</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>

        {!link ? (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-zinc-600">
              Email
              <input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
            </label>
            <label className="block text-xs font-medium text-zinc-600">
              Role
              <select className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" value={role}
                onChange={(e) => setRole(e.target.value)}>
                <option value="viewer">Viewer</option>
                <option value="agent">Agent</option>
                <option value="supervisor">Supervisor</option>
                <option value="org_admin">Org Admin</option>
                <option value="org_owner">Org Owner</option>
              </select>
            </label>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex items-center justify-between pt-1">
              <button onClick={onClose} className="text-xs text-zinc-400 hover:underline">Cancel</button>
              <button onClick={submit} disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {saving ? "Sending…" : "Send invite"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">No email service is wired up yet — share this link with them directly:</p>
            <code className="block break-all rounded-md bg-zinc-50 p-2 text-xs">{link}</code>
            <button onClick={onClose} className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamsPanel({ members }: { members: Member[] }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => { setTeams(await apiFetch("/teams")); }, []);
  useEffect(() => { load(); }, [load]);

  async function createTeam() {
    if (!newTeamName.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/teams", { method: "POST", body: JSON.stringify({ name: newTeamName.trim() }) });
      setNewTeamName("");
      await load();
    } finally { setSaving(false); }
  }

  async function deleteTeam(id: string) {
    await apiFetch(`/teams/${id}`, { method: "DELETE" });
    await load();
  }

  async function addMember(teamId: string) {
    if (!selectedUser) return;
    await apiFetch(`/teams/${teamId}/members`, { method: "POST", body: JSON.stringify({ userId: selectedUser }) });
    setAddingTo(null);
    setSelectedUser("");
    await load();
  }

  async function removeMember(teamId: string, userId: string) {
    await apiFetch(`/teams/${teamId}/members/${userId}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-700">Teams</h2>
        <p className="text-xs text-zinc-400">Named groups for routing conversations — separate from individual roles.</p>
      </div>
      <div className="space-y-3">
        {teams.map((t) => {
          const memberIds = new Set(t.members.map((m) => m.userId));
          const eligible = members.filter((m) => !memberIds.has(m.userId));
          return (
            <div key={t.id} className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{t.name}</div>
                <button onClick={() => deleteTeam(t.id)} className="text-xs text-red-500 hover:underline">Delete team</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.members.map((m) => (
                  <span key={m.userId} className="flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {m.name || m.email}
                    <button onClick={() => removeMember(t.id, m.userId)} className="text-zinc-400 hover:text-red-500">✕</button>
                  </span>
                ))}
                {t.members.length === 0 && <span className="text-xs text-zinc-400">No members yet.</span>}
              </div>
              {addingTo === t.id ? (
                <div className="mt-2 flex items-center gap-2">
                  <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                    <option value="">Select member…</option>
                    {eligible.map((m) => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
                  </select>
                  <button onClick={() => addMember(t.id)} className="text-xs text-emerald-600 hover:underline">Add</button>
                  <button onClick={() => { setAddingTo(null); setSelectedUser(""); }} className="text-xs text-zinc-400 hover:underline">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddingTo(t.id)} className="mt-2 text-xs text-emerald-600 hover:underline">+ Add member</button>
              )}
            </div>
          );
        })}
        {teams.length === 0 && <p className="text-xs text-zinc-400">No teams yet.</p>}
      </div>
      <div className="flex items-center gap-2">
        <input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="e.g. Support Tier 1"
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        <button onClick={createTeam} disabled={saving || !newTeamName.trim()}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
          + New team
        </button>
      </div>
    </div>
  );
}

function FunctionalRolesCell({ member, onSaved }: { member: Member; onSaved: () => void }) {
  const me = getCachedMe();
  const canEdit = me?.role === "org_owner" || me?.role === "org_admin";
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(member.functionalRoles ?? []);
  const [saving, setSaving] = useState(false);

  function toggle(role: FunctionalRole) {
    setSelected((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/members/${member.userId}`, { method: "PATCH", body: JSON.stringify({ functionalRoles: selected }) });
      setOpen(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <span className="text-xs text-zinc-500">
        {member.functionalRoles && member.functionalRoles.length > 0
          ? member.functionalRoles.map((r) => FUNCTIONAL_ROLE_LABELS[r as FunctionalRole] ?? r).join(", ")
          : "None"}
      </span>
    );
  }

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="relative">
      <summary className="cursor-pointer list-none text-xs text-zinc-600 hover:underline">
        {member.functionalRoles && member.functionalRoles.length > 0
          ? member.functionalRoles.map((r) => FUNCTIONAL_ROLE_LABELS[r as FunctionalRole] ?? r).join(", ")
          : <span className="text-zinc-400">None — click to set</span>}
      </summary>
      <div className="absolute z-10 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-2 shadow-lg">
        <div className="space-y-1">
          {FUNCTIONAL_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-xs text-zinc-700">
              <input type="checkbox" checked={selected.includes(role)} onChange={() => toggle(role)} />
              {FUNCTIONAL_ROLE_LABELS[role]}
            </label>
          ))}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={() => { setSelected(member.functionalRoles ?? []); setOpen(false); }} className="text-xs text-zinc-400 hover:underline">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40">Save</button>
        </div>
      </div>
    </details>
  );
}

export function SettingsView() {
  const [tab, setTab] = useState<Tab>("Organization");
  // Real plan name for the Organization tab badge (the full picker lives in Billing).
  const [planName, setPlanName] = useState<string | null>(null);
  useEffect(() => {
    apiFetch("/billing").then((b) => setPlanName(b?.plan?.name ?? "—")).catch(() => setPlanName("—"));
  }, []);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const me = getCachedMe();

  const loadTeam = useCallback(async () => {
    const [m, i] = await Promise.all([apiFetch("/members"), apiFetch("/invites")]);
    setMembers(m);
    setInvites(i);
  }, []);

  useEffect(() => { if (tab === "Team & Roles") loadTeam(); }, [tab, loadTeam]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <HelpLink anchor="settings" />
      </div>
      <div className="mb-4 flex gap-1 border-b border-zinc-200">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-emerald-600 font-medium text-emerald-700" : "border-transparent text-zinc-500 hover:text-zinc-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Organization" && (
        <div className="max-w-md space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <Field label="Organization name" value={me?.orgName ?? ""} />
          <Field label="Timezone" value="Asia/Kolkata" />
          <Field label="Default language" value="en" />
          <div>
            <label className="block text-xs text-zinc-500">Plan</label>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-700">
                {planName ?? "…"}
              </span>
              <button onClick={() => setTab("Billing")} className="text-xs text-emerald-600 hover:underline">
                Change plan
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "Branding" && (
        <div className="max-w-md space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-400">White-label settings apply when this org is under a partner/reseller brand.</p>
          <Field label="Brand name" value={me?.orgName ?? ""} />
          <Field label="Custom domain" value="" hint="CNAME → Cloudflare for SaaS. Not yet verified." />
          <Field label="Support email" value="" />
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-400">Logo</div>
            <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">Upload</button>
          </div>
        </div>
      )}

      {tab === "Team & Roles" && (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Functional roles</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((r) => (
                <tr key={r.userId} className="border-t border-zinc-100">
                  <td className="px-4 py-2 font-medium">{r.name || r.email}{r.userId === me?.userId ? " (you)" : ""}</td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-600">{r.role}</td>
                  <td className="px-4 py-2"><FunctionalRolesCell member={r} onSaved={loadTeam} /></td>
                  <td className="px-4 py-2"><span className="text-xs text-emerald-600">{r.status}</span></td>
                </tr>
              ))}
              {invites.map((inv) => (
                <tr key={inv.id} className="border-t border-zinc-100">
                  <td className="px-4 py-2 font-medium text-zinc-500">{inv.email}</td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-600">{inv.role}</td>
                  <td className="px-4 py-2 text-xs text-zinc-300">—</td>
                  <td className="px-4 py-2"><span className="text-xs text-amber-600">invited</span></td>
                </tr>
              ))}
              {members.length === 0 && invites.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-zinc-400">Loading…</td></tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-zinc-200 p-3">
            <button onClick={() => setShowInvite(true)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              + Invite member
            </button>
          </div>
        </div>
      )}

      {tab === "Team & Roles" && <TeamsPanel members={members} />}

      {tab === "Roles & Permissions" && (
        <div className="max-w-2xl">
          <p className="mb-3 text-xs text-zinc-500">
            Full role set across the platform. Invites here only offer org-scoped roles (viewer through org_owner) —
            partner_owner/admin/support are granted from the Partner Console, platform_admin is Loqio-internal.
            Enforcement is live route-by-route: viewer is read-only everywhere; agent can send messages, change a
            conversation&apos;s own status, and manage contacts, but can&apos;t reassign conversations, manage
            channels/templates/campaigns/bots, or touch billing; supervisor adds reassignment plus
            templates/campaigns/bots management; org_admin adds channels/team/settings; billing stays org_owner-only.
          </p>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr><th className="px-4 py-2 font-medium">Role</th><th className="px-4 py-2 font-medium">Scope</th><th className="px-4 py-2 font-medium">Can</th></tr>
              </thead>
              <tbody>
                {RBAC_MATRIX.map((r) => (
                  <tr key={r.role} className="border-t border-zinc-100 align-top">
                    <td className="px-4 py-2 font-mono text-xs text-zinc-700">{r.role}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{r.scope}</td>
                    <td className="px-4 py-2 text-zinc-600">{r.can}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "Billing" && <BillingPanel />}

      {tab === "API & Webhooks" && <DeveloperPanel />}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvited={loadTeam} />}
    </div>
  );
}
