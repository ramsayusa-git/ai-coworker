import type { FastifyInstance } from "fastify";
import { and, asc, eq, lte } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { tasks, contacts, deals, users } from "../db/schema.js";
import { requireCapability } from "../rbac.js";

// CRM follow-up/reminder tasks — closes the "I'll follow up next week" gap: nothing in this
// app previously tracked a commitment to act on a contact/deal at a future time. Every route
// org-scoped via withOrgDb like the other CRM modules.
export async function tasksRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/tasks", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const { status, mine, dueBefore } = req.query as { status?: string; mine?: string; dueBefore?: string };
    return withOrgDb(orgId, (db) => {
      const conditions = [eq(tasks.orgId, orgId)];
      if (status) conditions.push(eq(tasks.status, status as "open" | "done"));
      if (mine === "1") conditions.push(eq(tasks.assigneeId, req.authUser!.userId));
      if (dueBefore) conditions.push(lte(tasks.dueAt, new Date(dueBefore)));
      return db.select({
        id: tasks.id, title: tasks.title, description: tasks.description, type: tasks.type,
        status: tasks.status, dueAt: tasks.dueAt, contactId: tasks.contactId, dealId: tasks.dealId,
        assigneeId: tasks.assigneeId, createdBy: tasks.createdBy, completedAt: tasks.completedAt, createdAt: tasks.createdAt,
        contactName: contacts.name, dealTitle: deals.title, assigneeName: users.name,
      }).from(tasks)
        .leftJoin(contacts, eq(tasks.contactId, contacts.id))
        .leftJoin(deals, eq(tasks.dealId, deals.id))
        .leftJoin(users, eq(tasks.assigneeId, users.id))
        .where(and(...conditions)).orderBy(asc(tasks.dueAt));
    });
  });

  app.post("/orgs/:orgId/tasks", { preHandler: requireCapability("manage_tasks") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      title: string; description?: string; type?: string; dueAt?: string;
      contactId?: string; dealId?: string; assigneeId?: string;
    };
    if (!body.title?.trim()) return reply.status(400).send({ error: "title required" });
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(tasks).values({
        orgId, title: body.title.trim(), description: body.description?.trim() || null,
        type: (body.type as "call" | "whatsapp" | "meeting" | "follow_up" | "other") ?? "follow_up",
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        contactId: body.contactId || null, dealId: body.dealId || null,
        assigneeId: body.assigneeId || req.authUser!.userId, createdBy: req.authUser!.userId,
      }).returning();
      return r;
    });
    return reply.status(201).send(row);
  });

  app.patch("/orgs/:orgId/tasks/:id", { preHandler: requireCapability("manage_tasks") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = req.body as Partial<{
      title: string; description: string; type: string; status: string; dueAt: string | null; assigneeId: string;
    }>;
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.type !== undefined) patch.type = body.type;
    if (body.assigneeId !== undefined) patch.assigneeId = body.assigneeId;
    if (body.dueAt !== undefined) patch.dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (body.status !== undefined) {
      patch.status = body.status;
      patch.completedAt = body.status === "done" ? new Date() : null;
    }
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.update(tasks).set(patch).where(and(eq(tasks.id, id), eq(tasks.orgId, orgId))).returning();
      return r;
    });
    if (!row) return reply.status(404).send({ error: "task not found" });
    return row;
  });

  app.delete("/orgs/:orgId/tasks/:id", { preHandler: requireCapability("manage_tasks") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.orgId, orgId))));
    return reply.send({ ok: true });
  });
}
