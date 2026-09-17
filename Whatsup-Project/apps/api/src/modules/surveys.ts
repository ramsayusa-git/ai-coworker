import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, withOrgDb } from "../db/client.js";
import {
  surveys, surveyResponses, contacts, conversations, tickets, templates,
} from "../db/schema-all.js";
import { requireCapability } from "../rbac.js";
import { sendOnConversation } from "../services/outbound.js";
import { emitEvent } from "../events.js";

// A CSAT reply is a bare number in the 1-5 (or 0-10) range arriving shortly after we
// asked. Anything else is treated as a normal message, so a customer saying "5 boxes
// please" three days later is never recorded as a score.
const ANSWER_WINDOW_MS = 48 * 3600_000;

export function parseScore(body: string, kind: string): number | null {
  const m = body.trim().match(/^(\d{1,2})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const max = kind === "nps" ? 10 : 5;
  const min = kind === "nps" ? 0 : 1;
  return n >= min && n <= max ? n : null;
}

// Called from the inbound webhook pipeline: if this contact has an unanswered survey
// sent recently, and the message reads as a score, record it.
export async function captureSurveyAnswer(orgId: string, contactId: string, conversationId: string, body: string) {
  try {
    const pending = await db.select({
      r: surveyResponses, kind: surveys.kind,
    }).from(surveyResponses)
      .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
      .where(and(
        eq(surveyResponses.orgId, orgId),
        eq(surveyResponses.contactId, contactId),
        eq(surveyResponses.status, "sent"),
      ))
      .orderBy(desc(surveyResponses.sentAt))
      .limit(1);
    if (!pending.length) return false;

    const { r, kind } = pending[0];
    if (Date.now() - new Date(r.sentAt).getTime() > ANSWER_WINDOW_MS) return false;

    const score = parseScore(body, kind);
    if (score === null) return false;

    await db.update(surveyResponses)
      .set({ score, comment: body.trim(), status: "answered", answeredAt: new Date() })
      .where(eq(surveyResponses.id, r.id));

    await emitEvent(orgId, "survey.answered", {
      surveyResponseId: r.id, surveyId: r.surveyId, contactId, conversationId, score,
    });
    return true;
  } catch {
    // Never let survey bookkeeping break message ingestion.
    return false;
  }
}

export async function surveysRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/surveys", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, async (sdb) => {
      const rows = await sdb.select().from(surveys).where(eq(surveys.orgId, orgId)).orderBy(desc(surveys.createdAt));
      // Score summary per survey, computed live rather than cached.
      const stats = await sdb.select({
        surveyId: surveyResponses.surveyId,
        sent: sql<number>`count(*)::int`,
        answered: sql<number>`count(*) filter (where ${surveyResponses.status} = 'answered')::int`,
        avg: sql<number>`coalesce(avg(${surveyResponses.score}) filter (where ${surveyResponses.score} is not null), 0)::float`,
        promoters: sql<number>`count(*) filter (where ${surveyResponses.score} >= 9)::int`,
        detractors: sql<number>`count(*) filter (where ${surveyResponses.score} <= 6 and ${surveyResponses.score} is not null)::int`,
      }).from(surveyResponses).where(eq(surveyResponses.orgId, orgId)).groupBy(surveyResponses.surveyId);
      const byId = new Map(stats.map((s) => [s.surveyId, s]));

      return rows.map((s) => {
        const st = byId.get(s.id);
        const answered = st?.answered ?? 0;
        return {
          ...s,
          sent: st?.sent ?? 0,
          answered,
          responseRate: st?.sent ? Math.round((answered / st.sent) * 100) : 0,
          averageScore: st ? Number(st.avg.toFixed(2)) : null,
          // NPS is promoters minus detractors as a percentage of everyone who answered.
          nps: s.kind === "nps" && answered
            ? Math.round((((st?.promoters ?? 0) - (st?.detractors ?? 0)) / answered) * 100)
            : null,
        };
      });
    });
  });

  app.post("/orgs/:orgId/surveys", { preHandler: requireCapability("manage_surveys") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as Record<string, any>;
    if (!b?.name?.trim() || !b?.question?.trim()) {
      return reply.code(400).send({ error: "name and question are required" });
    }
    return withOrgDb(orgId, async (sdb) => {
      const [row] = await sdb.insert(surveys).values({
        orgId, name: b.name.trim(), question: b.question.trim(),
        kind: b.kind ?? "csat", trigger: b.trigger ?? "none",
        templateId: b.templateId ?? null, channelId: b.channelId ?? null,
        delayMinutes: b.delayMinutes ?? 15, enabled: b.enabled ?? true,
      }).returning();
      return reply.code(201).send(row);
    });
  });

  app.patch("/orgs/:orgId/surveys/:id", { preHandler: requireCapability("manage_surveys") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const b = req.body as Record<string, any>;
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "question", "kind", "trigger", "enabled", "delayMinutes", "templateId", "channelId"]) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    if (!Object.keys(patch).length) return reply.code(400).send({ error: "nothing to update" });
    return withOrgDb(orgId, async (sdb) => {
      const [row] = await sdb.update(surveys).set(patch)
        .where(and(eq(surveys.orgId, orgId), eq(surveys.id, id))).returning();
      if (!row) return reply.code(404).send({ error: "not found" });
      return row;
    });
  });

  app.delete("/orgs/:orgId/surveys/:id", { preHandler: requireCapability("manage_surveys") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (sdb) => sdb.delete(surveys)
      .where(and(eq(surveys.orgId, orgId), eq(surveys.id, id))));
    return { ok: true };
  });

  app.get("/orgs/:orgId/surveys/:id/responses", async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, (sdb) => sdb.select({
      id: surveyResponses.id, score: surveyResponses.score, comment: surveyResponses.comment,
      status: surveyResponses.status, sentAt: surveyResponses.sentAt, answeredAt: surveyResponses.answeredAt,
      contactId: surveyResponses.contactId, contactName: contacts.name,
      conversationId: surveyResponses.conversationId, ticketId: surveyResponses.ticketId,
    }).from(surveyResponses)
      .leftJoin(contacts, eq(contacts.id, surveyResponses.contactId))
      .where(and(eq(surveyResponses.orgId, orgId), eq(surveyResponses.surveyId, id)))
      .orderBy(desc(surveyResponses.sentAt)));
  });

  // Sends a survey to one conversation now. The same path the automatic triggers use,
  // exposed so an agent can ask for feedback deliberately.
  app.post("/orgs/:orgId/surveys/:id/send", { preHandler: requireCapability("manage_surveys") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { conversationId, ticketId } = req.body as { conversationId?: string; ticketId?: string };
    if (!conversationId) return reply.code(400).send({ error: "conversationId is required" });

    const prepared = await withOrgDb(orgId, async (sdb) => {
      const [s] = await sdb.select().from(surveys).where(and(eq(surveys.orgId, orgId), eq(surveys.id, id))).limit(1);
      if (!s) return null;
      const [conv] = await sdb.select().from(conversations)
        .where(and(eq(conversations.orgId, orgId), eq(conversations.id, conversationId))).limit(1);
      if (!conv) return null;
      return { s, contactId: conv.contactId };
    });
    if (!prepared) return reply.code(404).send({ error: "survey or conversation not found" });

    const scale = prepared.s.kind === "nps" ? "0-10" : "1-5";
    const body = `${prepared.s.question}\n\nReply with a number from ${scale}.`;
    const sent = await sendOnConversation({ orgId, conversationId, body });
    if (!sent.ok) return reply.code(sent.code).send({ error: sent.error });

    const saved = await withOrgDb(orgId, async (sdb) => {
      const [row] = await sdb.insert(surveyResponses).values({
        orgId, surveyId: id, contactId: prepared.contactId,
        conversationId, ticketId: ticketId ?? null, status: "sent",
      }).onConflictDoNothing().returning();
      return row;
    });
    // The unique constraint means a survey is asked once per conversation; a repeat
    // request is reported honestly rather than silently sending twice.
    if (!saved) return { ok: true, duplicate: true, message: "This conversation has already been surveyed." };
    return { ok: true, responseId: saved.id };
  });

  // CSAT roll-up for the analytics screen.
  app.get("/orgs/:orgId/csat", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, async (sdb) => {
      // CSAT is out of 5 and NPS is out of 10, so averaging both together produces a
      // meaningless number (and a >100% ring). Each kind is rolled up on its own scale.
      const [row] = await sdb.select({
        sent: sql<number>`count(*)::int`,
        answered: sql<number>`count(*) filter (where ${surveyResponses.status} = 'answered')::int`,
        csatAnswered: sql<number>`count(*) filter (where ${surveys.kind} = 'csat' and ${surveyResponses.score} is not null)::int`,
        csatAvg: sql<number>`coalesce(avg(${surveyResponses.score}) filter (where ${surveys.kind} = 'csat' and ${surveyResponses.score} is not null), 0)::float`,
        npsAnswered: sql<number>`count(*) filter (where ${surveys.kind} = 'nps' and ${surveyResponses.score} is not null)::int`,
        promoters: sql<number>`count(*) filter (where ${surveys.kind} = 'nps' and ${surveyResponses.score} >= 9)::int`,
        detractors: sql<number>`count(*) filter (where ${surveys.kind} = 'nps' and ${surveyResponses.score} <= 6)::int`,
      }).from(surveyResponses)
        .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
        .where(eq(surveyResponses.orgId, orgId));

      const csatAnswered = row?.csatAnswered ?? 0;
      const npsAnswered = row?.npsAnswered ?? 0;
      return {
        sent: row?.sent ?? 0,
        answered: row?.answered ?? 0,
        responseRate: row?.sent ? Math.round((row.answered / row.sent) * 100) : 0,
        // Out of 5, over CSAT responses only.
        averageScore: csatAnswered ? Number(row.csatAvg.toFixed(2)) : 0,
        csatAnswered,
        // Standard NPS: % promoters − % detractors, in the range −100..100.
        nps: npsAnswered
          ? Math.round(((row.promoters - row.detractors) / npsAnswered) * 100)
          : null,
        npsAnswered,
      };
    });
  });
}
