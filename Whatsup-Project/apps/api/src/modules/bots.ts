import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { bots } from "../db/schema.js";

export async function botsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/bots", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) => db.select().from(bots).where(eq(bots.orgId, orgId)));
  });

  app.patch("/orgs/:orgId/bots/:id", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { enabled } = req.body as { enabled: boolean };
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.update(bots).set({ enabled, updatedAt: new Date() })
        .where(and(eq(bots.id, id), eq(bots.orgId, orgId))).returning();
      return r;
    });
    if (!row) return reply.status(404).send({ error: "not found" });
    return row;
  });
}
