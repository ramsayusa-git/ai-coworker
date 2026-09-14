import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import dns from "node:dns/promises";
import { and, eq, isNull } from "drizzle-orm";
import { db, withOrgDb } from "../db/client.js";
import { partners, partnerMembers, partnerInvites, orgs, orgMembers, users, conversations, contacts } from "../db/schema.js";

const PARTNER_ROLES = ["partner_owner", "partner_admin", "partner_support"] as const;

// Partner-scoped routes don't rely on the org-scoped JWT (a partner isn't an org), so every
// handler here authenticates the token, then checks partner_members directly against the
// :partnerId in the URL. `minRole` narrows to owner/admin for routes that mutate branding
// or team; partner_support (read-only per the architecture doc's role list) can list/view.
async function requirePartnerMember(app: FastifyInstance, req: any, reply: any, opts?: { adminOnly?: boolean }) {
  await app.authenticate(req, reply);
  if (reply.sent) return null;
  const { partnerId } = req.params as { partnerId: string };
  const [membership] = await db.select().from(partnerMembers)
    .where(and(eq(partnerMembers.partnerId, partnerId), eq(partnerMembers.userId, req.authUser.userId)));
  if (!membership || membership.status !== "active") {
    reply.status(403).send({ error: "Not a member of this partner" });
    return null;
  }
  if (opts?.adminOnly && !["partner_owner", "partner_admin"].includes(membership.role)) {
    reply.status(403).send({ error: "Only partner owners/admins can do this" });
    return null;
  }
  return membership;
}

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "partner";
}

