import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { db, withOrgDb } from "../db/client.js";
import {
  automationRules, conversations, contacts, channels, templates, messages,
} from "../db/schema.js";
import { getAdapter } from "../adapters/index.js";
import { requireCapability } from "../rbac.js";

type Action =
  | { type: "assign_team"; teamId: string }
  | { type: "add_tag"; tag: string }
  | { type: "send_template"; templateId: string }
  | { type: "change_status"; status: string };
type Filter = { field: "channel" | "tag"; op: "eq" | "contains"; value: string };

export async function automationsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/automations", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(automationRules).where(eq(automationRules.orgId, orgId)).orderBy(automationRules.createdAt)
    );
  });

  app.post("/orgs/:orgId/automations", { preHandler: requireCapability("manage_automations") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      name?: string; triggerType?: string; triggerConfig?: Record<string, unknown>;
      filters?: Filter[]; actions?: Action[];
    };
    if (!body.name?.trim() || !body.triggerType) return reply.status(400).send({ error: "name and triggerType required" });
    if (body.triggerType === "keyword_received" && !(body.triggerConfig as any)?.keyword?.trim()) {
      return reply.status(400).send({ error: "keyword_received trigger needs triggerConfig.keyword" });
    }
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(automationRules).values({
        orgId, name: body.name!.trim(), triggerType: body.triggerType!,
        triggerConfig: body.triggerConfig ?? {}, filters: body.filters ?? [], actions: body.actions ?? [],
      }).returning();
      return r;
    });
    return reply.status(201).send(row);
  });

  app.patch("/orgs/:orgId/automations/:id", { preHandler: requireCapability("manage_automations") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { enabled, name, triggerType, triggerConfig, filters, actions } = req.body as {
      enabled?: boolean; name?: string; triggerType?: string;
      triggerConfig?: Record<string, unknown>; filters?: Filter[]; actions?: Action[];
    };
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (enabled !== undefined) patch.enabled = enabled;
    if (name !== undefined) patch.name = name;
    if (triggerType !== undefined) patch.triggerType = triggerType;
    if (triggerConfig !== undefined) patch.triggerConfig = triggerConfig;
    if (filters !== undefined) patch.filters = filters;
    if (actions !== undefined) patch.actions = actions;

    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.update(automationRules).set(patch)
        .where(and(eq(automationRules.id, id), eq(automationRules.orgId, orgId))).returning();
      return r;
    });
    if (!row) return reply.status(404).send({ error: "not found" });
    return row;
  });

  app.delete("/orgs/:orgId/automations/:id", { preHandler: requireCapability("manage_automations") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(automationRules).where(and(eq(automationRules.id, id), eq(automationRules.orgId, orgId))));
    return reply.status(204).send();
  });
}

// Real trigger+filter+action engine — evaluated against genuine inbound events from
// webhooks.ts (never a simulated/demo event). "new_conversation" fires once, right when
// ingestInbound() creates a brand-new conversation row; "keyword_received" fires on every
// inbound message, matched as a case-insensitive substring against triggerConfig.keyword.
// Filters narrow which conversations a rule applies to; actions run in the order stored.
export async function runAutomations(
  orgId: string,
  trigger: "new_conversation" | "keyword_received",
  ctx: { conversationId: string; contactId: string; channelId: string; messageBody: string }
) {
  const rules = await db.select().from(automationRules)
    .where(and(eq(automationRules.orgId, orgId), eq(automationRules.enabled, true), eq(automationRules.triggerType, trigger)));
  if (rules.length === 0) return;

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, ctx.contactId));
  if (!contact) return;

  for (const rule of rules) {
    if (trigger === "keyword_received") {
      const keyword = (rule.triggerConfig as any)?.keyword as string | undefined;
      if (!keyword || !ctx.messageBody.toLowerCase().includes(keyword.toLowerCase())) continue;
    }

    const filters = (rule.filters ?? []) as Filter[];
    const passesFilters = filters.every((f) => {
      if (f.field === "channel") return f.op === "eq" ? ctx.channelId === f.value : true;
      if (f.field === "tag") return (contact.tags ?? []).some((t) => f.op === "eq" ? t === f.value : t.includes(f.value));
      return true;
    });
    if (!passesFilters) continue;

    for (const action of (rule.actions ?? []) as Action[]) {
      if (action.type === "assign_team") {
        await db.update(conversations).set({ assignedTeamId: action.teamId }).where(eq(conversations.id, ctx.conversationId));
      } else if (action.type === "change_status") {
        await db.update(conversations).set({ status: action.status as any }).where(eq(conversations.id, ctx.conversationId));
      } else if (action.type === "add_tag") {
        if (!(contact.tags ?? []).includes(action.tag)) {
          await db.update(contacts).set({ tags: sql`array_append(coalesce(${contacts.tags}, ARRAY[]::text[]), ${action.tag})` })
            .where(eq(contacts.id, contact.id));
        }
      } else if (action.type === "send_template") {
        const [tplRow] = await db.select().from(templates).where(eq(templates.id, action.templateId));
        const [channel] = await db.select().from(channels).where(eq(channels.id, ctx.channelId));
        if (!tplRow || !channel) continue;
        const adapter = getAdapter(channel.provider);
        const hasCreds = channel.credentials && Object.keys(channel.credentials).length > 0;
        let status: "sent" | "failed" = "sent";
        let providerMsgId: string | undefined;
        let errorMessage: string | undefined;
        if (adapter && hasCreds) {
          try {
            const res = await adapter.sendText(channel.credentials!, contact.phoneE164, tplRow.body);
            providerMsgId = res.providerMsgId;
          } catch (err) {
            status = "failed";
            errorMessage = err instanceof Error ? err.message : String(err);
          }
        } else {
          status = "failed";
          errorMessage = "Channel has no connected provider credentials";
        }
        await db.insert(messages).values({
          orgId, conversationId: ctx.conversationId, channelId: ctx.channelId, direction: "out",
          body: tplRow.body, status, templateId: tplRow.id, providerMsgId, errorMessage,
        });
        await db.update(conversations).set({ lastMessage: tplRow.body, lastMessageAt: new Date(), lastMessageDirection: "out" })
          .where(eq(conversations.id, ctx.conversationId));
      }
    }
  }
}
