import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { channels, contacts, conversations, messages, campaignRecipients, flowResponses } from "../db/schema.js";
import { getAdapter, type NormalizedInboundMessage } from "../adapters/index.js";
import { runAutomations } from "./automations.js";
import { emitEvent } from "../events.js";

async function ingestInbound(orgId: string, channelId: string, evt: NormalizedInboundMessage) {
  let [contact] = await db.select().from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.phoneE164, evt.phoneE164)));
  if (!contact) {
    [contact] = await db.insert(contacts).values({
      orgId, phoneE164: evt.phoneE164, waId: evt.externalContactId, name: evt.contactName || evt.phoneE164,
    }).returning();
  }

  let [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.contactId, contact.id), eq(conversations.channelId, channelId)));
  const now = new Date();
  const windowExpires = new Date(now.getTime() + 24 * 3_600_000);
  let isNewConversation = false;
  if (!conv) {
    isNewConversation = true;
    [conv] = await db.insert(conversations).values({
      orgId, channelId, contactId: contact.id, status: "open", unread: 1,
      lastMessage: evt.body, lastMessageAt: now, lastMessageDirection: "in", serviceWindowExpiresAt: windowExpires,
    }).returning();
  } else {
    await db.update(conversations).set({
      lastMessage: evt.body, lastMessageAt: now, lastMessageDirection: "in", serviceWindowExpiresAt: windowExpires,
      unread: (conv.unread ?? 0) + 1, status: conv.status === "resolved" ? "open" : conv.status,
    }).where(eq(conversations.id, conv.id));
  }

  const [inboundMsg] = await db.insert(messages).values({
    orgId, conversationId: conv.id, channelId, direction: "in",
    body: evt.body, status: "read", providerMsgId: evt.providerMsgId,
    msgType: evt.msgType ?? "text",
    interactive: evt.interactive ?? null,
  }).returning();

  // A completed WhatsApp Flow arrives as an interactive nfm_reply. Store the submission
  // as a first-class row so it is queryable (and webhook-able) rather than buried in a
  // message body. flowToken is the "<flowId>:<timestamp>" we set when sending.
  if (evt.msgType === "flow_reply") {
    const token = String((evt.interactive as any)?.flowToken ?? "");
    const flowId = token.includes(":") ? token.split(":")[0] : null;
    const [saved] = await db.insert(flowResponses).values({
      orgId,
      flowId: flowId && /^[0-9a-f-]{36}$/i.test(flowId) ? flowId : null,
      metaFlowToken: token || null,
      contactId: contact.id,
      conversationId: conv.id,
      answers: ((evt.interactive as any)?.answers ?? {}) as Record<string, unknown>,
    }).returning();
    await emitEvent(orgId, "flow.response", {
      flowResponseId: saved.id, flowId: saved.flowId, contactId: contact.id,
      conversationId: conv.id, answers: saved.answers,
    });
  }

  await emitEvent(orgId, "message.received", {
    messageId: inboundMsg.id, conversationId: conv.id, contactId: contact.id,
    from: evt.phoneE164, body: evt.body, type: evt.msgType ?? "text",
    interactive: evt.interactive ?? null,
  });

  // Wati's "what should happen when someone replies" — the honest, always-on version of it:
  // a reply mid-sequence pauses that contact's remaining campaign steps rather than talking
  // over them. A human (or a future rule) can resume the recipient explicitly later.
  await db.update(campaignRecipients).set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(campaignRecipients.orgId, orgId), eq(campaignRecipients.contactId, contact.id), eq(campaignRecipients.status, "active")));

  // Wati's Automations "Rules" (trigger + filter + action) — evaluated against this real
  // inbound event, not a simulated one. new_conversation fires once per brand-new thread;
  // keyword_received fires on every inbound message body.
  const automationCtx = { conversationId: conv.id, contactId: contact.id, channelId, messageBody: evt.body };
  if (isNewConversation) await runAutomations(orgId, "new_conversation", automationCtx);
  await runAutomations(orgId, "keyword_received", automationCtx);
}

