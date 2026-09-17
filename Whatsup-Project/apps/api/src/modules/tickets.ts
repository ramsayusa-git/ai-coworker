import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { tickets, ticketEvents, ticketRules, contacts, users, teams, teamMembers } from "../db/schema-all.js";
import { requireCapability } from "../rbac.js";
import { emitEvent } from "../events.js";

// SLA targets by priority, in hours to first response. Fixed for now — a per-org SLA
// policy table is the obvious next step, but inventing one nobody configured would be
// worse than a documented default.
const SLA_HOURS: Record<string, number> = { urgent: 2, high: 4, normal: 24, low: 72 };

function matches(conds: Array<{ field: string; op: string; value: string }>, t: Record<string, any>) {
  return conds.every((c) => {
    const actual = String(t[c.field] ?? "").toLowerCase();
    const want = String(c.value ?? "").toLowerCase();
    return c.op === "contains" ? actual.includes(want) : actual === want;
  });
}

// Runs the org's routing rules in order against a freshly created ticket. The first
// rule of each action type wins, so a "set priority" rule and an "assign" rule can both
// apply but two conflicting assignments cannot.
async function applyRules(db: any, orgId: string, ticket: any) {
  const rules = await db.select().from(ticketRules)
    .where(and(eq(ticketRules.orgId, orgId), eq(ticketRules.enabled, true)))
    .orderBy(asc(ticketRules.position));

  const patch: Record<string, unknown> = {};
  const applied: string[] = [];

  for (const rule of rules) {
    if (!matches(rule.conditions ?? [], { ...ticket, ...patch })) continue;
    const cfg = (rule.actionConfig ?? {}) as Record<string, any>;

    if (rule.action === "set_priority" && !patch.priority) {
      patch.priority = cfg.priority; applied.push(rule.name);
    } else if (rule.action === "set_category" && !patch.category) {
      patch.category = cfg.category; applied.push(rule.name);
    } else if (rule.action === "assign_team" && !patch.assignedTeamId && !patch.assigneeId) {
      patch.assignedTeamId = cfg.teamId; applied.push(rule.name);
    } else if (rule.action === "assign_agent" && !patch.assigneeId && !patch.assignedTeamId) {
      patch.assigneeId = cfg.userId; applied.push(rule.name);
    } else if (rule.action === "round_robin" && !patch.assigneeId && !patch.assignedTeamId) {
      // Round-robin across a team's members, ordered by who has the fewest open
      // tickets — "least loaded" is what people actually mean by round-robin here.
      const members = cfg.teamId
        ? await db.select({ userId: teamMembers.userId }).from(teamMembers)
            .where(and(eq(teamMembers.orgId, orgId), eq(teamMembers.teamId, cfg.teamId)))
        : [];
      if (members.length) {
        const loads = await db.select({
          assigneeId: tickets.assigneeId, n: sql<number>`count(*)::int`,
        }).from(tickets)
          .where(and(eq(tickets.orgId, orgId), sql`${tickets.status} in ('open','pending','on_hold')`))
          .groupBy(tickets.assigneeId);
        const loadBy = new Map(loads.map((l: any) => [l.assigneeId, l.n]));
        const pick = members
          .map((m: any) => ({ id: m.userId, n: Number(loadBy.get(m.userId) ?? 0) }))
          .sort((a: any, b: any) => a.n - b.n)[0];
        patch.assigneeId = pick.id;
        applied.push(rule.name);
      }
    }
  }
  return { patch, applied };
}

