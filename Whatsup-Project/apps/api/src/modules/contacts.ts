import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { contacts } from "../db/schema.js";

export async function contactsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/contacts", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(contacts).where(eq(contacts.orgId, orgId)).orderBy(desc(contacts.createdAt))
    );
  });

  app.post("/orgs/:orgId/contacts", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as { name: string; phoneE164: string; email?: string; tags?: string[]; stage?: string };
    if (!body.name?.trim() || !body.phoneE164?.trim()) {
      return reply.status(400).send({ error: "name and phoneE164 required" });
    }
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(contacts).values({
        orgId, name: body.name.trim(), phoneE164: body.phoneE164.trim(),
        email: body.email, tags: body.tags ?? [], stage: body.stage ?? "lead",
      }).returning();
      return r;
    });
    return reply.status(201).send(row);
  });

  app.delete("/orgs/:orgId/contacts/:id", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, orgId))));
    return reply.send({ ok: true });
  });
}
