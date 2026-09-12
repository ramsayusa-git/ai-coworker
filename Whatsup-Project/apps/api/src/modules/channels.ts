import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { channels } from "../db/schema.js";

function scrub(row: typeof channels.$inferSelect) {
  const { credentials, ...rest } = row;
  return { ...rest, credentialsSet: !!credentials && Object.keys(credentials).length > 0 };
}

export async function channelsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/channels", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const rows = await withOrgDb(orgId, (db) => db.select().from(channels).where(eq(channels.orgId, orgId)));
    return rows.map(scrub);
  });

  app.post("/orgs/:orgId/channels", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      provider: "meta" | "whapi"; displayName: string; phoneE164?: string;
      externalId?: string; credentials?: Record<string, string>;
    };
    if (!body.provider || !body.displayName?.trim()) {
      return reply.status(400).send({ error: "provider and displayName required" });
    }
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(channels).values({
        orgId, provider: body.provider, displayName: body.displayName.trim(),
        phoneE164: body.phoneE164, externalId: body.externalId,
        credentials: body.credentials ?? {},
        webhookVerifyToken: randomBytes(16).toString("hex"),
        status: body.credentials && Object.keys(body.credentials).length ? "connected" : "disconnected",
      }).returning();
      return r;
    });
    return reply.status(201).send(scrub(row));
  });

  app.patch("/orgs/:orgId/channels/:id/credentials", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const credentials = req.body as Record<string, string>;
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.update(channels).set({ credentials, status: "connected" })
        .where(and(eq(channels.id, id), eq(channels.orgId, orgId))).returning();
      return r;
    });
    if (!row) return reply.status(404).send({ error: "not found" });
    return scrub(row);
  });
}
