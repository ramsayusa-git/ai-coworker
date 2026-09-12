import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { bots } from "../db/schema.js";
import { requireCapability } from "../rbac.js";

export async function botsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/bots", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) => db.select().from(bots).where(eq(bots.orgId, orgId)));
  });

  app.post("/orgs/:orgId/bots", { preHandler: requireCapability("manage_bots") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as { name?: string; triggerSummary?: string };
    if (!body.name?.trim()) return reply.status(400).send({ error: "name required" });
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(bots).values({
        orgId, name: body.name!.trim(), triggerSummary: body.triggerSummary?.trim() || "New trigger — edit me",
        enabled: false,
        nodes: [{ id: "n1", type: "trigger", label: "Trigger", detail: "Edit this trigger", x: 40, y: 40 }],
        edges: [],
      }).returning();
      return r;
    });
    return reply.status(201).send(row);
  });

  // Full flow-editor save: name/trigger summary/enabled plus the whole nodes+edges graph
  // (positions, labels, connections) from the drag-and-drop builder. Partial — only fields
  // present in the body are touched, so the enable/disable toggle can keep posting just
  // `{enabled}` without clobbering the graph.
  app.patch("/orgs/:orgId/bots/:id", { preHandler: requireCapability("manage_bots") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { enabled, name, triggerSummary, nodes, edges } = req.body as {
      enabled?: boolean; name?: string; triggerSummary?: string;
      nodes?: { id: string; type: string; label: string; detail: string; x: number; y: number }[];
      edges?: { from: string; to: string; label?: string }[];
    };
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (enabled !== undefined) patch.enabled = enabled;
    if (name !== undefined) patch.name = name;
    if (triggerSummary !== undefined) patch.triggerSummary = triggerSummary;
    if (nodes !== undefined) patch.nodes = nodes;
    if (edges !== undefined) patch.edges = edges;

    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.update(bots).set(patch)
        .where(and(eq(bots.id, id), eq(bots.orgId, orgId))).returning();
      return r;
    });
    if (!row) return reply.status(404).send({ error: "not found" });
    return row;
  });
}
