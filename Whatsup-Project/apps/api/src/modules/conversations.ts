import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { conversations, messages, contacts, channels, users, conversationNotes, savedViews, cannedResponses } from "../db/schema.js";
import { getAdapter } from "../adapters/index.js";
import { requireCapability } from "../rbac.js";
import { draftReply, isAiConfigured } from "../ai.js";

// A conversation is "pending your reply" (Gallabox's SLA-flag pattern) when the customer
// spoke last and it's still open — no per-conversation SLA config exists yet, so a fixed
// 30-minute threshold marks it breached. Computed from data already on the row; no extra query.
const PENDING_SLA_MINUTES = 30;
function withPendingFlag<T extends { status: string | null; lastMessageDirection: string | null; lastMessageAt: Date | string | null }>(c: T) {
  const pending = c.status === "open" && c.lastMessageDirection === "in";
  const ageMin = c.lastMessageAt ? (Date.now() - new Date(c.lastMessageAt).getTime()) / 60_000 : 0;
  return { ...c, pendingReply: pending, slaBreached: pending && ageMin > PENDING_SLA_MINUTES };
}

export async function conversationsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/conversations", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const rows = await withOrgDb(orgId, (db) =>
      db.select({
        id: conversations.id, status: conversations.status, unread: conversations.unread,
        lastMessage: conversations.lastMessage, lastMessageAt: conversations.lastMessageAt,
        lastMessageDirection: conversations.lastMessageDirection,
        serviceWindowExpiresAt: conversations.serviceWindowExpiresAt,
        assigneeId: conversations.assigneeId, assigneeName: users.name,
        pinned: conversations.pinned,
        contact: { id: contacts.id, name: contacts.name, phone: contacts.phoneE164, tags: contacts.tags },
        channel: { id: channels.id, name: channels.displayName, provider: channels.provider },
      }).from(conversations)
        .innerJoin(contacts, eq(conversations.contactId, contacts.id))
        .innerJoin(channels, eq(conversations.channelId, channels.id))
        .leftJoin(users, eq(conversations.assigneeId, users.id))
        .where(eq(conversations.orgId, orgId))
        // Pinned conversations (Gallabox pattern) always float to the top, most-recent first
        // within each group — independent of whatever status/assignment filter is applied.
        .orderBy(desc(conversations.pinned), desc(conversations.lastMessageAt))
    );
    return rows.map(withPendingFlag);
  });

  app.patch("/orgs/:orgId/conversations/:id", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { assigneeId, status, pinned } = req.body as { assigneeId?: string | null; status?: string; pinned?: boolean };
    // Reassigning a conversation is a supervisor+ action; just moving your own conversation's
    // status (open/pending/snoozed/resolved) is something agents do all day — gate each field
    // by its own capability rather than the whole route.
    const role = req.authUser?.role;
    if (assigneeId !== undefined && !["org_owner", "org_admin", "supervisor"].includes(role ?? "")) {
      return reply.status(403).send({ error: "Forbidden — requires role: org_owner, org_admin, supervisor" });
    }
    if (status !== undefined && !["org_owner", "org_admin", "supervisor", "agent"].includes(role ?? "")) {
      return reply.status(403).send({ error: "Forbidden — requires role: org_owner, org_admin, supervisor, agent" });
    }
    // Pinning is a lightweight per-agent-visible toggle any team member with send access can
    // use — no reassignment-level trust required.
    if (pinned !== undefined && !["org_owner", "org_admin", "supervisor", "agent"].includes(role ?? "")) {
      return reply.status(403).send({ error: "Forbidden — requires role: org_owner, org_admin, supervisor, agent" });
    }
    const patch: Record<string, unknown> = {};
    if (assigneeId !== undefined) patch.assigneeId = assigneeId;
    if (status !== undefined) patch.status = status;
    if (pinned !== undefined) patch.pinned = pinned;
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: "nothing to update" });

    const updated = await withOrgDb(orgId, async (db) => {
      const [row] = await db.update(conversations).set(patch)
        .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId))).returning();
      return row;
    });
    if (!updated) return reply.status(404).send({ error: "conversation not found" });
    return updated;
  });

  app.get("/orgs/:orgId/conversations/:id/notes", async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, (db) =>
      db.select({
        id: conversationNotes.id, body: conversationNotes.body, createdAt: conversationNotes.createdAt,
        authorId: conversationNotes.authorId, authorName: users.name,
      }).from(conversationNotes)
        .leftJoin(users, eq(conversationNotes.authorId, users.id))
        .where(and(eq(conversationNotes.conversationId, id), eq(conversationNotes.orgId, orgId)))
        .orderBy(asc(conversationNotes.createdAt))
    );
  });

  app.post("/orgs/:orgId/conversations/:id/notes", { preHandler: requireCapability("send_messages") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { body } = req.body as { body?: string };
    if (!body?.trim()) return reply.status(400).send({ error: "body required" });
    const row = await withOrgDb(orgId, async (db) => {
      const [n] = await db.insert(conversationNotes).values({
        orgId, conversationId: id, authorId: req.authUser!.userId, body: body.trim(),
      }).returning();
      return n;
    });
    return reply.status(201).send({ ...row, authorName: req.authUser!.email });
  });

  // AI-drafted reply suggestion for the composer. Never auto-sends — returns text for the
  // agent to review/edit in the composer, same as Wati's/Gallabox's "AI Reply"/co-pilot
  // buttons. Honest about being unconfigured rather than faking a canned response — see ai.ts.
  app.post("/orgs/:orgId/conversations/:id/draft-reply", { preHandler: requireCapability("send_messages") }, async (req, reply) => {
    if (!isAiConfigured()) {
      return reply.status(501).send({ error: "not_configured", message: "No AI provider configured on the server (set ANTHROPIC_API_KEY or OPENAI_API_KEY in apps/api/.env and restart whatsup-api)." });
    }
    const { orgId, id } = req.params as { orgId: string; id: string };
    const result = await withOrgDb(orgId, async (db) => {
      const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)));
      if (!conv) return null;
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
      const recent = await db.select().from(messages)
        .where(and(eq(messages.orgId, orgId), eq(messages.conversationId, id)))
        .orderBy(desc(messages.createdAt)).limit(10);
      const history = recent.reverse().map((m) => ({ direction: m.direction, body: m.body }));
      return draftReply({ contactName: contact?.name ?? "Customer", history });
    });
    if (!result) return reply.status(404).send({ error: "conversation not found" });
    if ("error" in result) return reply.status(502).send(result);
    return result;
  });

  app.get("/orgs/:orgId/conversations/:id/messages", async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(messages)
        .where(and(eq(messages.orgId, orgId), eq(messages.conversationId, id)))
        .orderBy(asc(messages.createdAt))
    );
  });

  app.post("/orgs/:orgId/conversations/:id/messages", { preHandler: requireCapability("send_messages") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { body } = req.body as { body: string };
    if (!body?.trim()) return reply.status(400).send({ error: "body required" });

    const result = await withOrgDb(orgId, async (db) => {
      const [conv] = await db.select().from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)));
      if (!conv) return null;

      const [channel] = await db.select().from(channels).where(eq(channels.id, conv.channelId));
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));

      let status: "sent" | "failed" = "sent";
      let providerMsgId: string | undefined;
      let errorMessage: string | undefined;

      const adapter = channel ? getAdapter(channel.provider) : null;
      const hasCreds = channel?.credentials && Object.keys(channel.credentials).length > 0;

      if (adapter && hasCreds && contact) {
        try {
          const sendResult = await adapter.sendText(channel.credentials!, contact.phoneE164, body.trim());
          providerMsgId = sendResult.providerMsgId;
        } catch (err) {
          status = "failed";
          errorMessage = err instanceof Error ? err.message : String(err);
          app.log.warn({ err }, "outbound send failed");
        }
      }

      const [msg] = await db.insert(messages).values({
        orgId, conversationId: id, channelId: conv.channelId, direction: "out",
        body: body.trim(), status, providerMsgId, errorMessage,
      }).returning();

      await db.update(conversations).set({ lastMessage: body.trim(), lastMessageAt: new Date(), lastMessageDirection: "out", unread: 0 })
        .where(eq(conversations.id, id));

      return msg;
    });

    if (!result) return reply.status(404).send({ error: "conversation not found" });
    return reply.status(201).send(result);
  });
}

