import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import {
  quotes, quoteItems, appointments, surveys, surveyResponses,
  contacts, users, deals, templates,
} from "../db/schema-all.js";
import { requireCapability } from "../rbac.js";
import { sendOnConversation, resolveConversationForPhone } from "../services/outbound.js";
import { emitEvent } from "../events.js";

// Totals are always recomputed from the line items, never trusted from the client —
// a quote that displays one number and totals another is worse than no quote.
function recomputeTotals(items: Array<{ quantity: number; unitPricePaise: number }>, taxPercent: number, discountPaise: number) {
  const subtotalPaise = items.reduce((s, i) => s + (i.quantity || 0) * (i.unitPricePaise || 0), 0);
  const taxable = Math.max(0, subtotalPaise - (discountPaise || 0));
  const taxPaise = Math.round((taxable * (taxPercent || 0)) / 100);
  return { subtotalPaise, taxPaise, totalPaise: taxable + taxPaise };
}

export async function quotesRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/quotes", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) => db.select({
      id: quotes.id, number: quotes.number, title: quotes.title, status: quotes.status,
      currency: quotes.currency, subtotalPaise: quotes.subtotalPaise, taxPercent: quotes.taxPercent,
      taxPaise: quotes.taxPaise, discountPaise: quotes.discountPaise, totalPaise: quotes.totalPaise,
      validUntil: quotes.validUntil, sentAt: quotes.sentAt, acceptedAt: quotes.acceptedAt,
      contactId: quotes.contactId, contactName: contacts.name, dealId: quotes.dealId,
      createdAt: quotes.createdAt,
    }).from(quotes)
      .leftJoin(contacts, eq(contacts.id, quotes.contactId))
      .where(eq(quotes.orgId, orgId)).orderBy(desc(quotes.createdAt)));
  });

  app.get("/orgs/:orgId/quotes/:id", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, async (db) => {
      const [q] = await db.select().from(quotes).where(and(eq(quotes.orgId, orgId), eq(quotes.id, id))).limit(1);
      if (!q) return reply.code(404).send({ error: "not found" });
      const items = await db.select().from(quoteItems)
        .where(and(eq(quoteItems.orgId, orgId), eq(quoteItems.quoteId, id))).orderBy(asc(quoteItems.position));
      return { ...q, items };
    });
  });

  app.post("/orgs/:orgId/quotes", { preHandler: requireCapability("manage_quotes") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as Record<string, any>;
    if (!b?.title?.trim()) return reply.code(400).send({ error: "title is required" });
    const items = (b.items ?? []) as Array<{ description: string; quantity: number; unitPricePaise: number }>;

    return withOrgDb(orgId, async (db) => {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${quotes.number}), 0)::int` })
        .from(quotes).where(eq(quotes.orgId, orgId));
      const totals = recomputeTotals(items, b.taxPercent ?? 0, b.discountPaise ?? 0);

      const [q] = await db.insert(quotes).values({
        orgId, number: max + 1, title: b.title.trim(),
        contactId: b.contactId ?? null, dealId: b.dealId ?? null,
        currency: b.currency ?? "INR", taxPercent: b.taxPercent ?? 0,
        discountPaise: b.discountPaise ?? 0, notes: b.notes ?? null,
        validUntil: b.validUntil ? new Date(b.validUntil) : null,
        createdBy: (req as any).authUser?.userId ?? null,
        ...totals,
      }).returning();

      if (items.length) {
        await db.insert(quoteItems).values(items.map((it, i) => ({
          orgId, quoteId: q.id, description: it.description,
          quantity: it.quantity ?? 1, unitPricePaise: it.unitPricePaise ?? 0, position: i,
        })));
      }
      return reply.code(201).send(q);
    });
  });

  app.patch("/orgs/:orgId/quotes/:id", { preHandler: requireCapability("manage_quotes") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const b = req.body as Record<string, any>;
    return withOrgDb(orgId, async (db) => {
      const [current] = await db.select().from(quotes).where(and(eq(quotes.orgId, orgId), eq(quotes.id, id))).limit(1);
      if (!current) return reply.code(404).send({ error: "not found" });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of ["title", "status", "notes", "taxPercent", "discountPaise", "contactId", "dealId"]) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      if (b.validUntil !== undefined) patch.validUntil = b.validUntil ? new Date(b.validUntil) : null;
      if (b.status === "accepted" && current.status !== "accepted") patch.acceptedAt = new Date();

      // Replacing line items re-totals the quote in the same transaction.
      if (Array.isArray(b.items)) {
        await db.delete(quoteItems).where(and(eq(quoteItems.orgId, orgId), eq(quoteItems.quoteId, id)));
        if (b.items.length) {
          await db.insert(quoteItems).values(b.items.map((it: any, i: number) => ({
            orgId, quoteId: id, description: it.description,
            quantity: it.quantity ?? 1, unitPricePaise: it.unitPricePaise ?? 0, position: i,
          })));
        }
        Object.assign(patch, recomputeTotals(
          b.items, (patch.taxPercent ?? current.taxPercent) as number, (patch.discountPaise ?? current.discountPaise) as number,
        ));
      }

      const [row] = await db.update(quotes).set(patch)
        .where(and(eq(quotes.orgId, orgId), eq(quotes.id, id))).returning();
      return row;
    });
  });

  app.delete("/orgs/:orgId/quotes/:id", { preHandler: requireCapability("manage_quotes") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(quotes).where(and(eq(quotes.orgId, orgId), eq(quotes.id, id))));
    return { ok: true };
  });

  // Sends the quote summary to the contact over WhatsApp through the normal outbound
  // path, so it is metered and logged like any other message.
  app.post("/orgs/:orgId/quotes/:id/send", { preHandler: requireCapability("manage_quotes") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const quote = await withOrgDb(orgId, async (db) => {
      const [q] = await db.select().from(quotes).where(and(eq(quotes.orgId, orgId), eq(quotes.id, id))).limit(1);
      if (!q) return null;
      const items = await db.select().from(quoteItems)
        .where(and(eq(quoteItems.orgId, orgId), eq(quoteItems.quoteId, id))).orderBy(asc(quoteItems.position));
      const [c] = q.contactId
        ? await db.select().from(contacts).where(eq(contacts.id, q.contactId)).limit(1)
        : [null];
      return { q, items, contact: c };
    });

    if (!quote) return reply.code(404).send({ error: "not found" });
    if (!quote.contact) return reply.code(400).send({ error: "This quote has no contact to send to." });

    const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
    const lines = quote.items.map((i: any) => `• ${i.description} × ${i.quantity} — ${rupees(i.quantity * i.unitPricePaise)}`);
    const body = [
      `Quote #${quote.q.number}: ${quote.q.title}`, "", ...lines, "",
      `Subtotal: ${rupees(quote.q.subtotalPaise)}`,
      quote.q.discountPaise ? `Discount: -${rupees(quote.q.discountPaise)}` : null,
      quote.q.taxPercent ? `Tax (${quote.q.taxPercent}%): ${rupees(quote.q.taxPaise)}` : null,
      `Total: ${rupees(quote.q.totalPaise)}`,
      quote.q.validUntil ? `Valid until ${new Date(quote.q.validUntil).toLocaleDateString()}` : null,
    ].filter(Boolean).join("\n");

    const conv = await resolveConversationForPhone(orgId, quote.contact.phoneE164);
    if ("error" in conv) return reply.code(400).send({ error: conv.error });
    const sent = await sendOnConversation({ orgId, conversationId: conv.conversationId, body });
    if (!sent.ok) return reply.code(sent.code).send({ error: sent.error });

    await withOrgDb(orgId, (db) => db.update(quotes)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(quotes.orgId, orgId), eq(quotes.id, id))));
    return { ok: true, messageId: sent.message.id, status: sent.message.status };
  });
}

