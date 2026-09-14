import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { companies, contacts, deals } from "../db/schema.js";
import { requireCapability } from "../rbac.js";

// CRM Companies/Accounts — the B2B roll-up entity above individual contacts. Every route is
// org-scoped through withOrgDb the same way contacts.ts is; list responses include a live
// contactCount/openDealCount so the Companies table doesn't need N+1 requests from the frontend.
export async function companiesRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/companies", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select({
        id: companies.id, name: companies.name, domain: companies.domain, industry: companies.industry,
        phone: companies.phone, address: companies.address, notes: companies.notes,
        ownerId: companies.ownerId, createdAt: companies.createdAt,
        contactCount: sql<number>`(select count(*) from ${contacts} where ${contacts.companyId} = ${companies.id})`,
        openDealCount: sql<number>`(select count(*) from ${deals} where ${deals.contactId} in
          (select id from ${contacts} where ${contacts.companyId} = ${companies.id}) and ${deals.status} = 'open')`,
      }).from(companies).where(eq(companies.orgId, orgId)).orderBy(desc(companies.createdAt))
    );
  });

  app.get("/orgs/:orgId/companies/:id", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const result = await withOrgDb(orgId, async (db) => {
      const [company] = await db.select().from(companies).where(and(eq(companies.id, id), eq(companies.orgId, orgId)));
      if (!company) return null;
      const contactRows = await db.select().from(contacts).where(eq(contacts.companyId, id));
      return { company, contacts: contactRows };
    });
    if (!result) return reply.status(404).send({ error: "company not found" });
    return result;
  });

  app.post("/orgs/:orgId/companies", { preHandler: requireCapability("manage_companies") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as { name: string; domain?: string; industry?: string; phone?: string; address?: string; notes?: string };
    if (!body.name?.trim()) return reply.status(400).send({ error: "name required" });
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(companies).values({
        orgId, name: body.name.trim(), domain: body.domain?.trim() || null, industry: body.industry?.trim() || null,
        phone: body.phone?.trim() || null, address: body.address?.trim() || null, notes: body.notes?.trim() || null,
        ownerId: req.authUser!.userId,
      }).returning();
      return r;
    });
    return reply.status(201).send(row);
  });

  app.patch("/orgs/:orgId/companies/:id", { preHandler: requireCapability("manage_companies") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = req.body as Partial<{ name: string; domain: string; industry: string; phone: string; address: string; notes: string }>;
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "domain", "industry", "phone", "address", "notes"] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.update(companies).set(patch).where(and(eq(companies.id, id), eq(companies.orgId, orgId))).returning();
      return r;
    });
    if (!row) return reply.status(404).send({ error: "company not found" });
    return row;
  });

  app.delete("/orgs/:orgId/companies/:id", { preHandler: requireCapability("manage_companies") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    // Detach contacts rather than cascade-delete them — a company going away shouldn't take
    // its people's WhatsApp history with it.
    await withOrgDb(orgId, async (db) => {
      await db.update(contacts).set({ companyId: null }).where(eq(contacts.companyId, id));
      await db.delete(companies).where(and(eq(companies.id, id), eq(companies.orgId, orgId)));
    });
    return reply.send({ ok: true });
  });
}