export async function savedViewsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/saved-views", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select({
        id: savedViews.id, name: savedViews.name, filters: savedViews.filters,
        createdBy: savedViews.createdBy, createdByName: users.name, createdAt: savedViews.createdAt,
      }).from(savedViews)
        .leftJoin(users, eq(savedViews.createdBy, users.id))
        .where(eq(savedViews.orgId, orgId))
        .orderBy(asc(savedViews.createdAt))
    );
  });

  app.post("/orgs/:orgId/saved-views", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const { name, filters } = req.body as { name?: string; filters?: Record<string, string> };
    if (!name?.trim()) return reply.status(400).send({ error: "name required" });
    const row = await withOrgDb(orgId, async (db) => {
      const [v] = await db.insert(savedViews).values({
        orgId, name: name.trim(), filters: filters ?? {}, createdBy: req.authUser!.userId,
      }).returning();
      return v;
    });
    return reply.status(201).send({ ...row, createdByName: req.authUser!.email });
  });

  app.delete("/orgs/:orgId/saved-views/:id", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const canManageAny = ["org_owner", "org_admin"].includes(req.authUser?.role ?? "");
    const deleted = await withOrgDb(orgId, async (db) => {
      const [existing] = await db.select().from(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.orgId, orgId)));
      if (!existing) return null;
      if (!canManageAny && existing.createdBy !== req.authUser!.userId) return "forbidden" as const;
      await db.delete(savedViews).where(eq(savedViews.id, id));
      return existing;
    });
    if (deleted === null) return reply.status(404).send({ error: "not found" });
    if (deleted === "forbidden") return reply.status(403).send({ error: "Only the creator or an org admin can delete this view" });
    return reply.send({ ok: true });
  });
}

