import type { FastifyInstance } from "fastify";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { pipelines, pipelineStages, deals } from "../db/schema.js";
import { requireCapability } from "../rbac.js";

// Default stage set for a brand-new pipeline — matches the shape wacrm ships with
// (New Lead -> Qualified -> Proposal Sent -> Negotiation -> Won), so switchers land on
// something familiar. See seedDefaultPipeline(), called once at org creation.
const DEFAULT_STAGES = [
  { name: "New Lead", color: "#f59e0b" },
  { name: "Qualified", color: "#3b82f6" },
  { name: "Proposal Sent", color: "#8b5cf6" },
  { name: "Negotiation", color: "#ec4899" },
  { name: "Won", color: "#10b981" },
];

export async function seedDefaultPipeline(orgId: string) {
  return withOrgDb(orgId, async (db) => {
    const [pipeline] = await db.insert(pipelines).values({ orgId, name: "Sales Pipeline", isDefault: true }).returning();
    await db.insert(pipelineStages).values(
      DEFAULT_STAGES.map((s, i) => ({ orgId, pipelineId: pipeline.id, name: s.name, color: s.color, position: i }))
    );
    return pipeline;
  });
}

export async function dealsRoutes(app: FastifyInstance) {
  // --- Pipelines + their stages ---------------------------------------------------------
  app.get("/orgs/:orgId/pipelines", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, async (db) => {
      const pls = await db.select().from(pipelines).where(eq(pipelines.orgId, orgId)).orderBy(asc(pipelines.createdAt));
      const stageRows = await db.select().from(pipelineStages).where(eq(pipelineStages.orgId, orgId)).orderBy(asc(pipelineStages.position));
      return pls.map((p) => ({ ...p, stages: stageRows.filter((s) => s.pipelineId === p.id) }));
    });
  });

  app.post("/orgs/:orgId/pipelines", { preHandler: requireCapability("manage_deals") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return reply.status(400).send({ error: "name required" });
    const row = await withOrgDb(orgId, async (db) => {
      const [p] = await db.insert(pipelines).values({ orgId, name: name.trim() }).returning();
      await db.insert(pipelineStages).values(
        ["New Lead", "Qualified", "Proposal Sent", "Negotiation", "Won"].map((n, i) => ({ orgId, pipelineId: p.id, name: n, position: i }))
      );
      return p;
    });
    return reply.status(201).send(row);
  });

  app.post("/orgs/:orgId/pipelines/:pipelineId/stages", { preHandler: requireCapability("manage_deals") }, async (req, reply) => {
    const { orgId, pipelineId } = req.params as { orgId: string; pipelineId: string };
    const { name, color } = req.body as { name?: string; color?: string };
    if (!name?.trim()) return reply.status(400).send({ error: "name required" });
    const row = await withOrgDb(orgId, async (db) => {
      const existing = await db.select({ n: sql<number>`count(*)` }).from(pipelineStages)
        .where(and(eq(pipelineStages.pipelineId, pipelineId), eq(pipelineStages.orgId, orgId)));
      const [s] = await db.insert(pipelineStages).values({
        orgId, pipelineId, name: name.trim(), color: color ?? "#71717a", position: Number(existing[0]?.n ?? 0),
      }).returning();
      return s;
    });
    return reply.status(201).send(row);
  });

  app.patch("/orgs/:orgId/pipelines/:pipelineId/stages/:stageId", { preHandler: requireCapability("manage_deals") }, async (req, reply) => {
    const { orgId, stageId } = req.params as { orgId: string; pipelineId: string; stageId: string };
    const { name, color, position } = req.body as { name?: string; color?: string; position?: number };
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (color !== undefined) patch.color = color;
    if (position !== undefined) patch.position = position;
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: "nothing to update" });
    const row = await withOrgDb(orgId, async (db) => {
      const [s] = await db.update(pipelineStages).set(patch)
        .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.orgId, orgId))).returning();
      return s;
    });
    if (!row) return reply.status(404).send({ error: "stage not found" });
    return row;
  });

  app.delete("/orgs/:orgId/pipelines/:pipelineId/stages/:stageId", { preHandler: requireCapability("manage_deals") }, async (req, reply) => {
    const { orgId, stageId } = req.params as { orgId: string; pipelineId: string; stageId: string };
    await withOrgDb(orgId, (db) => db.delete(pipelineStages).where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.orgId, orgId))));
    return reply.status(204).send();
  });

  // --- Deals ------------------------------------------------------------------------------
  app.get("/orgs/:orgId/deals", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const { pipelineId } = req.query as { pipelineId?: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(deals).where(
        pipelineId ? and(eq(deals.orgId, orgId), eq(deals.pipelineId, pipelineId)) : eq(deals.orgId, orgId)
      ).orderBy(asc(deals.position))
    );
  });

  app.post("/orgs/:orgId/deals", { preHandler: requireCapability("manage_deals") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      pipelineId?: string; stageId?: string; title?: string; valuePaise?: number;
      contactId?: string; conversationId?: string; assigneeId?: string;
      expectedCloseDate?: string; notes?: string;
    };
    if (!body.pipelineId || !body.stageId || !body.title?.trim()) {
      return reply.status(400).send({ error: "pipelineId, stageId and title are required" });
    }
    const row = await withOrgDb(orgId, async (db) => {
      const existing = await db.select({ n: sql<number>`count(*)` }).from(deals)
        .where(and(eq(deals.orgId, orgId), eq(deals.stageId, body.stageId!)));
      const [d] = await db.insert(deals).values({
        orgId, pipelineId: body.pipelineId!, stageId: body.stageId!, title: body.title!.trim(),
        valuePaise: body.valuePaise ?? 0, contactId: body.contactId, conversationId: body.conversationId,
        assigneeId: body.assigneeId, expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : undefined,
        notes: body.notes, position: Number(existing[0]?.n ?? 0),
      }).returning();
      return d;
    });
    return reply.status(201).send(row);
  });

  // Card moved between columns, edited in the side sheet, or marked won/lost — one PATCH
  // covers all three since the frontend just sends whichever fields changed.
  app.patch("/orgs/:orgId/deals/:id", { preHandler: requireCapability("manage_deals") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = req.body as {
      title?: string; valuePaise?: number; stageId?: string; status?: "open" | "won" | "lost";
      contactId?: string | null; conversationId?: string | null; assigneeId?: string | null;
      expectedCloseDate?: string | null; notes?: string | null; position?: number;
    };
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["title", "valuePaise", "stageId", "status", "contactId", "conversationId", "assigneeId", "notes", "position"] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (body.expectedCloseDate !== undefined) {
      patch.expectedCloseDate = body.expectedCloseDate ? new Date(body.expectedCloseDate) : null;
    }
    const row = await withOrgDb(orgId, async (db) => {
      const [d] = await db.update(deals).set(patch).where(and(eq(deals.id, id), eq(deals.orgId, orgId))).returning();
      return d;
    });
    if (!row) return reply.status(404).send({ error: "deal not found" });
    return row;
  });

  app.delete("/orgs/:orgId/deals/:id", { preHandler: requireCapability("manage_deals") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(deals).where(and(eq(deals.id, id), eq(deals.orgId, orgId))));
    return reply.status(204).send();
  });

  // Analytics strip shown above the board: total open value, count per stage, and the
  // trailing-90-day win rate (won / (won + lost)) — same three numbers wacrm's Pipelines
  // docs describe.
  app.get("/orgs/:orgId/deals/analytics", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const { pipelineId } = req.query as { pipelineId?: string };
    return withOrgDb(orgId, async (db) => {
      const scope = pipelineId ? and(eq(deals.orgId, orgId), eq(deals.pipelineId, pipelineId)) : eq(deals.orgId, orgId);

      const openRows = await db.select({ valuePaise: deals.valuePaise, stageId: deals.stageId })
        .from(deals).where(and(scope, eq(deals.status, "open")));
      const totalOpenValuePaise = openRows.reduce((sum, r) => sum + (r.valuePaise ?? 0), 0);
      const countByStage: Record<string, number> = {};
      for (const r of openRows) countByStage[r.stageId] = (countByStage[r.stageId] ?? 0) + 1;

      const since = new Date(Date.now() - 90 * 86_400_000);
      const closedRows = await db.select({ status: deals.status }).from(deals)
        .where(and(scope, inArray(deals.status, ["won", "lost"]), gte(deals.updatedAt, since)));
      const won = closedRows.filter((r) => r.status === "won").length;
      const lost = closedRows.filter((r) => r.status === "lost").length;
      const winRate = won + lost === 0 ? null : Math.round((won / (won + lost)) * 100);

      return { totalOpenValuePaise, openDealCount: openRows.length, countByStage, winRate90d: winRate, won90d: won, lost90d: lost };
    });
  });
}