export async function ticketsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/tickets", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const { status, assigneeId, priority } = req.query as Record<string, string | undefined>;
    return withOrgDb(orgId, async (db) => {
      const rows = await db.select({
        id: tickets.id, number: tickets.number, subject: tickets.subject, priority: tickets.priority,
        category: tickets.category, status: tickets.status, source: tickets.source, tags: tickets.tags,
        contactId: tickets.contactId, contactName: contacts.name, contactPhone: contacts.phoneE164,
        conversationId: tickets.conversationId,
        assigneeId: tickets.assigneeId, assigneeName: users.name,
        assignedTeamId: tickets.assignedTeamId, teamName: teams.name,
        slaDueAt: tickets.slaDueAt, firstResponseAt: tickets.firstResponseAt,
        resolvedAt: tickets.resolvedAt, mergedIntoId: tickets.mergedIntoId,
        createdAt: tickets.createdAt, updatedAt: tickets.updatedAt,
      }).from(tickets)
        .leftJoin(contacts, eq(contacts.id, tickets.contactId))
        .leftJoin(users, eq(users.id, tickets.assigneeId))
        .leftJoin(teams, eq(teams.id, tickets.assignedTeamId))
        .where(eq(tickets.orgId, orgId))
        .orderBy(desc(tickets.createdAt));

      const now = Date.now();
      return rows
        .filter((t) => (!status || t.status === status) && (!assigneeId || t.assigneeId === assigneeId) && (!priority || t.priority === priority))
        // An SLA is only breached while the ticket is still waiting for its first reply.
        .map((t) => ({
          ...t,
          slaBreached: Boolean(t.slaDueAt && !t.firstResponseAt && new Date(t.slaDueAt).getTime() < now
            && !["resolved", "closed"].includes(t.status ?? "")),
        }));
    });
  });

  app.get("/orgs/:orgId/tickets/:id", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, async (db) => {
      const [t] = await db.select().from(tickets)
        .where(and(eq(tickets.orgId, orgId), eq(tickets.id, id))).limit(1);
      if (!t) return reply.code(404).send({ error: "not found" });
      const events = await db.select({
        id: ticketEvents.id, kind: ticketEvents.kind, body: ticketEvents.body,
        meta: ticketEvents.meta, createdAt: ticketEvents.createdAt,
        actorId: ticketEvents.actorId, actorName: users.name,
      }).from(ticketEvents)
        .leftJoin(users, eq(users.id, ticketEvents.actorId))
        .where(and(eq(ticketEvents.orgId, orgId), eq(ticketEvents.ticketId, id)))
        .orderBy(asc(ticketEvents.createdAt));
      return { ...t, events };
    });
  });

  app.post("/orgs/:orgId/tickets", { preHandler: requireCapability("manage_tickets") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as Record<string, any>;
    if (!b?.subject?.trim()) return reply.code(400).send({ error: "subject is required" });

    const created = await withOrgDb(orgId, async (db) => {
      // Per-org ticket numbers: customers quote "#42", so the sequence has to be scoped
      // to the org rather than being a global sequence or a UUID.
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${tickets.number}), 0)::int` })
        .from(tickets).where(eq(tickets.orgId, orgId));

      const draft = {
        orgId, number: max + 1, subject: b.subject.trim(), body: b.body ?? null,
        priority: b.priority ?? "normal", category: b.category ?? null,
        source: b.source ?? "whatsapp", tags: b.tags ?? [],
        contactId: b.contactId ?? null, conversationId: b.conversationId ?? null,
        assigneeId: b.assigneeId ?? null, assignedTeamId: b.assignedTeamId ?? null,
        createdBy: (req as any).authUser?.userId ?? null,
      };

      const { patch, applied } = await applyRules(db, orgId, draft);
      const merged = { ...draft, ...patch };
      const hours = SLA_HOURS[String(merged.priority)] ?? 24;
      const [row] = await db.insert(tickets).values({
        ...merged, slaDueAt: new Date(Date.now() + hours * 3600_000),
      } as any).returning();

      await db.insert(ticketEvents).values({
        orgId, ticketId: row.id, kind: "created",
        body: applied.length ? `Created. Routing rules applied: ${applied.join(", ")}` : "Created.",
        actorId: draft.createdBy, meta: { appliedRules: applied },
      });
      return row;
    });

    await emitEvent(orgId, "ticket.created", {
      ticketId: created.id, number: created.number, subject: created.subject,
      priority: created.priority, assigneeId: created.assigneeId,
    });
    return reply.code(201).send(created);
  });

  app.patch("/orgs/:orgId/tickets/:id", { preHandler: requireCapability("manage_tickets") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const b = req.body as Record<string, any>;
    const actorId = (req as any).authUser?.userId ?? null;

    const result = await withOrgDb(orgId, async (db) => {
      const [before] = await db.select().from(tickets)
        .where(and(eq(tickets.orgId, orgId), eq(tickets.id, id))).limit(1);
      if (!before) return null;

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of ["subject", "body", "priority", "category", "status", "assigneeId", "assignedTeamId", "tags"]) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      // Re-base the SLA when the priority changes — an escalated ticket should not keep
      // a relaxed deadline set when it was still "normal".
      if (b.priority && b.priority !== before.priority && !before.firstResponseAt) {
        patch.slaDueAt = new Date(Date.now() + (SLA_HOURS[b.priority] ?? 24) * 3600_000);
      }
      if (b.status === "resolved" && before.status !== "resolved") patch.resolvedAt = new Date();
      if (b.status === "closed" && before.status !== "closed") patch.closedAt = new Date();

      const [row] = await db.update(tickets).set(patch)
        .where(and(eq(tickets.orgId, orgId), eq(tickets.id, id))).returning();

      // One log line per field that actually changed, so the audit trail reads as history
      // rather than as a dump of the whole row.
      const logs: Array<{ kind: string; body: string }> = [];
      if (b.status && b.status !== before.status) logs.push({ kind: "status", body: `Status ${before.status} → ${b.status}` });
      if (b.priority && b.priority !== before.priority) logs.push({ kind: "priority", body: `Priority ${before.priority} → ${b.priority}` });
      if (b.assigneeId !== undefined && b.assigneeId !== before.assigneeId) logs.push({ kind: "assigned", body: b.assigneeId ? "Assigned to an agent" : "Unassigned" });
      if (b.assignedTeamId !== undefined && b.assignedTeamId !== before.assignedTeamId) logs.push({ kind: "assigned", body: b.assignedTeamId ? "Assigned to a team" : "Team unassigned" });
      for (const l of logs) await db.insert(ticketEvents).values({ orgId, ticketId: id, actorId, ...l });

      return { row, changed: logs.map((l) => l.kind) };
    });

    if (!result) return reply.code(404).send({ error: "not found" });
    if (result.changed.includes("status")) {
      await emitEvent(orgId, "ticket.status_changed", { ticketId: id, status: result.row.status });
    }
    return result.row;
  });

  // A note is internal; a reply is the first customer-facing response and is what stops
  // the SLA clock.
  app.post("/orgs/:orgId/tickets/:id/events", { preHandler: requireCapability("manage_tickets") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { kind, body } = req.body as { kind?: string; body?: string };
    if (!body?.trim()) return reply.code(400).send({ error: "body is required" });
    const k = kind === "reply" ? "reply" : "note";

    return withOrgDb(orgId, async (db) => {
      const [t] = await db.select().from(tickets)
        .where(and(eq(tickets.orgId, orgId), eq(tickets.id, id))).limit(1);
      if (!t) return reply.code(404).send({ error: "not found" });

      const [row] = await db.insert(ticketEvents).values({
        orgId, ticketId: id, kind: k, body: body.trim(),
        actorId: (req as any).authUser?.userId ?? null,
      }).returning();

      if (k === "reply" && !t.firstResponseAt) {
        await db.update(tickets).set({ firstResponseAt: new Date(), updatedAt: new Date() })
          .where(eq(tickets.id, id));
      }
      return row;
    });
  });

  // Merging keeps the duplicate so its number still resolves, and moves nothing —
  // the survivor's log records what happened.
  app.post("/orgs/:orgId/tickets/:id/merge", { preHandler: requireCapability("manage_tickets") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { intoId } = req.body as { intoId?: string };
    if (!intoId) return reply.code(400).send({ error: "intoId is required" });
    if (intoId === id) return reply.code(400).send({ error: "a ticket cannot be merged into itself" });

    return withOrgDb(orgId, async (db) => {
      const [dup] = await db.select().from(tickets).where(and(eq(tickets.orgId, orgId), eq(tickets.id, id))).limit(1);
      const [survivor] = await db.select().from(tickets).where(and(eq(tickets.orgId, orgId), eq(tickets.id, intoId))).limit(1);
      if (!dup || !survivor) return reply.code(404).send({ error: "not found" });

      await db.update(tickets).set({
        mergedIntoId: intoId, status: "closed", closedAt: new Date(), updatedAt: new Date(),
      }).where(eq(tickets.id, id));

      const actorId = (req as any).authUser?.userId ?? null;
      await db.insert(ticketEvents).values([
        { orgId, ticketId: id, kind: "merged", body: `Merged into #${survivor.number}`, actorId, meta: { intoId } },
        { orgId, ticketId: intoId, kind: "merged", body: `#${dup.number} merged into this ticket`, actorId, meta: { fromId: id } },
      ]);
      return { ok: true, mergedInto: survivor.number };
    });
  });

  // --- routing rules -------------------------------------------------------
  app.get("/orgs/:orgId/ticket-rules", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) => db.select().from(ticketRules)
      .where(eq(ticketRules.orgId, orgId)).orderBy(asc(ticketRules.position)));
  });

  app.post("/orgs/:orgId/ticket-rules", { preHandler: requireCapability("manage_settings") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as Record<string, any>;
    if (!b?.name?.trim() || !b?.action) return reply.code(400).send({ error: "name and action are required" });
    return withOrgDb(orgId, async (db) => {
      const [row] = await db.insert(ticketRules).values({
        orgId, name: b.name.trim(), action: b.action,
        conditions: b.conditions ?? [], actionConfig: b.actionConfig ?? {},
        position: b.position ?? 0, enabled: b.enabled ?? true,
      }).returning();
      return reply.code(201).send(row);
    });
  });

  app.delete("/orgs/:orgId/ticket-rules/:id", { preHandler: requireCapability("manage_settings") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(ticketRules)
      .where(and(eq(ticketRules.orgId, orgId), eq(ticketRules.id, id))));
    return { ok: true };
  });
}
