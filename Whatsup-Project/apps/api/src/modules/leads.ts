import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import {
  leadScoringRules, distributionRules, contacts, deals, messages, conversations,
  teamMembers, users,
} from "../db/schema-all.js";
import { requireCapability } from "../rbac.js";

// Scoring is computed on demand from the rules rather than stored on the contact and
// kept in sync by triggers: a rule change then takes effect immediately for everyone,
// instead of leaving stale scores behind until something recalculates them.
export async function scoreContacts(db: any, orgId: string, contactIds?: string[]) {
  const rules = await db.select().from(leadScoringRules)
    .where(and(eq(leadScoringRules.orgId, orgId), eq(leadScoringRules.enabled, true)));
  if (!rules.length) return new Map<string, { score: number; reasons: string[] }>();

  const rows = contactIds?.length
    ? await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), inArray(contacts.id, contactIds)))
    : await db.select().from(contacts).where(eq(contacts.orgId, orgId));

  const ids = rows.map((c: any) => c.id);
  const needDeals = rules.some((r: any) => ["has_open_deal", "deal_value_over"].includes(r.criterion));
  const needReplies = rules.some((r: any) => r.criterion === "replied_within_days");

  const dealRows = needDeals && ids.length
    ? await db.select({ contactId: deals.contactId, status: deals.status, valuePaise: deals.valuePaise })
        .from(deals).where(and(eq(deals.orgId, orgId), inArray(deals.contactId, ids)))
    : [];

  // Last inbound message per contact, for the "replied recently" rule.
  const replyRows = needReplies && ids.length
    ? await db.select({
        contactId: conversations.contactId,
        last: sql<string>`max(${messages.createdAt})`,
      }).from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(and(eq(messages.orgId, orgId), eq(messages.direction, "in"), inArray(conversations.contactId, ids)))
        .groupBy(conversations.contactId)
    : [];
  const lastReply = new Map<string, number>(
    replyRows.map((r: any) => [r.contactId as string, r.last ? new Date(r.last).getTime() : 0])
  );

  const out = new Map<string, { score: number; reasons: string[] }>();
  for (const c of rows) {
    let score = 0;
    const reasons: string[] = [];
    const mine = dealRows.filter((d: any) => d.contactId === c.id);

    for (const r of rules) {
      let hit = false;
      if (r.criterion === "has_tag") hit = (c.tags ?? []).includes(r.value);
      else if (r.criterion === "source_is") hit = (c.source ?? "") === r.value;
      else if (r.criterion === "stage_is") hit = (c.stage ?? "") === r.value;
      else if (r.criterion === "has_open_deal") hit = mine.some((d: any) => d.status === "open");
      else if (r.criterion === "deal_value_over") hit = mine.some((d: any) => (d.valuePaise ?? 0) > Number(r.value ?? 0));
      else if (r.criterion === "replied_within_days") {
        const days = Number(r.value ?? 7);
        const ts = lastReply.get(c.id) ?? 0;
        hit = ts > 0 && Date.now() - ts < days * 86400_000;
      }
      if (hit) { score += r.points; reasons.push(`${r.name} (+${r.points})`); }
    }
    out.set(c.id, { score, reasons });
  }
  return out;
}

