import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, withOrgDb } from "../db/client.js";
import { apiKeys, contacts, templates, conversations } from "../db/schema.js";
import { hashKey } from "./developer.js";
import { sendOnConversation, resolveConversationForPhone } from "../services/outbound.js";
import { orgHasFeature } from "../billing.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKeyOrgId?: string;
    apiKeyScopes?: string[];
  }
}

// Public developer REST API. Authenticated by an org API key (never a user JWT), so a
// customer's integration can't accidentally act with a person's session.
export async function publicApiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const header = (req.headers["x-api-key"] as string) ||
      (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!header) {
      return reply.code(401).send({ error: "missing_api_key", message: "Send your key as the x-api-key header." });
    }
    const [key] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hashKey(header)), isNull(apiKeys.revokedAt))).limit(1);
    if (!key) return reply.code(401).send({ error: "invalid_api_key" });

    // The key itself is only usable while the org's plan includes API access — keeping an
    // old key alive past a downgrade would silently bypass the plan gate.
    if (!(await orgHasFeature(key.orgId, "developer_api")) && !(await orgHasFeature(key.orgId, "template_send_api"))) {
      return reply.code(402).send({ error: "plan_upgrade_required", message: "API access is not included in this org's plan." });
    }
    req.apiKeyOrgId = key.orgId;
    req.apiKeyScopes = key.scopes ?? [];
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  });

  function requireScope(req: FastifyRequest, reply: FastifyReply, scope: string) {
    if (!(req.apiKeyScopes ?? []).includes(scope)) {
      reply.code(403).send({ error: "insufficient_scope", required: scope });
      return false;
    }
    return true;
  }

  app.get("/me", async (req) => ({ orgId: req.apiKeyOrgId, scopes: req.apiKeyScopes }));

  app.get("/contacts", async (req, reply) => {
    if (!requireScope(req, reply, "contacts:read")) return;
    const orgId = req.apiKeyOrgId!;
    return withOrgDb(orgId, (sdb) => sdb.select().from(contacts).where(eq(contacts.orgId, orgId)).limit(200));
  });

  app.post("/contacts", async (req, reply) => {
    if (!requireScope(req, reply, "contacts:write")) return;
    const orgId = req.apiKeyOrgId!;
    const b = req.body as { phoneE164?: string; name?: string; email?: string; tags?: string[] };
    if (!b?.phoneE164) return reply.code(400).send({ error: "phoneE164 is required" });
    return withOrgDb(orgId, async (sdb) => {
      const [row] = await sdb.insert(contacts).values({
        orgId, phoneE164: b.phoneE164!, name: b.name ?? b.phoneE164!, email: b.email, tags: b.tags ?? [],
      }).onConflictDoNothing().returning();
      if (row) return row;
      const [existing] = await sdb.select().from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.phoneE164, b.phoneE164!))).limit(1);
      return existing;
    });
  });

  app.get("/templates", async (req, reply) => {
    if (!requireScope(req, reply, "templates:read")) return;
    const orgId = req.apiKeyOrgId!;
    return withOrgDb(orgId, (sdb) =>
      sdb.select().from(templates).where(eq(templates.orgId, orgId)).orderBy(desc(templates.updatedAt))
    );
  });

  // The brochure's "Template Send Message API": send an approved template (with its
  // buttons / list / flow intact) to any number, creating the contact if needed.
  app.post("/messages/template", async (req, reply) => {
    if (!requireScope(req, reply, "messages:send")) return;
    const orgId = req.apiKeyOrgId!;
    const b = req.body as { to?: string; templateName?: string; templateId?: string; variables?: string[]; channelId?: string };
    if (!b?.to) return reply.code(400).send({ error: "to is required (E.164 phone number)" });
    if (!b.templateId && !b.templateName) return reply.code(400).send({ error: "templateId or templateName is required" });

    let templateId = b.templateId;
    if (!templateId) {
      const [tpl] = await withOrgDb(orgId, (sdb) =>
        sdb.select().from(templates).where(and(eq(templates.orgId, orgId), eq(templates.name, b.templateName!))).limit(1)
      );
      if (!tpl) return reply.code(404).send({ error: "template not found", name: b.templateName });
      templateId = tpl.id;
    }

    const conv = await resolveConversationForPhone(orgId, b.to, b.channelId);
    if ("error" in conv) return reply.code(400).send({ error: conv.error });

    const result = await sendOnConversation({ orgId, conversationId: conv.conversationId, templateId, variables: b.variables });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return reply.code(201).send({
      id: result.message.id, status: result.message.status, conversationId: conv.conversationId,
      providerMessageId: result.message.providerMsgId, error: result.message.errorMessage ?? undefined,
    });
  });

  // Free-form text, only valid inside the 24h service window (Meta's rule, not ours —
  // outside it the provider rejects the send and the message is recorded as failed).
  app.post("/messages/text", async (req, reply) => {
    if (!requireScope(req, reply, "messages:send")) return;
    const orgId = req.apiKeyOrgId!;
    const b = req.body as { to?: string; body?: string; channelId?: string; interactive?: any };
    if (!b?.to || !b?.body) return reply.code(400).send({ error: "to and body are required" });
    const conv = await resolveConversationForPhone(orgId, b.to, b.channelId);
    if ("error" in conv) return reply.code(400).send({ error: conv.error });
    const result = await sendOnConversation({ orgId, conversationId: conv.conversationId, body: b.body, interactive: b.interactive });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return reply.code(201).send({
      id: result.message.id, status: result.message.status, conversationId: conv.conversationId,
      providerMessageId: result.message.providerMsgId, error: result.message.errorMessage ?? undefined,
    });
  });

  app.get("/conversations", async (req) => {
    const orgId = req.apiKeyOrgId!;
    return withOrgDb(orgId, (sdb) =>
      sdb.select().from(conversations).where(eq(conversations.orgId, orgId))
        .orderBy(desc(conversations.lastMessageAt)).limit(100)
    );
  });
}
