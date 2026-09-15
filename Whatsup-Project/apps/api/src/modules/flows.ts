import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { flows, flowResponses, channels, contacts, conversations } from "../db/schema.js";
import { publishFlow, deprecateFlow, compileFlowJson } from "../adapters/meta-flows.js";
import { requireCapability } from "../rbac.js";

export async function flowsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/flows", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) => db.select().from(flows).where(eq(flows.orgId, orgId)).orderBy(desc(flows.updatedAt)));
  });

  app.get("/orgs/:orgId/flows/:id", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.select().from(flows).where(and(eq(flows.orgId, orgId), eq(flows.id, id))).limit(1);
      if (!row) return reply.code(404).send({ error: "not found" });
      const responses = await db.select().from(flowResponses)
        .where(and(eq(flowResponses.orgId, orgId), eq(flowResponses.flowId, id)))
        .orderBy(desc(flowResponses.createdAt)).limit(50);
      // The exact Flow JSON that would be (or was) uploaded to Meta — shown in the UI so
      // an org can see what it is publishing rather than trusting a black box.
      return { ...row, compiled: compileFlowJson(row.screens ?? []), responses };
    });
  });

  app.post("/orgs/:orgId/flows", { preHandler: requireCapability("manage_bots") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as { name?: string; categories?: string[]; screens?: any[]; channelId?: string };
    if (!b?.name?.trim()) return reply.code(400).send({ error: "name is required" });
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.insert(flows).values({
        orgId,
        name: b.name!.trim(),
        categories: b.categories ?? ["OTHER"],
        channelId: b.channelId || null,
        screens: b.screens?.length ? b.screens : [{
          id: "WELCOME",
          title: b.name!.trim(),
          terminal: true,
          ctaLabel: "Submit",
          fields: [{ name: "full_name", label: "Your name", type: "text", required: true }],
        }],
      }).returning();
      return row;
    });
  });

  app.patch("/orgs/:orgId/flows/:id", { preHandler: requireCapability("manage_bots") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const b = req.body as Record<string, any>;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["name", "categories", "screens", "channelId", "status"]) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.update(flows).set(patch)
        .where(and(eq(flows.orgId, orgId), eq(flows.id, id))).returning();
      if (!row) return reply.code(404).send({ error: "not found" });
      return row;
    });
  });

  app.delete("/orgs/:orgId/flows/:id", { preHandler: requireCapability("manage_bots") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(flows).where(and(eq(flows.orgId, orgId), eq(flows.id, id))));
    return { ok: true };
  });

  // Real publish to Meta. Fails honestly (and records publishError) when the channel has
  // no accessToken/wabaId — no simulated "published" state.
  app.post("/orgs/:orgId/flows/:id/publish", { preHandler: requireCapability("manage_bots") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, async (db) => {
      const [flow] = await db.select().from(flows).where(and(eq(flows.orgId, orgId), eq(flows.id, id))).limit(1);
      if (!flow) return reply.code(404).send({ error: "not found" });

      const chanId = flow.channelId ?? (req.body as any)?.channelId;
      const [channel] = chanId
        ? await db.select().from(channels).where(and(eq(channels.orgId, orgId), eq(channels.id, chanId))).limit(1)
        : await db.select().from(channels).where(and(eq(channels.orgId, orgId), eq(channels.provider, "meta"))).limit(1);

      if (!channel) {
        const msg = "No Meta channel to publish this Flow to — connect one in Channels first (Flows are a Meta Cloud API feature).";
        await db.update(flows).set({ publishError: msg, updatedAt: new Date() }).where(eq(flows.id, id));
        return reply.code(400).send({ error: "no_channel", message: msg });
      }

      try {
        const { metaFlowId } = await publishFlow(channel.credentials ?? {}, {
          name: flow.name,
          categories: flow.categories ?? ["OTHER"],
          screens: (flow.screens ?? []) as any,
          existingFlowId: flow.metaFlowId,
        });
        const [row] = await db.update(flows).set({
          metaFlowId, status: "published", publishedAt: new Date(), publishError: null,
          channelId: channel.id, updatedAt: new Date(),
        }).where(eq(flows.id, id)).returning();
        return row;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.update(flows).set({ publishError: message, updatedAt: new Date() }).where(eq(flows.id, id));
        return reply.code(502).send({ error: "publish_failed", message });
      }
    });
  });

  app.post("/orgs/:orgId/flows/:id/deprecate", { preHandler: requireCapability("manage_bots") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, async (db) => {
      const [flow] = await db.select().from(flows).where(and(eq(flows.orgId, orgId), eq(flows.id, id))).limit(1);
      if (!flow?.metaFlowId) return reply.code(400).send({ error: "flow was never published to Meta" });
      const [channel] = await db.select().from(channels).where(eq(channels.id, flow.channelId!)).limit(1);
      try {
        await deprecateFlow(channel?.credentials ?? {}, flow.metaFlowId);
      } catch (err) {
        return reply.code(502).send({ error: "deprecate_failed", message: err instanceof Error ? err.message : String(err) });
      }
      const [row] = await db.update(flows).set({ status: "deprecated", updatedAt: new Date() }).where(eq(flows.id, id)).returning();
      return row;
    });
  });

  // All flow submissions for the org, newest first — the "responses" inbox for Flows.
  app.get("/orgs/:orgId/flow-responses", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select({
        id: flowResponses.id, flowId: flowResponses.flowId, answers: flowResponses.answers,
        createdAt: flowResponses.createdAt, conversationId: flowResponses.conversationId,
        contactName: contacts.name, contactPhone: contacts.phoneE164, flowName: flows.name,
      }).from(flowResponses)
        .leftJoin(contacts, eq(contacts.id, flowResponses.contactId))
        .leftJoin(flows, eq(flows.id, flowResponses.flowId))
        .where(eq(flowResponses.orgId, orgId))
        .orderBy(desc(flowResponses.createdAt)).limit(200)
    );
  });
}
