"use client";
import { useCallback, useEffect, useState } from "react";
import { partnerFetch } from "@/lib/api";
import { LicensesPanel } from "./licenses-panel";

type PartnerRef = { id: string; name: string; slug: string; role: string };
type Partner = {
  id: string; name: string; slug: string; brand: Record<string, any>;
  customDomain: string | null; customDomainStatus: "unset" | "pending" | "verified" | "failed";
  customDomainActive: boolean;
};
type DomainRecord = { type: string; host: string; value: string | null };
type VerifyResult = { status: string; ownershipOk: boolean; cnameOk: boolean; expectedCname: string; error?: string };
type ClientOrg = { id: string; name: string; planId: string; walletPaise: number; partnerAccess: string; createdAt: string };
type PartnerMember = { userId: string; name: string | null; email: string; role: string; status: string };
type PartnerInvite = { id: string; email: string; role: string; acceptUrl?: string };
type ClientConversation = { id: string; status: string; unread: number; lastMessageAt: string; lastMessage?: string; contactName: string; contactPhone: string };

const inputCls = "mt-1 w-full max-w-md rounded-md border border-zinc-300 px-2 py-1.5 text-sm";

function BecomePartner({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setError("Reseller/agency name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      await partnerFetch("/partners", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create partner account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Become a reseller / agency partner</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Manage multiple client orgs under one white-labeled brand — custom domain, branding, and wholesale billing.
      </p>
      <label className="mt-4 block text-xs font-medium text-zinc-600">
        Agency / reseller name
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Aetos Tech Labs" />
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button onClick={submit} disabled={saving}
        className="mt-4 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {saving ? "Creating…" : "Create partner account"}
      </button>
    </div>
  );
}

function NewOrgModal({ partnerId, onClose, onCreated }: { partnerId: string; onClose: () => void; onCreated: () => void }) {
  const [orgName, setOrgName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [partnerAccess, setPartnerAccess] = useState("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!orgName.trim() || !ownerEmail.trim() || ownerPassword.length < 8) {
      setError("Org name, owner email, and a password (min 8 chars) are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await partnerFetch(`/partners/${partnerId}/orgs`, {
        method: "POST",
        body: JSON.stringify({ orgName: orgName.trim(), ownerName: ownerName.trim(), ownerEmail: ownerEmail.trim(), ownerPassword, partnerAccess }),
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create client org");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30">
      <div className="w-[420px] rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Onboard a new client</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-zinc-600">
            Client org name
            <input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" value={orgName}
              onChange={(e) => setOrgName(e.target.value)} placeholder="Client Store" />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            Owner's name
            <input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)} placeholder="Jane Doe" />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            Owner's email
            <input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@client.com" />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            Temporary password
            <input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" type="password" value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)} placeholder="At least 8 characters" />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            Your data access to this client
            <select className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" value={partnerAccess}
              onChange={(e) => setPartnerAccess(e.target.value)}>
              <option value="none">None — you manage billing/branding only</option>
              <option value="metadata">Metadata — conversation counts, not message content</option>
              <option value="full">Full — you can see message content (e.g. managed support)</option>
            </select>
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-between pt-1">
            <button onClick={onClose} className="text-xs text-zinc-400 hover:underline">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? "Creating…" : "Create client"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InviteTeammateModal({ partnerId, onClose, onInvited }: { partnerId: string; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("partner_support");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function submit() {
    if (!email.trim()) { setError("Email is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const invite: PartnerInvite = await partnerFetch(`/partners/${partnerId}/invites`, {
        method: "POST", body: JSON.stringify({ email: email.trim(), role }),
      });
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
          <h2 className="text-lg font-semibold">Invite a partner teammate</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>
        {!link ? (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-zinc-600">
              Email
              <input className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="teammate@aetostechlabs.com" />
            </label>
            <label className="block text-xs font-medium text-zinc-600">
              Role
              <select className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" value={role}
                onChange={(e) => setRole(e.target.value)}>
                <option value="partner_support">Partner Support (read-only)</option>
                <option value="partner_admin">Partner Admin (full control)</option>
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

function ClientConversationsModal({ partnerId, org, onClose }: { partnerId: string; org: ClientOrg; onClose: () => void }) {
  const [rows, setRows] = useState<ClientConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    partnerFetch(`/partners/${partnerId}/orgs/${org.id}/conversations`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [partnerId, org.id]);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30">
      <div className="max-h-[80vh] w-[560px] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{org.name} — conversations</h2>
            <p className="text-xs text-zinc-500">Your access: {org.partnerAccess}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>
        {error && <p className="text-sm text-amber-600">{error}</p>}
        {!error && rows === null && <p className="text-sm text-zinc-400">Loading…</p>}
        {!error && rows && rows.length === 0 && <p className="text-sm text-zinc-400">No conversations yet.</p>}
        {!error && rows && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((c) => (
              <div key={c.id} className="rounded-md border border-zinc-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.contactName}</span>
                  <span className="text-xs text-zinc-400">{c.status}</span>
                </div>
                <div className="text-xs text-zinc-500">{c.contactPhone}</div>
                {c.lastMessage !== undefined ? (
                  <p className="mt-1 text-zinc-600">{c.lastMessage}</p>
                ) : (
                  <p className="mt-1 text-xs italic text-zinc-400">Message content hidden (metadata-only access)</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Console({ partnerRef }: { partnerRef: PartnerRef }) {
  const [tab, setTab] = useState<"Clients" | "Licences" | "Branding" | "Team">("Clients");
  const [partner, setPartner] = useState<Partner | null>(null);
  const [clientOrgs, setClientOrgs] = useState<ClientOrg[]>([]);
  const [members, setMembers] = useState<PartnerMember[]>([]);
  const [invites, setInvites] = useState<PartnerInvite[]>([]);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [viewingOrg, setViewingOrg] = useState<ClientOrg | null>(null);
  const isAdmin = partnerRef.role === "partner_owner" || partnerRef.role === "partner_admin";

  const [brandName, setBrandName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#059669");
  const [supportEmail, setSupportEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [footerText, setFooterText] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);
  const [domainRecords, setDomainRecords] = useState<DomainRecord[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    const [p, orgsRows, mems, invs] = await Promise.all([
      partnerFetch(`/partners/${partnerRef.id}`),
      partnerFetch(`/partners/${partnerRef.id}/orgs`),
      partnerFetch(`/partners/${partnerRef.id}/members`),
      partnerFetch(`/partners/${partnerRef.id}/invites`),
    ]);
    setPartner(p);
    setClientOrgs(orgsRows);
    setMembers(mems);
    setInvites(invs);
    setBrandName(p.brand?.brandName ?? "");
    setPrimaryColor(p.brand?.primaryColor ?? "#059669");
    setSupportEmail(p.brand?.supportEmail ?? "");
    setLogoUrl(p.brand?.logoUrl ?? "");
    setFaviconUrl(p.brand?.faviconUrl ?? "");
    setFooterText(p.brand?.footerText ?? "");
    setCustomDomain(p.customDomain ?? "");
    if (p.customDomain && p.customDomainStatus !== "unset") {
      partnerFetch(`/partners/${partnerRef.id}/domain-instructions`).then((d) => setDomainRecords(d.records)).catch(() => setDomainRecords([]));
    } else {
      setDomainRecords([]);
    }
    setVerifyResult(null);
  }, [partnerRef.id]);

  useEffect(() => { load(); }, [load]);

  async function saveBranding() {
    setSavingBrand(true);
    try {
      await partnerFetch(`/partners/${partnerRef.id}/branding`, {
        method: "PATCH",
        body: JSON.stringify({ brand: { brandName, primaryColor, supportEmail, logoUrl, faviconUrl, footerText }, customDomain }),
      });
      await load();
    } finally {
      setSavingBrand(false);
    }
  }

  async function verifyDomain() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result: VerifyResult = await partnerFetch(`/partners/${partnerRef.id}/domain-verify`, { method: "POST" });
      setVerifyResult(result);
      await load();
    } finally {
      setVerifying(false);
    }
  }

  async function toggleActive(next: boolean) {
    setActivating(true);
    try {
      await partnerFetch(`/partners/${partnerRef.id}/domain-activate`, {
        method: "POST", body: JSON.stringify({ active: next }),
      });
      await load();
    } finally {
      setActivating(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{partner?.name ?? partnerRef.name}</h1>
          <p className="text-xs text-zinc-500">Reseller/agency console · your role: <span className="font-mono">{partnerRef.role}</span></p>
        </div>
      </div>
      <div className="mb-4 flex gap-1 border-b border-zinc-200">
        {(["Clients", "Licences", "Branding", "Team"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-emerald-600 font-medium text-emerald-700" : "border-transparent text-zinc-500 hover:text-zinc-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Clients" && (
        <div>
          {isAdmin && (
            <div className="mb-3">
              <button onClick={() => setShowNewOrg(true)}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                + Onboard client
              </button>
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Client org</th>
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 font-medium">Wallet</th>
                  <th className="px-4 py-2 font-medium">Your access</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {clientOrgs.map((o) => (
                  <tr key={o.id} className="border-t border-zinc-100">
                    <td className="px-4 py-2 font-medium">{o.name}</td>
                    <td className="px-4 py-2 text-zinc-600">{o.planId}</td>
                    <td className="px-4 py-2 text-zinc-600">₹{(o.walletPaise / 100).toFixed(2)}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{o.partnerAccess}</td>
                    <td className="px-4 py-2 text-right">
                      {o.partnerAccess !== "none" ? (
                        <button onClick={() => setViewingOrg(o)} className="text-xs text-emerald-600 hover:underline">View</button>
                      ) : (
                        <span className="text-xs text-zinc-300">no access granted</span>
                      )}
                    </td>
                  </tr>
                ))}
                {clientOrgs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-zinc-400">No client orgs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "Licences" && partner && <LicensesPanel partnerId={partner.id} />}

      {tab === "Branding" && (
        <div className="max-w-md space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          {!isAdmin && <p className="text-xs text-amber-600">Only partner owners/admins can edit branding.</p>}
          <label className="block text-xs text-zinc-500">
            Brand name
            <input className={inputCls} value={brandName} onChange={(e) => setBrandName(e.target.value)} disabled={!isAdmin} />
          </label>
          <label className="block text-xs text-zinc-500">
            Primary color
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} disabled={!isAdmin} />
              <input className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm" value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)} disabled={!isAdmin} />
            </div>
          </label>
          <label className="block text-xs text-zinc-500">
            Support email
            <input className={inputCls} value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} disabled={!isAdmin} />
          </label>
          <label className="block text-xs text-zinc-500">
            Logo URL
            <div className="mt-1 flex items-center gap-2">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo preview" className="h-8 max-w-[6rem] rounded border border-zinc-200 object-contain p-1" />
              )}
              <input className={inputCls + " flex-1"} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                disabled={!isAdmin} placeholder="https://yourbrand.com/logo.png" />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">Shown in the sidebar and on login/register screens. Transparent PNG or SVG, ~200×40px works best.</p>
          </label>
          <label className="block text-xs text-zinc-500">
            Favicon URL
            <div className="mt-1 flex items-center gap-2">
              {faviconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={faviconUrl} alt="Favicon preview" className="h-6 w-6 rounded border border-zinc-200 object-contain" />
              )}
              <input className={inputCls + " flex-1"} value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)}
                disabled={!isAdmin} placeholder="https://yourbrand.com/favicon.ico" />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">Sets the browser tab icon for client orgs under this brand.</p>
          </label>
          <label className="block text-xs text-zinc-500">
            Footer text
            <input className={inputCls} value={footerText} onChange={(e) => setFooterText(e.target.value)}
              disabled={!isAdmin} placeholder={`© ${new Date().getFullYear()} ${brandName || "Your Brand"}`} />
            <p className="mt-1 text-[11px] text-zinc-400">Shown at the bottom of the sidebar and on login/invite screens. Leave blank to use the default.</p>
          </label>
          <label className="block text-xs text-zinc-500">
            Custom domain
            <div className="mt-1 flex items-center gap-2">
              <input className="w-full max-w-md rounded-md border border-zinc-300 px-2 py-1.5 text-sm" value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)} disabled={!isAdmin} placeholder="app.yourbrand.com" />
              {partner?.customDomain && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  partner.customDomainStatus === "verified" ? "bg-emerald-100 text-emerald-700"
                  : partner.customDomainStatus === "failed" ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"}`}>
                  {partner.customDomainStatus}
                </span>
              )}
              {partner?.customDomain && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  partner.customDomainActive ? "bg-sky-100 text-sky-700" : "bg-zinc-100 text-zinc-500"}`}>
                  {partner.customDomainActive ? "active" : "inactive"}
                </span>
              )}
            </div>
            {!partner?.customDomain && isAdmin && (
              <p className="mt-1 text-[11px] text-amber-600">
                Type a domain above, then click <span className="font-mono">Save branding</span> at the bottom of this tab — that generates your DNS records and unlocks the Verify/Activate buttons below.
              </p>
            )}
          </label>

          {/* Always visible once a domain exists in the field (typed or saved), so the
              walkthrough and the fact that Verify/Activate are one Save away isn't a mystery. */}
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <p className="mb-2 text-zinc-500">
              {domainRecords.length > 0
                ? "Add these DNS records at your domain registrar, then verify — this does a real live DNS lookup, no manual approval needed:"
                : "How connecting a subdomain works — save a domain above to generate your real records:"}
            </p>
            <div className="mb-3 rounded border border-dashed border-zinc-300 bg-white p-2 text-[11px] text-zinc-500">
              <p className="mb-1 font-medium text-zinc-600">Example — connecting a subdomain like <span className="font-mono">app.{partner?.slug ?? "yourbrand"}.com</span>:</p>
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>Log into wherever <span className="font-mono">{(customDomain || partner?.customDomain || "yourbrand.com").split(".").slice(-2).join(".")}</span> is registered (GoDaddy, Namecheap, Cloudflare, etc.) and open its DNS settings.</li>
                <li>Add a <span className="font-mono">TXT</span> record — Host: <span className="font-mono">_whatsup-verify.{customDomain || partner?.customDomain || "app.yourbrand.com"}</span>, Value: {domainRecords.find((r) => r.type === "TXT")?.value ?? "(shown here once you Save branding)"}.</li>
                <li>Add a <span className="font-mono">CNAME</span> record — Host: <span className="font-mono">{(customDomain || partner?.customDomain || "app.yourbrand.com").split(".")[0]}</span> (just the subdomain part, e.g. &quot;app&quot;), Value: <span className="font-mono">{partner?.slug ?? "yourbrand"}.edge.whatsup.app</span>.</li>
                <li>DNS changes can take a few minutes up to ~24h to propagate. Click <span className="font-mono">Verify domain</span> below once you&apos;ve added both — it does a live lookup, so it&apos;ll fail cleanly if not ready yet, just try again.</li>
                <li>Once verified, click <span className="font-mono">Activate domain</span> to actually start serving your branding on it — verifying alone doesn&apos;t make it live.</li>
              </ol>
            </div>
            {domainRecords.length > 0 && (
              <table className="w-full font-mono text-[11px]">
                <tbody>
                  {domainRecords.map((r) => (
                    <tr key={r.type} className="border-t border-zinc-200 first:border-0">
                      <td className="py-1 pr-2 text-zinc-500">{r.type}</td>
                      <td className="py-1 pr-2">{r.host}</td>
                      <td className="py-1">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {domainRecords.length === 0 && (
              <p className="text-[11px] text-zinc-400">No domain saved yet — the Verify and Activate buttons appear here once you save one above.</p>
            )}
            {domainRecords.length > 0 && isAdmin && (
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={verifyDomain} disabled={verifying}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50">
                    {verifying ? "Checking DNS…" : "Verify domain"}
                  </button>
                  <button
                    onClick={() => toggleActive(!partner?.customDomainActive)}
                    disabled={activating || (!partner?.customDomainActive && partner?.customDomainStatus !== "verified")}
                    title={!partner?.customDomainActive && partner?.customDomainStatus !== "verified" ? "Verify the domain first" : undefined}
                    className={`rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                      partner?.customDomainActive
                        ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                    }`}>
                    {activating ? "Working…" : partner?.customDomainActive ? "Deactivate domain" : "Activate domain"}
                  </button>
                </div>
              )}
            {verifyResult && (
              <p className={`mt-2 ${verifyResult.status === "verified" ? "text-emerald-700" : "text-red-700"}`}>
                {verifyResult.status === "verified"
                  ? "Verified — both records resolved correctly."
                  : `Not verified yet — TXT ${verifyResult.ownershipOk ? "ok" : "missing"}, CNAME ${verifyResult.cnameOk ? "ok" : "missing"}.${verifyResult.error ? ` (${verifyResult.error})` : ""}`}
              </p>
            )}
          </div>
          {isAdmin && (
            <button onClick={saveBranding} disabled={savingBrand}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {savingBrand ? "Saving…" : "Save branding"}
            </button>
          )}
        </div>
      )}

      {tab === "Team" && (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr><th className="px-4 py-2 font-medium">User</th><th className="px-4 py-2 font-medium">Role</th><th className="px-4 py-2 font-medium">Status</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-t border-zinc-100">
                  <td className="px-4 py-2 font-medium">{m.name || m.email}</td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-600">{m.role}</td>
                  <td className="px-4 py-2 text-xs text-emerald-600">{m.status}</td>
                </tr>
              ))}
              {invites.map((inv) => (
                <tr key={inv.id} className="border-t border-zinc-100">
                  <td className="px-4 py-2 font-medium text-zinc-500">{inv.email}</td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-600">{inv.role}</td>
                  <td className="px-4 py-2 text-xs text-amber-600">invited</td>
                </tr>
              ))}
            </tbody>
          </table>
          {isAdmin && (
            <div className="border-t border-zinc-200 p-3">
              <button onClick={() => setShowInvite(true)}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                + Invite team member
              </button>
            </div>
          )}
        </div>
      )}

      {showNewOrg && <NewOrgModal partnerId={partnerRef.id} onClose={() => setShowNewOrg(false)} onCreated={load} />}
      {showInvite && <InviteTeammateModal partnerId={partnerRef.id} onClose={() => setShowInvite(false)} onInvited={load} />}
      {viewingOrg && <ClientConversationsModal partnerId={partnerRef.id} org={viewingOrg} onClose={() => setViewingOrg(null)} />}
    </div>
  );
}

export function PartnerConsoleView() {
  const [mine, setMine] = useState<PartnerRef[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows: PartnerRef[] = await partnerFetch("/partners/mine");
    setMine(rows);
    setSelected((prev) => prev ?? rows[0]?.id ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (mine === null) return null;
  if (mine.length === 0) return <BecomePartner onCreated={load} />;

  const active = mine.find((p) => p.id === selected) ?? mine[0];

  return (
    <div>
      {mine.length > 1 && (
        <select className="mb-4 rounded-md border border-zinc-300 px-2 py-1 text-sm" value={active.id}
          onChange={(e) => setSelected(e.target.value)}>
          {mine.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <Console partnerRef={active} />
    </div>
  );
}
