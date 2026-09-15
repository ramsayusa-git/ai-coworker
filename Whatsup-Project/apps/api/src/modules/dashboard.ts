import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { dashboardLayouts } from "../db/schema.js";

// The arrangement a brand-new user starts from. Kept server-side so the default can be
// changed without shipping a frontend build, and so a user who clears their browser
// still gets the same starting grid.
const DEFAULT_WIDGETS = [
  { id: "w1", type: "kpis", w: 4, h: 1 },
  { id: "w2", type: "messageTrend", w: 2, h: 2 },
  { id: "w3", type: "conversationStatus", w: 1, h: 2 },
  { id: "w4", type: "wallet", w: 1, h: 2 },
  { id: "w5", type: "channelSplit", w: 2, h: 2 },
  { id: "w6", type: "topCampaigns", w: 2, h: 2 },
  { id: "w7", type: "agentLeaderboard", w: 2, h: 2 },
  { id: "w8", type: "tasksDue", w: 2, h: 2 },
];

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/dashboard-layout", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const userId = req.authUser!.userId;
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.select().from(dashboardLayouts)
        .where(and(eq(dashboardLayouts.orgId, orgId), eq(dashboardLayouts.userId, userId))).limit(1);
      return { widgets: row?.widgets?.length ? row.widgets : DEFAULT_WIDGETS, isDefault: !row };
    });
  });

  app.put("/orgs/:orgId/dashboard-layout", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const userId = req.authUser!.userId;
    const { widgets } = req.body as { widgets?: Array<{ id: string; type: string; w: number; h: number }> };
    if (!Array.isArray(widgets)) return reply.code(400).send({ error: "widgets array required" });
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.insert(dashboardLayouts)
        .values({ orgId, userId, widgets, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [dashboardLayouts.orgId, dashboardLayouts.userId],
          set: { widgets, updatedAt: new Date() },
        })
        .returning();
      return { widgets: row.widgets };
    });
  });

  // Resetting is a delete, not a write of the defaults — so a later change to the
  // default grid reaches everyone who reset, instead of freezing today's version in.
  app.delete("/orgs/:orgId/dashboard-layout", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const userId = req.authUser!.userId;
    await withOrgDb(orgId, (db) => db.delete(dashboardLayouts)
      .where(and(eq(dashboardLayouts.orgId, orgId), eq(dashboardLayouts.userId, userId))));
    return { widgets: DEFAULT_WIDGETS };
  });
}
