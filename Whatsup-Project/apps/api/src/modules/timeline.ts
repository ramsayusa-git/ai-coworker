import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import {
  contacts, conversations, messages, tasks, deals, tickets, ticketEvents,
  quotes, appointments, surveyResponses, flowResponses, users, conversationNotes,
} from "../db/schema-all.js";

// Timestamps always leave as ISO 8601. String(someDate) produces "Thu Sep 17 2026 …",
// which sorts lexicographically wrong and breaks Date parsing in the browser.
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : new Date(0).toISOString());

export type TimelineEntry = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string | null;
  meta?: Record<string, unknown>;
};

// Office24by7's "360-degree lead view": everything that ever happened with one contact,
// merged into a single chronological stream. Each source is queried independently and
// failures are contained, so one bad join cannot blank the whole timeline.
export async function timelineRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/contacts/:id/timeline", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { limit } = req.query as { limit?: string };
    const cap = Math.min(Number(limit ?? 200), 500);

    return withOrgDb(orgId, async (db) => {
      const [contact] = await db.select().from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.id, id))).limit(1);
      if (!contact) return reply.code(404).send({ error: "contact not found" });

      const convs = await db.select({ id: conversations.id }).from(conversations)
        .where(and(eq(conversations.orgId, orgId), eq(conversations.contactId, id)));
      const convIds = convs.map((c) => c.id);

      const entries: TimelineEntry[] = [];
      const safe = async (fn: () => Promise<void>) => { try { await fn(); } catch { /* one dead source must not empty the stream */ } };

      await safe(async () => {
        if (!convIds.length) return;
        const rows = await db.select().from(messages)
          .where(and(eq(messages.orgId, orgId)))
          .orderBy(desc(messages.createdAt)).limit(cap);
        for (const m of rows.filter((r) => convIds.includes(r.conversationId))) {
          entries.push({
            id: `msg-${m.id}`, at: iso(m.createdAt), kind: m.direction === "in" ? "message_in" : "message_out",
            title: m.direction === "in" ? "Message received" : "Message sent",
            detail: m.body?.slice(0, 200),
            meta: { status: m.status, type: m.msgType, campaignId: m.campaignId },
          });
        }
      });

      await safe(async () => {
        if (!convIds.length) return;
        const rows = await db.select({
          n: conversationNotes, authorName: users.name,
        }).from(conversationNotes)
          .leftJoin(users, eq(users.id, conversationNotes.authorId))
          .where(eq(conversationNotes.orgId, orgId));
        for (const { n, authorName } of rows.filter((r) => convIds.includes(r.n.conversationId))) {
          entries.push({
            id: `note-${n.id}`, at: iso(n.createdAt), kind: "note",
            title: `Internal note${authorName ? ` by ${authorName}` : ""}`, detail: n.body,
          });
        }
      });

      await safe(async () => {
        const rows = await db.select().from(tasks)
          .where(and(eq(tasks.orgId, orgId), eq(tasks.contactId, id)));
        for (const t of rows) {
          entries.push({
            id: `task-${t.id}`, at: iso(t.createdAt), kind: "task",
            title: `Task: ${t.title}`,
            detail: t.status === "done" ? "Completed" : t.dueAt ? `Due ${new Date(t.dueAt).toLocaleString()}` : null,
            meta: { status: t.status, type: t.type },
          });
        }
      });

      await safe(async () => {
        const rows = await db.select().from(deals)
          .where(and(eq(deals.orgId, orgId), eq(deals.contactId, id)));
        for (const d of rows) {
          entries.push({
            id: `deal-${d.id}`, at: iso(d.createdAt), kind: "deal",
            title: `Deal: ${d.title}`,
            detail: `${d.status} · ₹${((d.valuePaise ?? 0) / 100).toLocaleString("en-IN")}`,
            meta: { status: d.status, valuePaise: d.valuePaise },
          });
        }
      });

      await safe(async () => {
        const rows = await db.select().from(tickets)
          .where(and(eq(tickets.orgId, orgId), eq(tickets.contactId, id)));
        for (const t of rows) {
          entries.push({
            id: `ticket-${t.id}`, at: iso(t.createdAt), kind: "ticket",
            title: `Ticket #${t.number}: ${t.subject}`,
            detail: `${t.status} · ${t.priority} priority`,
            meta: { status: t.status, priority: t.priority, number: t.number },
          });
        }
      });

      await safe(async () => {
        const rows = await db.select().from(quotes)
          .where(and(eq(quotes.orgId, orgId), eq(quotes.contactId, id)));
        for (const q of rows) {
          entries.push({
            id: `quote-${q.id}`, at: iso(q.createdAt), kind: "quote",
            title: `Quote #${q.number}: ${q.title}`,
            detail: `${q.status} · ₹${((q.totalPaise ?? 0) / 100).toLocaleString("en-IN")}`,
            meta: { status: q.status, totalPaise: q.totalPaise },
          });
        }
      });

      await safe(async () => {
        const rows = await db.select().from(appointments)
          .where(and(eq(appointments.orgId, orgId), eq(appointments.contactId, id)));
        for (const a of rows) {
          entries.push({
            id: `appt-${a.id}`, at: iso(a.startsAt), kind: "appointment",
            title: `Appointment: ${a.title}`,
            detail: `${a.status} · ${a.durationMinutes} min${a.location ? ` · ${a.location}` : ""}`,
            meta: { status: a.status },
          });
        }
      });

      await safe(async () => {
        const rows = await db.select().from(surveyResponses)
          .where(and(eq(surveyResponses.orgId, orgId), eq(surveyResponses.contactId, id)));
        for (const s of rows) {
          entries.push({
            id: `survey-${s.id}`, at: iso(s.answeredAt ?? s.sentAt), kind: "survey",
            title: s.status === "answered" ? `Survey answered: ${s.score}` : "Survey sent",
            detail: s.comment,
            meta: { score: s.score, status: s.status },
          });
        }
      });

      await safe(async () => {
        const rows = await db.select().from(flowResponses)
          .where(and(eq(flowResponses.orgId, orgId), eq(flowResponses.contactId, id)));
        for (const f of rows) {
          const answers = (f.answers ?? {}) as Record<string, unknown>;
          entries.push({
            id: `flow-${f.id}`, at: iso(f.createdAt), kind: "flow",
            title: "Flow submitted",
            detail: Object.entries(answers).filter(([k]) => k !== "flow_token")
              .map(([k, v]) => `${k}: ${v}`).join(", "),
          });
        }
      });

      entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return {
        contact: { id: contact.id, name: contact.name, phoneE164: contact.phoneE164 },
        counts: entries.reduce<Record<string, number>>((acc, e) => {
          acc[e.kind] = (acc[e.kind] ?? 0) + 1; return acc;
        }, {}),
        entries: entries.slice(0, cap),
      };
    });
  });
}