export async function partnersRoutes(app: FastifyInstance) {
  // Become a reseller/agency: any authenticated Whatsup user can spin up a partner account
  // and immediately becomes its partner_owner. This is the "multi-vendor management" entry
  // point — from here they create and manage many client orgs under one white-labeled brand.
  app.post("/partners", { preHandler: app.authenticate }, async (req, reply) => {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return reply.status(400).send({ error: "name required" });
    let slug = slugify(name);
    const [clash] = await db.select().from(partners).where(eq(partners.slug, slug));
    if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const [partner] = await db.insert(partners).values({ name: name.trim(), slug, billingMode: "wholesale" }).returning();
    await db.insert(partnerMembers).values({ partnerId: partner.id, userId: req.authUser!.userId, role: "partner_owner" });
    return reply.status(201).send(partner);
  });

  // List the partners the current user belongs to (drives whether "Partner Console" shows up).
  app.get("/partners/mine", { preHandler: app.authenticate }, async (req) => {
    return db.select({ id: partners.id, name: partners.name, slug: partners.slug, role: partnerMembers.role })
      .from(partnerMembers).innerJoin(partners, eq(partnerMembers.partnerId, partners.id))
      .where(eq(partnerMembers.userId, req.authUser!.userId));
  });

  app.get("/partners/:partnerId", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply))) return;
    const { partnerId } = req.params as { partnerId: string };
    const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId));
    if (!partner) return reply.status(404).send({ error: "not found" });
    return partner;
  });

  // White-label branding: name/logo/colors/support email live in `brand` jsonb; custom
  // domain is its own column since it needs its own Cloudflare-for-SaaS hostname later.
  app.patch("/partners/:partnerId/branding", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply, { adminOnly: true }))) return;
    const { partnerId } = req.params as { partnerId: string };
    const { brand, customDomain } = req.body as { brand?: Record<string, unknown>; customDomain?: string };
    const [current] = await db.select().from(partners).where(eq(partners.id, partnerId));
    if (!current) return reply.status(404).send({ error: "not found" });

    const patch: Record<string, unknown> = { brand: { ...(current.brand as object), ...(brand ?? {}) } };
    if (customDomain !== undefined) {
      const normalized = customDomain.trim().toLowerCase();
      if (normalized !== (current.customDomain ?? "")) {
        // A new/changed domain always restarts verification — never carry over a stale
        // "verified" status onto a domain that was never actually checked.
        patch.customDomain = normalized || null;
        patch.customDomainStatus = normalized ? "pending" : "unset";
        patch.domainVerificationToken = normalized ? randomBytes(12).toString("hex") : null;
        patch.domainVerifiedAt = null;
        // A new/changed domain always starts inactive — re-verifying doesn't imply the admin
        // wants it live again, especially if this changed because the old one broke.
        patch.customDomainActive = false;
      }
    }
    const [updated] = await db.update(partners).set(patch).where(eq(partners.id, partnerId)).returning();
    return updated;
  });

  // Real DNS-based domain verification — no paid Cloudflare/registrar API needed. The partner
  // adds a TXT record proving ownership and a CNAME pointing their domain at Whatsup's edge;
  // this does the actual live lookups rather than trusting a form submission.
  app.get("/partners/:partnerId/domain-instructions", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply))) return;
    const { partnerId } = req.params as { partnerId: string };
    const [p] = await db.select().from(partners).where(eq(partners.id, partnerId));
    if (!p) return reply.status(404).send({ error: "not found" });
    if (!p.customDomain) return reply.status(400).send({ error: "No custom domain set — save one on the Branding tab first" });
    return {
      domain: p.customDomain,
      status: p.customDomainStatus,
      records: [
        { type: "TXT", host: `_whatsup-verify.${p.customDomain}`, value: p.domainVerificationToken },
        { type: "CNAME", host: p.customDomain, value: `${p.slug}.edge.whatsup.app` },
      ],
    };
  });

  app.post("/partners/:partnerId/domain-verify", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply, { adminOnly: true }))) return;
    const { partnerId } = req.params as { partnerId: string };
    const [p] = await db.select().from(partners).where(eq(partners.id, partnerId));
    if (!p) return reply.status(404).send({ error: "not found" });
    if (!p.customDomain || !p.domainVerificationToken) {
      return reply.status(400).send({ error: "No custom domain pending verification" });
    }

    const expectedCname = `${p.slug}.edge.whatsup.app`;
    let ownershipOk = false;
    let cnameOk = false;
    let error: string | undefined;
    try {
      const txtRecords = await dns.resolveTxt(`_whatsup-verify.${p.customDomain}`);
      ownershipOk = txtRecords.some((rec) => rec.join("").trim() === p.domainVerificationToken);
    } catch (err) {
      error = `TXT lookup failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    try {
      const cnameRecords = await dns.resolveCname(p.customDomain);
      cnameOk = cnameRecords.some((rec) => rec.replace(/\.$/, "") === expectedCname);
    } catch (err) {
      error = [error, `CNAME lookup failed: ${err instanceof Error ? err.message : String(err)}`].filter(Boolean).join("; ");
    }

    const status = ownershipOk && cnameOk ? "verified" : "failed";
    const [updated] = await db.update(partners)
      .set({ customDomainStatus: status, domainVerifiedAt: status === "verified" ? new Date() : null })
      .where(eq(partners.id, partnerId)).returning();

    return { status: updated.customDomainStatus, ownershipOk, cnameOk, expectedCname, error };
  });

  // Explicit go-live switch, separate from verification: a DNS-verified domain isn't served
  // to real visitors (see GET /public/branding below) until an admin flips this on. Lets a
  // partner verify ahead of time or pause a live domain without losing the DNS check state.
  app.post("/partners/:partnerId/domain-activate", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply, { adminOnly: true }))) return;
    const { partnerId } = req.params as { partnerId: string };
    const { active } = req.body as { active?: boolean };
    const [p] = await db.select().from(partners).where(eq(partners.id, partnerId));
    if (!p) return reply.status(404).send({ error: "not found" });
    if (active && p.customDomainStatus !== "verified") {
      return reply.status(400).send({ error: "Domain must be verified before it can be activated" });
    }
    const [updated] = await db.update(partners).set({ customDomainActive: !!active })
      .where(eq(partners.id, partnerId)).returning();
    return { customDomainActive: updated.customDomainActive };
  });

  app.get("/partners/:partnerId/members", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply))) return;
    const { partnerId } = req.params as { partnerId: string };
    return db.select({ userId: users.id, name: users.name, email: users.email, role: partnerMembers.role, status: partnerMembers.status })
      .from(partnerMembers).innerJoin(users, eq(partnerMembers.userId, users.id))
      .where(eq(partnerMembers.partnerId, partnerId));
  });

  // Invite another user onto the partner team (partner_admin or partner_support — an owner
  // shouldn't be handed out by invite; promote via direct DB/ops action instead).
  app.post("/partners/:partnerId/invites", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply, { adminOnly: true }))) return;
    const { partnerId } = req.params as { partnerId: string };
    const { email, role } = req.body as { email?: string; role?: string };
    if (!email?.trim()) return reply.status(400).send({ error: "email required" });
    const safeRole = role === "partner_support" ? "partner_support" : "partner_admin";
    const token = randomBytes(24).toString("hex");
    const [invite] = await db.insert(partnerInvites).values({
      partnerId, email: email.trim().toLowerCase(), role: safeRole,
      token, invitedBy: req.authUser!.userId, expiresAt: new Date(Date.now() + 7 * 86_400_000),
    }).returning();
    return reply.status(201).send({ ...invite, acceptUrl: `/accept-partner-invite?token=${token}` });
  });

  app.get("/partners/:partnerId/invites", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply))) return;
    const { partnerId } = req.params as { partnerId: string };
    return db.select().from(partnerInvites).where(and(eq(partnerInvites.partnerId, partnerId), isNull(partnerInvites.acceptedAt)));
  });

  // Public — accepting a partner invite doesn't require an existing session.
  app.post("/auth/accept-partner-invite", async (req, reply) => {
    const { token, password, name } = req.body as { token?: string; password?: string; name?: string };
    if (!token || !password || password.length < 8) {
      return reply.status(400).send({ error: "token and password (min 8 chars) required" });
    }
    const [invite] = await db.select().from(partnerInvites).where(eq(partnerInvites.token, token));
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return reply.status(400).send({ error: "Invite is invalid or expired" });
    }
    let [user] = await db.select().from(users).where(eq(users.email, invite.email));
    const passwordHash = await bcrypt.hash(password, 10);
    if (!user) {
      [user] = await db.insert(users).values({ email: invite.email, name: name?.trim(), passwordHash }).returning();
    } else {
      await db.update(users).set({ passwordHash, name: name?.trim() ?? user.name }).where(eq(users.id, user.id));
    }
    await db.insert(partnerMembers).values({ partnerId: invite.partnerId, userId: user.id, role: invite.role, status: "active" })
      .onConflictDoUpdate({ target: [partnerMembers.partnerId, partnerMembers.userId], set: { status: "active", role: invite.role } });
    await db.update(partnerInvites).set({ acceptedAt: new Date() }).where(eq(partnerInvites.id, invite.id));
    const [partner] = await db.select().from(partners).where(eq(partners.id, invite.partnerId));
    const jwtToken = app.jwt.sign({ userId: user.id, orgId: "", role: invite.role, email: user.email }, { expiresIn: "7d" });
    return reply.send({ token: jwtToken, user: { id: user.id, email: user.email, name: user.name, partnerId: invite.partnerId, partnerName: partner?.name, role: invite.role } });
  });

  // partner_access-gated view into a client org's conversations. Enforces the architecture
  // doc's explicit grant: "none" = 403 (partner manages billing/branding only, sees nothing),
  // "metadata" = status/contact/timestamps but never message body, "full" = everything.
  app.get("/partners/:partnerId/orgs/:orgId/conversations", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply))) return;
    const { partnerId, orgId } = req.params as { partnerId: string; orgId: string };
    const [org] = await db.select().from(orgs).where(and(eq(orgs.id, orgId), eq(orgs.partnerId, partnerId)));
    if (!org) return reply.status(404).send({ error: "not found" });
    if (org.partnerAccess === "none" || !org.partnerAccess) {
      return reply.status(403).send({ error: "This client has not granted the partner data access" });
    }
    const rows = await withOrgDb(orgId, (scoped) =>
      scoped.select({
        id: conversations.id, status: conversations.status, unread: conversations.unread,
        lastMessageAt: conversations.lastMessageAt, lastMessage: conversations.lastMessage,
        contactName: contacts.name, contactPhone: contacts.phoneE164,
      }).from(conversations).innerJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.orgId, orgId))
    );
    const full = org.partnerAccess === "full";
    return rows.map((r) => (full ? r : { ...r, lastMessage: undefined }));
  });

  // Multi-vendor management: every client org (a "vendor"/customer workspace) under this
  // partner's brand, with basic counts so the partner console reads like a fleet view.
  app.get("/partners/:partnerId/orgs", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply))) return;
    const { partnerId } = req.params as { partnerId: string };
    const rows = await db.select().from(orgs).where(eq(orgs.partnerId, partnerId));
    return rows.map((o) => ({
      id: o.id, name: o.name, planId: o.planId, walletPaise: o.walletPaise,
      partnerAccess: o.partnerAccess, createdAt: o.createdAt,
    }));
  });

  // Partner creates a new client org and its first user (the client's org_owner) in one
  // step — this is what "onboard a new vendor/client" looks like from the partner console.
  app.post("/partners/:partnerId/orgs", async (req, reply) => {
    if (!(await requirePartnerMember(app, req, reply, { adminOnly: true }))) return;
    const { partnerId } = req.params as { partnerId: string };
    const { orgName, ownerEmail, ownerName, ownerPassword, partnerAccess } = req.body as {
      orgName?: string; ownerEmail?: string; ownerName?: string; ownerPassword?: string; partnerAccess?: string;
    };
    if (!orgName?.trim() || !ownerEmail?.trim() || !ownerPassword || ownerPassword.length < 8) {
      return reply.status(400).send({ error: "orgName, ownerEmail, and ownerPassword (min 8 chars) are required" });
    }
    const normalizedEmail = ownerEmail.trim().toLowerCase();
    let [owner] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (!owner) {
      const passwordHash = await bcrypt.hash(ownerPassword, 10);
      [owner] = await db.insert(users).values({ email: normalizedEmail, name: ownerName?.trim(), passwordHash }).returning();
    }
    const [org] = await db.insert(orgs).values({
      partnerId, name: orgName.trim(),
      partnerAccess: (["none", "metadata", "full"].includes(partnerAccess ?? "") ? partnerAccess : "none"),
    }).returning();
    await db.insert(orgMembers).values({ orgId: org.id, userId: owner.id, role: "org_owner", status: "active" })
      .onConflictDoNothing();
    return reply.status(201).send({ id: org.id, name: org.name, ownerEmail: owner.email });
  });

  // Unauthenticated white-label lookup for pre-login screens (login/register/accept-invite)
  // and for setting the browser tab favicon before we know who's signing in. Matched by the
  // custom domain the request came in on — falls back to the platform default brand when no
  // partner owns that host (or none was supplied, e.g. local dev on localhost:3000).
  app.get("/public/branding", async (req) => {
    const host = ((req.query as { host?: string })?.host || (req.headers.host as string) || "")
      .split(":")[0].trim().toLowerCase();
    type Brand = { brandName: string; logoUrl: string | null; faviconUrl: string | null; footerText: string | null; primaryColor: string };
    const DEFAULT_BRAND: Brand = { brandName: "Loqio", logoUrl: null, faviconUrl: null, footerText: null, primaryColor: "#059669" };
    if (!host) return DEFAULT_BRAND;
    const [partner] = await db.select().from(partners).where(eq(partners.customDomain, host));
    if (!partner || partner.customDomainStatus !== "verified" || !partner.customDomainActive) return DEFAULT_BRAND;
    const brand = (partner.brand as Record<string, unknown>) ?? {};
    return {
      brandName: (brand.brandName as string) || partner.name || DEFAULT_BRAND.brandName,
      logoUrl: (brand.logoUrl as string) || null,
      faviconUrl: (brand.faviconUrl as string) || null,
      footerText: (brand.footerText as string) || null,
      primaryColor: (brand.primaryColor as string) || DEFAULT_BRAND.primaryColor,
    };
  });
}
