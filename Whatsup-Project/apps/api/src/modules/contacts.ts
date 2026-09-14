import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { contacts, companies, deals, tasks, conversations } from "../db/schema.js";
import { requireCapability } from "../rbac.js";

export async function contactsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/contacts", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select({
        id: contacts.id, waId: contacts.waId, phoneE164: contacts.phoneE164, name: contacts.name,
        email: contacts.email, jobTitle: contacts.jobTitle, companyId: contacts.companyId,
        companyName: companies.name, ownerId: contacts.ownerId, source: contacts.source,
        tags: contacts.tags, stage: contacts.stage, optIn: contacts.optIn,
        createdAt: contacts.createdAt, lastContactedAt: contacts.lastContactedAt,
      }).from(contacts).leftJoin(companies, eq(contacts.companyId, companies.id))
        .where(eq(contacts.orgId, orgId)).orderBy(desc(contacts.createdAt))
    );
  });

  // CSV export — a real CRM staple (backup, spreadsheet analysis, import into another tool).
  // Registered before the /:id route so "/contacts/export.csv" isn't swallowed as an :id.
  app.get("/orgs/:orgId/contacts/export.csv", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const rows = await withOrgDb(orgId, (db) =>
      db.select({
        name: contacts.name, phoneE164: contacts.phoneE164, email: contacts.email, jobTitle: contacts.jobTitle,
        companyName: companies.name, tags: contacts.tags, stage: contacts.stage, source: contacts.source,
        optIn: contacts.optIn, createdAt: contacts.createdAt,
      }).from(contacts).leftJoin(companies, eq(contacts.companyId, companies.id)).where(eq(contacts.orgId, orgId))
    );
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Name", "Phone", "Email", "Job Title", "Company", "Tags", "Stage", "Source", "Opted In", "Created"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        esc(r.name), esc(r.phoneE164), esc(r.email), esc(r.jobTitle), esc(r.companyName),
        esc((r.tags ?? []).join(";")), esc(r.stage), esc(r.source), esc(r.optIn), esc(r.createdAt?.toISOString()),
      ].join(","));
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="contacts-${orgId}.csv"`);
    return reply.send(lines.join("\n"));
  });

  // CSV import — accepts a simple `rows: [{name,phoneE164,email?,companyName?,tags?,stage?,source?}]`
  // array (parsed client-side; keeping CSV parsing off the wire avoids a server-side CSV-parser
  // dependency for one endpoint). Upserts by (orgId, phoneE164) — re-importing the same file is
  // safe. companyName is resolved-or-created so a spreadsheet full of company names just works.
  app.post("/orgs/:orgId/contacts/import", { preHandler: requireCapability("manage_contacts") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as { rows?: Array<{ name: string; phoneE164: string; email?: string; companyName?: string; tags?: string[]; stage?: string; source?: string }> };
    if (!Array.isArray(body.rows) || body.rows.length === 0) return reply.status(400).send({ error: "rows array required" });
    const result = await withOrgDb(orgId, async (db) => {
      let created = 0, updated = 0, skipped = 0;
      const companyCache = new Map<string, string>();
      for (const row of body.rows!.slice(0, 5000)) {
        const name = row.name?.trim();
        const phone = row.phoneE164?.trim();
        if (!name || !phone) { skipped++; continue; }
        let companyId: string | null = null;
        const companyName = row.companyName?.trim();
        if (companyName) {
          const cacheKey = companyName.toLowerCase();
          if (companyCache.has(cacheKey)) {
            companyId = companyCache.get(cacheKey)!;
          } else {
            const [existing] = await db.select().from(companies).where(and(eq(companies.orgId, orgId), eq(companies.name, companyName)));
            companyId = existing?.id ?? (await db.insert(companies).values({ orgId, name: companyName }).returning())[0].id;
            companyCache.set(cacheKey, companyId);
          }
        }
        const [existingContact] = await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(contacts.phoneE164, phone)));
        if (existingContact) {
          await db.update(contacts).set({
            name, email: row.email || existingContact.email, companyId: companyId ?? existingContact.companyId,
            tags: row.tags ?? existingContact.tags, stage: row.stage ?? existingContact.stage,
            source: row.source ?? existingContact.source,
          }).where(eq(contacts.id, existingContact.id));
          updated++;
        } else {
          await db.insert(contacts).values({
            orgId, name, phoneE164: phone, email: row.email, companyId, tags: row.tags ?? [],
            stage: row.stage ?? "lead", source: row.source,
          });
          created++;
        }
      }
      return { created, updated, skipped };
    });
    return reply.send(result);
  });

  // Full CRM profile view: contact + linked deals + open/closed tasks + recent conversations —
  // one call for the contact-detail page instead of the frontend stitching four requests together.
  app.get("/orgs/:orgId/contacts/:id", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const result = await withOrgDb(orgId, async (db) => {
      const [contact] = await db.select({
        id: contacts.id, waId: contacts.waId, phoneE164: contacts.phoneE164, name: contacts.name,
        email: contacts.email, jobTitle: contacts.jobTitle, companyId: contacts.companyId,
        companyName: companies.name, ownerId: contacts.ownerId, source: contacts.source,
        attributes: contacts.attributes, tags: contacts.tags, stage: contacts.stage, optIn: contacts.optIn,
        createdAt: contacts.createdAt, lastContactedAt: contacts.lastContactedAt,
      }).from(contacts).leftJoin(companies, eq(contacts.companyId, companies.id))
        .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)));
      if (!contact) return null;
      const dealRows = await db.select().from(deals).where(eq(deals.contactId, id)).orderBy(desc(deals.createdAt));
      const taskRows = await db.select().from(tasks).where(eq(tasks.contactId, id)).orderBy(desc(tasks.createdAt));
      const conversationRows = await db.select().from(conversations).where(eq(conversations.contactId, id)).orderBy(desc(conversations.lastMessageAt));
      return { contact, deals: dealRows, tasks: taskRows, conversations: conversationRows };
    });
    if (!result) return reply.status(404).send({ error: "contact not found" });
    return result;
  });

  app.post("/orgs/:orgId/contacts", { preHandler: requireCapability("manage_contacts") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      name: string; phoneE164: string; email?: string; tags?: string[]; stage?: string;
      jobTitle?: string; companyId?: string; source?: string;
    };
    if (!body.name?.trim() || !body.phoneE164?.trim()) {
      return reply.status(400).send({ error: "name and phoneE164 required" });
    }
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(contacts).values({
        orgId, name: body.name.trim(), phoneE164: body.phoneE164.trim(),
        email: body.email, tags: body.tags ?? [], stage: body.stage ?? "lead",
        jobTitle: body.jobTitle, companyId: body.companyId || null, source: body.source,
        ownerId: req.authUser!.userId,
      }).returning();
      return r;
    });
    return reply.status(201).send(row);
  });

  app.patch("/orgs/:orgId/contacts/:id", { preHandler: requireCapability("manage_contacts") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = req.body as Partial<{
      name: string; email: string; jobTitle: string; companyId: string | null; source: string;
      tags: string[]; stage: string; ownerId: string; optIn: boolean;
    }>;
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "email", "jobTitle", "companyId", "source", "tags", "stage", "ownerId", "optIn"] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: "no fields to update" });
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.update(contacts).set(patch)
        .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId))).returning();
      return r;
    });
    if (!row) return reply.status(404).send({ error: "contact not found" });
    return row;
  });

  app.delete("/orgs/:orgId/contacts/:id", { preHandler: requireCapability("manage_contacts") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, orgId))));
    return reply.send({ ok: true });
  });
}
