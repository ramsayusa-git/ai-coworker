import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { campaigns } from "../db/schema.js";

export async function campaignsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/campaigns", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(campaigns).where(eq(campaigns.orgId, orgId)).orderBy(desc(campaigns.createdAt))
    );
  });

  app.post("/orgs/:orgId/campaigns", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as { name: string; templateId: string; segment: string; audienceCount?: number; scheduledAt?: string };
    if (!body.name?.trim() || !body.templateId || !body.segment) {
      return reply.status(400).send({ error: "name, templateId, segment required" });
    }
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(campaigns).values({
        orgId, name: body.name.trim(), templateId: body.templateId, segment: body.segment,
        audienceCount: body.audienceCount ?? 0,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: body.scheduledAt ? "scheduled" : "draft",
      }).returning();
      return r;
    });
    return reply.status(201).send(row);
  });
}
