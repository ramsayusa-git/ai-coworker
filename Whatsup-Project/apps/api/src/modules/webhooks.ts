import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { channels, contacts, conversations, messages, campaignRecipients } from "../db/schema.js";
import { getAdapter, type NormalizedInboundMessage } from "../adapters/index.js";

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
  if (!conv) {
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

  await db.insert(messages).values({
    orgId, conversationId: conv.id, channelId, direction: "in",
    body: evt.body, status: "read", providerMsgId: evt.providerMsgId,
  });

  // Wati's "what should happen when someone replies" — the honest, always-on version of it:
  // a reply mid-sequence pauses that contact's remaining campaign steps rather than talking
  // over them. A human (or a future rule) can resume the recipient explicitly later.
  await db.update(campaignRecipients).set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(campaignRecipients.orgId, orgId), eq(campaignRecipients.contactId, contact.id), eq(campaignRecipients.status, "active")));
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
        await db.update(messages).set({ status: mapped }).where(eq(messages.providerMsgId, st.id));
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
}
