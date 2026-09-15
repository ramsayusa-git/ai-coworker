import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { webhookEndpoints, webhookDeliveries, apiKeys } from "../db/schema.js";
import { WEBHOOK_EVENTS, signPayload } from "../events.js";
import { requireCapability } from "../rbac.js";
import { requireFeature, orgLimit } from "../billing.js";

export function hashKey(plain: string) {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

export async function developerRoutes(app: FastifyInstance) {
  // --- Outbound webhooks (Advanced plan) ---------------------------------
  app.get("/orgs/:orgId/webhook-events", async () => ({ events: WEBHOOK_EVENTS }));

  app.get("/orgs/:orgId/webhook-endpoints", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, async (db) => {
      const rows = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.orgId, orgId));
      // Never re-serve the signing secret after creation.
      return rows.map(({ secret, ...r }) => ({ ...r, secretSet: Boolean(secret) }));
    });
  });

  app.post("/orgs/:orgId/webhook-endpoints", {
    preHandler: [requireCapability("manage_settings"), requireFeature("webhooks", "Outbound webhooks")],
  }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as { url?: string; events?: string[]; description?: string };
    if (!b?.url?.startsWith("http")) return reply.code(400).send({ error: "url must be an http(s) URL" });

    const limit = await orgLimit(orgId, "webhookEndpoints");
    return withOrgDb(orgId, async (db) => {
      if (limit >= 0) {
        const existing = await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(eq(webhookEndpoints.orgId, orgId));
        if (existing.length >= limit) {
          return reply.code(402).send({ error: "plan_limit_reached", message: `Your plan allows ${limit} webhook endpoint(s).` });
        }
      }
      const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
      const [row] = await db.insert(webhookEndpoints).values({
        orgId, url: b.url!, description: b.description ?? null, secret,
        events: b.events?.length ? b.events : ["message.received"],
      }).returning();
      // Secret is returned exactly once, here.
      return { ...row, secret };
    });
  });

  app.patch("/orgs/:orgId/webhook-endpoints/:id", { preHandler: requireCapability("manage_settings") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const b = req.body as Record<string, any>;
    const patch: Record<string, unknown> = {};
    for (const k of ["url", "events", "active", "description"]) if (b[k] !== undefined) patch[k] = b[k];
    if (!Object.keys(patch).length) return reply.code(400).send({ error: "nothing to update" });
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.update(webhookEndpoints).set(patch)
        .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.id, id))).returning();
      if (!row) return reply.code(404).send({ error: "not found" });
      const { secret, ...rest } = row;
      return rest;
    });
  });

  app.delete("/orgs/:orgId/webhook-endpoints/:id", { preHandler: requireCapability("manage_settings") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.id, id))));
    return { ok: true };
  });

  app.get("/orgs/:orgId/webhook-deliveries", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const { endpointId } = req.query as { endpointId?: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(webhookDeliveries)
        .where(endpointId
          ? and(eq(webhookDeliveries.orgId, orgId), eq(webhookDeliveries.endpointId, endpointId))
          : eq(webhookDeliveries.orgId, orgId))
        .orderBy(desc(webhookDeliveries.createdAt)).limit(100)
    );
  });

  // Fires a signed test event at one endpoint immediately, so an org can verify their
  // receiver (and their signature check) without waiting for real traffic.
  app.post("/orgs/:orgId/webhook-endpoints/:id/test", { preHandler: requireCapability("manage_settings") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, async (db) => {
      const [ep] = await db.select().from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.id, id))).limit(1);
      if (!ep) return reply.code(404).send({ error: "not found" });
      const body = JSON.stringify({ event: "test", orgId, occurredAt: new Date().toISOString(), data: { ping: true } });
      const ts = Math.floor(Date.now() / 1000);
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-loqio-event": "test",
            "x-loqio-timestamp": String(ts),
            "x-loqio-signature": `sha256=${signPayload(ep.secret, body, ts)}`,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return reply.code(502).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
  });

  // --- Developer API keys (Advanced plan) --------------------------------
  app.get("/orgs/:orgId/api-keys", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, async (db) => {
      const rows = await db.select().from(apiKeys).where(eq(apiKeys.orgId, orgId)).orderBy(desc(apiKeys.createdAt));
      return rows.map(({ keyHash, ...r }) => r);
    });
  });

  app.post("/orgs/:orgId/api-keys", {
    preHandler: [requireCapability("manage_settings"), requireFeature("developer_api", "The developer API")],
  }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as { name?: string; scopes?: string[] };
    if (!b?.name?.trim()) return reply.code(400).send({ error: "name is required" });
    const limit = await orgLimit(orgId, "apiKeys");
    return withOrgDb(orgId, async (db) => {
      if (limit >= 0) {
        const live = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.orgId, orgId));
        if (live.filter((k) => k).length >= limit) {
          return reply.code(402).send({ error: "plan_limit_reached", message: `Your plan allows ${limit} API key(s).` });
        }
      }
      const plain = `loq_live_${crypto.randomBytes(24).toString("hex")}`;
      const [row] = await db.insert(apiKeys).values({
        orgId, name: b.name!.trim(), prefix: plain.slice(0, 16), keyHash: hashKey(plain),
        scopes: b.scopes?.length ? b.scopes : ["messages:send", "contacts:read", "contacts:write", "templates:read"],
        createdBy: (req as any).authUser?.userId ?? null,
      }).returning();
      const { keyHash, ...rest } = row;
      // Shown once. We store only the SHA-256 hash.
      return { ...rest, key: plain };
    });
  });

  app.delete("/orgs/:orgId/api-keys/:id", { preHandler: requireCapability("manage_settings") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.update(apiKeys).set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.id, id))));
    return { ok: true };
  });
}
