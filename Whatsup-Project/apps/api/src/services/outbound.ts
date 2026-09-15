import { and, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { conversations, channels, contacts, messages, templates, flows } from "../db/schema.js";
import { getAdapter } from "../adapters/index.js";
import type { InteractiveSpec } from "../adapters/types.js";
import { chargeConversation, categoryFor } from "../billing.js";
import { emitEvent } from "../events.js";

export type OutboundRequest = {
  orgId: string;
  conversationId: string;
  body?: string;
  templateId?: string;
  // Ad-hoc interactive message (composer "Send interactive"), independent of a template.
  interactive?: Partial<InteractiveSpec> | null;
  // Substitutions for a template's {{1}}, {{2}}, ... placeholders
  variables?: string[];
  campaignId?: string;
};

export type OutboundResult =
  | { ok: true; message: typeof messages.$inferSelect }
  | { ok: false; code: number; error: string };

function fillVariables(body: string, variables?: string[]) {
  if (!variables?.length) return body;
  return body.replace(/\{\{(\d+)\}\}/g, (m, i) => variables[Number(i) - 1] ?? m);
}

// Builds the provider-neutral interactive spec for a send, from either an explicit
// ad-hoc spec or an interactive template. Returns null for a plain text send.
export async function specForTemplate(
  db: any, orgId: string, tpl: typeof templates.$inferSelect, body: string
): Promise<InteractiveSpec | null> {
  if (!tpl.interactiveType || tpl.interactiveType === "none") return null;
  const spec: InteractiveSpec = {
    type: tpl.interactiveType,
    body,
    headerType: tpl.headerType ?? "none",
    headerText: tpl.headerText ?? undefined,
    headerMediaUrl: tpl.headerMediaUrl ?? undefined,
    footer: tpl.footer ?? undefined,
    buttons: tpl.buttons ?? [],
    listButtonText: tpl.listButtonText ?? undefined,
    listSections: tpl.listSections ?? [],
    catalogId: tpl.catalogId ?? undefined,
    catalogSections: tpl.catalogSections ?? [],
    flowCtaText: tpl.flowCtaText ?? undefined,
  };
  if (tpl.interactiveType === "flow" && tpl.flowId) {
    const [flow] = await db.select().from(flows).where(eq(flows.id, tpl.flowId)).limit(1);
    if (!flow?.metaFlowId) {
      throw new Error("This template points at a Flow that has not been published to Meta yet — publish it first.");
    }
    spec.metaFlowId = flow.metaFlowId;
    spec.flowToken = `${flow.id}:${Date.now()}`;
  }
  return spec;
}

// The single outbound path used by the inbox composer, the public API and campaigns:
// resolves the channel, sends text OR an interactive message, records the message row,
// meters the conversation against the wallet, and emits the message.sent webhook event.
export async function sendOnConversation(req: OutboundRequest): Promise<OutboundResult> {
  const { orgId, conversationId } = req;

  const result = await withOrgDb(orgId, async (db) => {
    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
    if (!conv) return { ok: false as const, code: 404, error: "conversation not found" };

    const [channel] = await db.select().from(channels).where(eq(channels.id, conv.channelId));
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));

    let tpl: typeof templates.$inferSelect | undefined;
    if (req.templateId) {
      [tpl] = await db.select().from(templates)
        .where(and(eq(templates.orgId, orgId), eq(templates.id, req.templateId))).limit(1);
      if (!tpl) return { ok: false as const, code: 400, error: "template not found" };
      if (tpl.status !== "approved") {
        return { ok: false as const, code: 400, error: `Template "${tpl.name}" is ${tpl.status}, not approved — it cannot be sent.` };
      }
    }

    const body = fillVariables((req.body ?? tpl?.body ?? "").trim(), req.variables);
    if (!body) return { ok: false as const, code: 400, error: "body required" };

    let spec: InteractiveSpec | null = null;
    try {
      if (req.interactive && req.interactive.type && req.interactive.type !== "none") {
        spec = { ...(req.interactive as InteractiveSpec), body };
      } else if (tpl) {
        spec = await specForTemplate(db, orgId, tpl, body);
      }
    } catch (err) {
      return { ok: false as const, code: 400, error: err instanceof Error ? err.message : String(err) };
    }

    let status: "sent" | "failed" = "sent";
    let providerMsgId: string | undefined;
    let errorMessage: string | undefined;

    const adapter = channel ? getAdapter(channel.provider) : null;
    const hasCreds = channel?.credentials && Object.keys(channel.credentials).length > 0;

    if (adapter && hasCreds && contact) {
      try {
        if (spec && adapter.sendInteractive) {
          const r = await adapter.sendInteractive(channel.credentials!, contact.phoneE164, spec);
          providerMsgId = r.providerMsgId;
        } else {
          // A provider with no interactive support degrades to the text body rather than
          // failing the send — the customer still gets the message, minus the buttons.
          const r = await adapter.sendText(channel.credentials!, contact.phoneE164, body);
          providerMsgId = r.providerMsgId;
        }
      } catch (err) {
        status = "failed";
        errorMessage = err instanceof Error ? err.message : String(err);
      }
    }

    const [msg] = await db.insert(messages).values({
      orgId, conversationId, channelId: conv.channelId, direction: "out",
      body, status, providerMsgId, errorMessage,
      msgType: spec ? "interactive" : req.templateId ? "template" : "text",
      interactive: spec ? (spec as unknown as Record<string, unknown>) : null,
      templateId: req.templateId ?? null,
      campaignId: req.campaignId ?? null,
    }).returning();

    await db.update(conversations).set({
      lastMessage: body, lastMessageAt: new Date(), lastMessageDirection: "out", unread: 0,
    }).where(eq(conversations.id, conversationId));

    return { ok: true as const, message: msg, category: categoryFor(tpl?.category), sent: status === "sent" };
  });

  if (!result.ok) return result;

  // Metering and webhooks happen outside the org transaction: neither may block or roll
  // back an actual delivery. chargeConversation is idempotent per 24h window+category.
  if (result.sent) {
    await chargeConversation({
      orgId, conversationId, category: result.category, messageId: result.message.id,
    }).catch(() => undefined);
  }
  await emitEvent(orgId, "message.sent", {
    messageId: result.message.id, conversationId, body: result.message.body,
    status: result.message.status, type: result.message.msgType,
  });

  return { ok: true, message: result.message };
}

