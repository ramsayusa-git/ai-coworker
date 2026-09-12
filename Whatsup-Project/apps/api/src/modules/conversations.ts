import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { conversations, messages, contacts, channels } from "../db/schema.js";
import { getAdapter } from "../adapters/index.js";

export async function conversationsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/conversations", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select({
        id: conversations.id, status: conversations.status, unread: conversations.unread,
        lastMessage: conversations.lastMessage, lastMessageAt: conversations.lastMessageAt,
        serviceWindowExpiresAt: conversations.serviceWindowExpiresAt,
        contact: { id: contacts.id, name: contacts.name, phone: contacts.phoneE164 },
        channel: { id: channels.id, name: channels.displayName, provider: channels.provider },
      }).from(conversations)
        .innerJoin(contacts, eq(conversations.contactId, contacts.id))
        .innerJoin(channels, eq(conversations.channelId, channels.id))
        .where(eq(conversations.orgId, orgId))
        .orderBy(desc(conversations.lastMessageAt))
    );
  });

  app.get("/orgs/:orgId/conversations/:id/messages", async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(messages)
        .where(and(eq(messages.orgId, orgId), eq(messages.conversationId, id)))
        .orderBy(asc(messages.createdAt))
    );
  });

  app.post("/orgs/:orgId/conversations/:id/messages", async (req, reply) => {
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

      await db.update(conversations).set({ lastMessage: body.trim(), lastMessageAt: new Date(), unread: 0 })
        .where(eq(conversations.id, id));

      return msg;
    });

    if (!result) return reply.status(404).send({ error: "conversation not found" });
    return reply.status(201).send(result);
  });
}