export async function leadsRoutes(app: FastifyInstance) {
  // --- scoring rules -------------------------------------------------------
  app.get("/orgs/:orgId/lead-scoring-rules", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) => db.select().from(leadScoringRules)
      .where(eq(leadScoringRules.orgId, orgId)).orderBy(desc(leadScoringRules.points)));
  });

  app.post("/orgs/:orgId/lead-scoring-rules", { preHandler: requireCapability("manage_settings") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as Record<string, any>;
    if (!b?.name?.trim() || !b?.criterion) return reply.code(400).send({ error: "name and criterion are required" });
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.insert(leadScoringRules).values({
        orgId, name: b.name.trim(), criterion: b.criterion,
        value: b.value ?? null, points: b.points ?? 10, enabled: b.enabled ?? true,
      }).returning();
      return reply.code(201).send(row);
    });
  });

  app.delete("/orgs/:orgId/lead-scoring-rules/:id", { preHandler: requireCapability("manage_settings") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(leadScoringRules)
      .where(and(eq(leadScoringRules.orgId, orgId), eq(leadScoringRules.id, id))));
    return { ok: true };
  });

  // Scored leads, hottest first — the "who do I call today" list.
  app.get("/orgs/:orgId/leads/scored", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, async (db) => {
      const scores = await scoreContacts(db, orgId);
      const rows = await db.select({
        id: contacts.id, name: contacts.name, phoneE164: contacts.phoneE164,
        email: contacts.email, tags: contacts.tags, stage: contacts.stage,
        source: contacts.source, ownerId: contacts.ownerId, ownerName: users.name,
      }).from(contacts)
        .leftJoin(users, eq(users.id, contacts.ownerId))
        .where(eq(contacts.orgId, orgId));

      return rows
        .map((c) => ({ ...c, score: scores.get(c.id)?.score ?? 0, scoreReasons: scores.get(c.id)?.reasons ?? [] }))
        .sort((a, b) => b.score - a.score);
    });
  });

  // Where leads come from, and how they are converting — Office24by7's "source analytics".
  app.get("/orgs/:orgId/leads/sources", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, async (db) => {
      const rows = await db.select({
        source: sql<string>`coalesce(${contacts.source}, 'unknown')`,
        total: sql<number>`count(*)::int`,
        customers: sql<number>`count(*) filter (where ${contacts.stage} = 'customer')::int`,
      }).from(contacts)
        .where(eq(contacts.orgId, orgId))
        .groupBy(sql`coalesce(${contacts.source}, 'unknown')`);
      return rows.map((r) => ({
        ...r,
        conversionRate: r.total ? Math.round((r.customers / r.total) * 100) : 0,
      })).sort((a, b) => b.total - a.total);
    });
  });

  // --- distribution --------------------------------------------------------
  app.get("/orgs/:orgId/distribution-rules", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) => db.select().from(distributionRules)
      .where(eq(distributionRules.orgId, orgId)).orderBy(asc(distributionRules.position)));
  });

  app.post("/orgs/:orgId/distribution-rules", { preHandler: requireCapability("manage_settings") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as Record<string, any>;
    if (!b?.name?.trim()) return reply.code(400).send({ error: "name is required" });
    if (!b.targetTeamId && !(b.targetUserIds ?? []).length) {
      return reply.code(400).send({ error: "pick a team or at least one agent to distribute to" });
    }
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.insert(distributionRules).values({
        orgId, name: b.name.trim(), strategy: b.strategy ?? "round_robin",
        conditions: b.conditions ?? [], targetUserIds: b.targetUserIds ?? [],
        targetTeamId: b.targetTeamId ?? null, position: b.position ?? 0, enabled: b.enabled ?? true,
      }).returning();
      return reply.code(201).send(row);
    });
  });

  app.delete("/orgs/:orgId/distribution-rules/:id", { preHandler: requireCapability("manage_settings") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(distributionRules)
      .where(and(eq(distributionRules.orgId, orgId), eq(distributionRules.id, id))));
    return { ok: true };
  });

  // Assigns owners to unowned leads using the first matching rule. Returns what it did
  // rather than silently reshuffling the database.
  app.post("/orgs/:orgId/leads/distribute", { preHandler: requireCapability("manage_contacts") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const { contactIds, dryRun } = req.body as { contactIds?: string[]; dryRun?: boolean };

    return withOrgDb(orgId, async (db) => {
      const rules = await db.select().from(distributionRules)
        .where(and(eq(distributionRules.orgId, orgId), eq(distributionRules.enabled, true)))
        .orderBy(asc(distributionRules.position));
      if (!rules.length) return reply.code(400).send({ error: "No distribution rules are configured." });

      const targets = contactIds?.length
        ? await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), inArray(contacts.id, contactIds)))
        : await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), sql`${contacts.ownerId} is null`));

      // Current open-deal load per user, for the least-loaded strategy.
      const loads = await db.select({ ownerId: contacts.ownerId, n: sql<number>`count(*)::int` })
        .from(contacts).where(eq(contacts.orgId, orgId)).groupBy(contacts.ownerId);
      const loadBy = new Map<string, number>(loads.filter((l: any) => l.ownerId).map((l: any) => [l.ownerId, Number(l.n)]));

      const assignments: Array<{ contactId: string; contactName: string; userId: string; rule: string }> = [];
      const cursors = new Map<string, number>();

      for (const c of targets) {
        const rule = rules.find((r: any) => (r.conditions ?? []).every((cond: any) => {
          const actual = cond.field === "tag"
            ? (c.tags ?? []).join(",").toLowerCase()
            : String((c as any)[cond.field] ?? "").toLowerCase();
          const want = String(cond.value ?? "").toLowerCase();
          return cond.op === "contains" ? actual.includes(want) : actual === want;
        }));
        if (!rule) continue;

        let candidates: string[] = rule.targetUserIds ?? [];
        if (rule.targetTeamId) {
          const members = await db.select({ userId: teamMembers.userId }).from(teamMembers)
            .where(and(eq(teamMembers.orgId, orgId), eq(teamMembers.teamId, rule.targetTeamId)));
          candidates = members.map((m: any) => m.userId);
        }
        if (!candidates.length) continue;

        let userId: string;
        if (rule.strategy === "least_loaded") {
          userId = candidates.slice().sort((a, b) => (loadBy.get(a) ?? 0) - (loadBy.get(b) ?? 0))[0];
        } else if (rule.strategy === "fixed") {
          userId = candidates[0];
        } else {
          const start = cursors.get(rule.id) ?? rule.cursor ?? 0;
          userId = candidates[start % candidates.length];
          cursors.set(rule.id, start + 1);
        }

        loadBy.set(userId, (loadBy.get(userId) ?? 0) + 1);
        assignments.push({ contactId: c.id, contactName: c.name, userId, rule: rule.name });
      }

      if (!dryRun) {
        for (const a of assignments) {
          await db.update(contacts).set({ ownerId: a.userId }).where(eq(contacts.id, a.contactId));
        }
        // Persist where round-robin got to, so the next run continues rather than restarting.
        for (const [ruleId, cursor] of cursors) {
          await db.update(distributionRules).set({ cursor }).where(eq(distributionRules.id, ruleId));
        }
      }

      return { assigned: assignments.length, considered: targets.length, dryRun: !!dryRun, assignments };
    });
  });
}
