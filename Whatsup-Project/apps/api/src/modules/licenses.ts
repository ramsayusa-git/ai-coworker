import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { licenses, licenseActivations, partnerMembers, plans } from "../db/schema.js";
import { activateLicense, issueLicense, verifyLicenseKey } from "../licensing.js";

// Public, unauthenticated: this is what a self-hosted or dedicated instance calls.
// It has no user session and no org — only its licence key.
export async function licenseActivationRoutes(app: FastifyInstance) {
  app.post("/license/activate", async (req, reply) => {
    const b = req.body as { key?: string; instanceId?: string; hostname?: string; version?: string };
    if (!b?.key || !b?.instanceId) return reply.code(400).send({ error: "key and instanceId are required" });
    const result = await activateLicense({
      key: b.key, instanceId: b.instanceId, hostname: b.hostname, version: b.version, ipAddress: req.ip,
    });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return { ok: true, entitlements: result.entitlements };
  });

  // Signature-only check, for a customer verifying a key before installing anything.
  // Deliberately does NOT reveal revocation state to an unauthenticated caller —
  // activate does that.
  app.post("/license/verify", async (req, reply) => {
    const { key } = req.body as { key?: string };
    if (!key) return reply.code(400).send({ error: "key is required" });
    const r = verifyLicenseKey(key);
    if (!r.valid) return reply.code(400).send({ valid: false, reason: r.reason });
    const p = r.payload;
    return {
      valid: true, plan: p.plan, deployment: p.deployment, issuedTo: p.name,
      seats: p.seats, channels: p.channels, maxInstances: p.maxInstances,
      whiteLabel: p.whiteLabel, validFrom: p.from, validUntil: p.until ?? null,
    };
  });
}

// Partner-scoped licence management: a reseller issues and manages licences for the
// clients it sells self-hosted or dedicated deployments to. Not org-scoped, so it
// authenticates against partner_members the same way partners.ts does.
export async function partnerLicenseRoutes(app: FastifyInstance) {
  async function requirePartnerMember(req: any, reply: any, adminOnly = false) {
    const { partnerId } = req.params as { partnerId: string };
    const userId = req.authUser?.userId;
    const [m] = await db.select().from(partnerMembers)
      .where(and(eq(partnerMembers.partnerId, partnerId), eq(partnerMembers.userId, userId))).limit(1);
    if (!m) { reply.code(403).send({ error: "Not a member of this partner account" }); return null; }
    if (adminOnly && !["partner_owner", "partner_admin"].includes(m.role)) {
      reply.code(403).send({ error: "Requires partner_owner or partner_admin" }); return null;
    }
    return m;
  }

  app.get("/partners/:partnerId/licenses", async (req, reply) => {
    if (!(await requirePartnerMember(req, reply))) return;
    const { partnerId } = req.params as { partnerId: string };
    const rows = await db.select().from(licenses)
      .where(eq(licenses.partnerId, partnerId)).orderBy(desc(licenses.createdAt));
    // The key is shown once at issue time; afterwards only its tail, so support can
    // identify a licence without the full key being re-readable here.
    return rows.map(({ key, keyHash, ...r }) => ({ ...r, keyTail: key.slice(-8) }));
  });

  app.post("/partners/:partnerId/licenses", async (req, reply) => {
    if (!(await requirePartnerMember(req, reply, true))) return;
    const { partnerId } = req.params as { partnerId: string };
    const b = req.body as {
      planId?: string; issuedToName?: string; issuedToEmail?: string;
      seats?: number; channels?: number; maxInstances?: number; months?: number; notes?: string;
    };
    if (!b?.planId || !b?.issuedToName?.trim()) {
      return reply.code(400).send({ error: "planId and issuedToName are required" });
    }
    const [plan] = await db.select().from(plans).where(eq(plans.id, b.planId)).limit(1);
    if (!plan) return reply.code(400).send({ error: "unknown plan" });
    if (plan.audience === "direct") {
      return reply.code(403).send({ error: "Direct plans cannot be licensed on by a partner — use a reseller or enterprise edition." });
    }
    try {
      const { license, key } = await issueLicense({
        planId: b.planId,
        deployment: plan.deployment,
        issuedToName: b.issuedToName.trim(),
        issuedToEmail: b.issuedToEmail ?? null,
        seats: b.seats, channels: b.channels, maxInstances: b.maxInstances,
        validUntil: b.months ? new Date(Date.now() + b.months * 30 * 24 * 3600 * 1000) : null,
        partnerId,
        notes: b.notes ?? null,
      });
      const { keyHash, ...rest } = license;
      return reply.code(201).send({ ...rest, key }); // full key returned exactly once
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch("/partners/:partnerId/licenses/:id", async (req, reply) => {
    if (!(await requirePartnerMember(req, reply, true))) return;
    const { partnerId, id } = req.params as { partnerId: string; id: string };
    const { status, notes } = req.body as { status?: string; notes?: string };
    const patch: Record<string, unknown> = {};
    if (status && ["active", "suspended", "revoked"].includes(status)) patch.status = status;
    if (notes !== undefined) patch.notes = notes;
    if (!Object.keys(patch).length) return reply.code(400).send({ error: "nothing to update" });
    const [row] = await db.update(licenses).set(patch)
      .where(and(eq(licenses.partnerId, partnerId), eq(licenses.id, id))).returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    const { key, keyHash, ...rest } = row;
    return rest;
  });

  app.get("/partners/:partnerId/licenses/:id/activations", async (req, reply) => {
    if (!(await requirePartnerMember(req, reply))) return;
    const { partnerId, id } = req.params as { partnerId: string; id: string };
    const [lic] = await db.select().from(licenses)
      .where(and(eq(licenses.partnerId, partnerId), eq(licenses.id, id))).limit(1);
    if (!lic) return reply.code(404).send({ error: "not found" });
    return db.select().from(licenseActivations)
      .where(eq(licenseActivations.licenseId, id)).orderBy(desc(licenseActivations.lastSeenAt));
  });

  app.delete("/partners/:partnerId/licenses/:id/activations/:activationId", async (req, reply) => {
    if (!(await requirePartnerMember(req, reply, true))) return;
    const { partnerId, id, activationId } = req.params as { partnerId: string; id: string; activationId: string };
    const [lic] = await db.select().from(licenses)
      .where(and(eq(licenses.partnerId, partnerId), eq(licenses.id, id))).limit(1);
    if (!lic) return reply.code(404).send({ error: "not found" });
    // Frees a slot against the instance cap without invalidating the licence itself.
    await db.update(licenseActivations).set({ revokedAt: new Date() })
      .where(and(eq(licenseActivations.licenseId, id), eq(licenseActivations.id, activationId)));
    return { ok: true };
  });
}