export async function appointmentsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/appointments", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) => db.select({
      id: appointments.id, title: appointments.title, startsAt: appointments.startsAt,
      durationMinutes: appointments.durationMinutes, location: appointments.location,
      status: appointments.status, notes: appointments.notes,
      contactId: appointments.contactId, contactName: contacts.name, contactPhone: contacts.phoneE164,
      assigneeId: appointments.assigneeId, assigneeName: users.name,
      dealId: appointments.dealId,
      reminderMinutesBefore: appointments.reminderMinutesBefore,
      reminderSentAt: appointments.reminderSentAt, reminderTemplateId: appointments.reminderTemplateId,
    }).from(appointments)
      .leftJoin(contacts, eq(contacts.id, appointments.contactId))
      .leftJoin(users, eq(users.id, appointments.assigneeId))
      .where(eq(appointments.orgId, orgId)).orderBy(asc(appointments.startsAt)));
  });

  app.post("/orgs/:orgId/appointments", { preHandler: requireCapability("manage_appointments") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as Record<string, any>;
    if (!b?.title?.trim() || !b?.startsAt) return reply.code(400).send({ error: "title and startsAt are required" });
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.insert(appointments).values({
        orgId, title: b.title.trim(), startsAt: new Date(b.startsAt),
        durationMinutes: b.durationMinutes ?? 30, location: b.location ?? null,
        notes: b.notes ?? null, contactId: b.contactId ?? null, dealId: b.dealId ?? null,
        assigneeId: b.assigneeId ?? null, status: b.status ?? "scheduled",
        reminderTemplateId: b.reminderTemplateId ?? null,
        reminderMinutesBefore: b.reminderMinutesBefore ?? 60,
      }).returning();
      return reply.code(201).send(row);
    });
  });

  app.patch("/orgs/:orgId/appointments/:id", { preHandler: requireCapability("manage_appointments") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const b = req.body as Record<string, any>;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["title", "status", "location", "notes", "durationMinutes", "assigneeId", "contactId", "reminderMinutesBefore"]) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    if (b.startsAt) patch.startsAt = new Date(b.startsAt);
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.update(appointments).set(patch)
        .where(and(eq(appointments.orgId, orgId), eq(appointments.id, id))).returning();
      if (!row) return reply.code(404).send({ error: "not found" });
      return row;
    });
  });

  app.delete("/orgs/:orgId/appointments/:id", { preHandler: requireCapability("manage_appointments") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(appointments)
      .where(and(eq(appointments.orgId, orgId), eq(appointments.id, id))));
    return { ok: true };
  });
}