// Org-shared canned-response library — static, agent-authored quick replies invoked via a
// "/" shortcut in the composer. Any sender can list/use them; creating/deleting is gated
// behind the same manage_templates-style capability agents already understand.
export async function cannedResponsesRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/canned-responses", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(cannedResponses).where(eq(cannedResponses.orgId, orgId)).orderBy(asc(cannedResponses.shortcut))
    );
  });

  app.post("/orgs/:orgId/canned-responses", async (req, reply) => {
    const role = req.authUser?.role;
    if (!["org_owner", "org_admin", "supervisor"].includes(role ?? "")) {
      return reply.status(403).send({ error: "Forbidden — requires role: org_owner, org_admin, supervisor" });
    }
    const { orgId } = req.params as { orgId: string };
    const { shortcut, body } = req.body as { shortcut?: string; body?: string };
    const normalized = shortcut?.trim().replace(/^\//, "").toLowerCase();
    if (!normalized || !body?.trim()) return reply.status(400).send({ error: "shortcut and body required" });
    const row = await withOrgDb(orgId, async (db) => {
      const [existing] = await db.select().from(cannedResponses)
        .where(and(eq(cannedResponses.orgId, orgId), eq(cannedResponses.shortcut, normalized)));
      if (existing) return reply.status(409).send({ error: `/${normalized} already exists` });
      const [c] = await db.insert(cannedResponses).values({
        orgId, shortcut: normalized, body: body.trim(), createdBy: req.authUser!.userId,
      }).returning();
      return c;
    });
    if (reply.sent) return;
    return reply.status(201).send(row);
  });

  app.delete("/orgs/:orgId/canned-responses/:id", async (req, reply) => {
    const role = req.authUser?.role;
    if (!["org_owner", "org_admin", "supervisor"].includes(role ?? "")) {
      return reply.status(403).send({ error: "Forbidden — requires role: org_owner, org_admin, supervisor" });
    }
    const { orgId, id } = req.params as { orgId: string; id: string };
    const deleted = await withOrgDb(orgId, async (db) => {
      const [existing] = await db.select().from(cannedResponses).where(and(eq(cannedResponses.id, id), eq(cannedResponses.orgId, orgId)));
      if (!existing) return null;
      await db.delete(cannedResponses).where(eq(cannedResponses.id, id));
      return existing;
    });
    if (!deleted) return reply.status(404).send({ error: "not found" });
    return reply.send({ ok: true });
  });
}