// Meta sends delivery receipts ("statuses": sent/delivered/read/failed) on the same
// webhook as inbound messages, keyed by the message id we stored as providerMsgId when
// we sent it. This is what turns a campaign's funnel from "sent" into real
// delivered/read/failed counts instead of a number that never changes.
const META_STATUS_TO_DB: Record<string, "sent" | "delivered" | "read" | "failed"> = {
  sent: "sent", delivered: "delivered", read: "read", failed: "failed",
};
async function applyDeliveryStatuses(payload: unknown) {
  const entries = (payload as any)?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const st of change.value?.statuses ?? []) {
        const mapped = META_STATUS_TO_DB[st.status as string];
        if (!mapped || !st.id) continue;
        const [updated] = await db.update(messages).set({ status: mapped })
          .where(eq(messages.providerMsgId, st.id)).returning();
        if (updated) {
          await emitEvent(updated.orgId, "message.status", {
            messageId: updated.id, conversationId: updated.conversationId,
            status: mapped, providerMsgId: st.id,
          });
        }
      }
    }
  }
}

export async function webhookRoutes(app: FastifyInstance) {
  // Meta webhook verification handshake (Meta calls this once when you save the webhook URL)
  app.get("/webhooks/meta", async (req, reply) => {
    const q = req.query as Record<string, string>;
    const mode = q["hub.mode"];
    const token = q["hub.verify_token"];
    const challenge = q["hub.challenge"];
    const [match] = await db.select().from(channels).where(eq(channels.webhookVerifyToken, token ?? ""));
    if (mode === "subscribe" && match) return reply.send(challenge);
    return reply.status(403).send("verification failed");
  });

  // Meta sends all WABA events to one app-level URL; we route by phone_number_id inside the payload.
  app.post("/webhooks/meta", async (req, reply) => {
    const adapter = getAdapter("meta")!;
    const events = adapter.parseWebhook(req.body, {});
    const phoneNumberIds = new Set<string>(
      ((req.body as any)?.entry ?? []).flatMap((e: any) =>
        (e.changes ?? []).map((c: any) => c.value?.metadata?.phone_number_id).filter(Boolean)
      )
    );
    for (const phoneNumberId of phoneNumberIds) {
      const [channel] = await db.select().from(channels)
        .where(and(eq(channels.provider, "meta"), eq(channels.externalId, phoneNumberId)));
      if (!channel) continue;
      for (const evt of events) await ingestInbound(channel.orgId, channel.id, evt);
    }
    await applyDeliveryStatuses(req.body);
    return reply.status(200).send("EVENT_RECEIVED");
  });

  // Whapi webhook URL is per-channel (you configure it as .../webhooks/whapi/<channelId> when connecting).
  app.post("/webhooks/whapi/:channelId", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
    if (!channel) return reply.status(404).send({ error: "unknown channel" });

    const adapter = getAdapter("whapi")!;
    const events = adapter.parseWebhook(req.body, channel.credentials ?? {});
    for (const evt of events) await ingestInbound(channel.orgId, channel.id, evt);
    return reply.status(200).send({ ok: true });
  });

  // Facebook Messenger / Instagram Direct. Both are per-channel URLs like the Whapi one
  // (.../webhooks/messenger/<channelId>) because a Page token is per channel, and both use
  // Meta's hub.challenge handshake on GET.
  for (const provider of ["messenger", "instagram"] as const) {
    app.get(`/webhooks/${provider}/:channelId`, async (req, reply) => {
      const { channelId } = req.params as { channelId: string };
      const q = req.query as Record<string, string>;
      const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
      if (q["hub.mode"] === "subscribe" && channel && q["hub.verify_token"] === channel.webhookVerifyToken) {
        return reply.status(200).send(q["hub.challenge"]);
      }
      return reply.status(403).send("forbidden");
    });

    app.post(`/webhooks/${provider}/:channelId`, async (req, reply) => {
      const { channelId } = req.params as { channelId: string };
      const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
      if (!channel) return reply.status(404).send({ error: "unknown channel" });
      const adapter = getAdapter(provider)!;
      const events = adapter.parseWebhook(req.body, channel.credentials ?? {});
      for (const evt of events) await ingestInbound(channel.orgId, channel.id, evt);
      return reply.status(200).send("EVENT_RECEIVED");
    });
  }
}