// Resolves (or creates) the contact + conversation for a raw phone number, so the public
// API can send to someone who has never messaged in. Channel defaults to the org's first
// connected channel when the caller doesn't name one.
export async function resolveConversationForPhone(orgId: string, phoneE164: string, channelId?: string) {
  const phone = phoneE164.startsWith("+") ? phoneE164 : `+${phoneE164.replace(/\D/g, "")}`;
  return withOrgDb(orgId, async (db) => {
    const [channel] = channelId
      ? await db.select().from(channels).where(and(eq(channels.orgId, orgId), eq(channels.id, channelId))).limit(1)
      : await db.select().from(channels).where(eq(channels.orgId, orgId)).limit(1);
    if (!channel) return { error: "no channel connected for this org" as const };

    let [contact] = await db.select().from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phoneE164, phone))).limit(1);
    if (!contact) {
      [contact] = await db.insert(contacts).values({ orgId, phoneE164: phone, name: phone }).returning();
    }

    let [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.orgId, orgId), eq(conversations.contactId, contact.id), eq(conversations.channelId, channel.id)))
      .limit(1);
    if (!conv) {
      [conv] = await db.insert(conversations).values({
        orgId, channelId: channel.id, contactId: contact.id, status: "open", unread: 0,
      }).returning();
    }
    return { conversationId: conv.id, contactId: contact.id, channelId: channel.id };
  });
}
