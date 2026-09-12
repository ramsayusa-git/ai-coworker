import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { messages, conversations, channels, campaigns } from "../db/schema.js";

const COST_PER_OUTBOUND_PAISE = 35;

export async function analyticsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/analytics", async (req) => {
    const { orgId } = req.params as { orgId: string };

    return withOrgDb(orgId, async (db) => {
      const [allMessages, allConvs, allChannels, allCampaigns] = await Promise.all([
        db.select().from(messages).where(eq(messages.orgId, orgId)),
        db.select().from(conversations).where(eq(conversations.orgId, orgId)),
        db.select().from(channels).where(eq(channels.orgId, orgId)),
        db.select().from(campaigns).where(eq(campaigns.orgId, orgId)),
      ]);

      const out = allMessages.filter((m) => m.direction === "out");
      const inbound = allMessages.filter((m) => m.direction === "in");
      const delivered = out.filter((m) => m.status === "delivered" || m.status === "read");
      const read = out.filter((m) => m.status === "read");
      const activeConversations = allConvs.filter((c) => c.status === "open" || c.status === "pending").length;

      const days: Record<string, { sent: number; received: number }> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        days[d] = { sent: 0, received: 0 };
      }
      for (const m of allMessages) {
        const d = m.createdAt.toISOString().slice(0, 10);
        if (!days[d]) continue;
        if (m.direction === "out") days[d].sent++; else days[d].received++;
      }

      const channelById = new Map(allChannels.map((c) => [c.id, c]));
      const channelCounts = new Map<string, number>();
      for (const m of allMessages) {
        const ch = channelById.get(m.channelId);
        const label = ch ? (ch.provider === "meta" ? "Official (Meta)" : "Quick Connect") : "Unknown";
        channelCounts.set(label, (channelCounts.get(label) ?? 0) + 1);
      }

      return {
        messagesSent: out.length,
        messagesReceived: inbound.length,
        activeConversations,
        avgResponseTimeMin: null,
        deliveryRate: out.length ? delivered.length / out.length : 0,
        readRate: out.length ? read.length / out.length : 0,
        costPaise: out.length * COST_PER_OUTBOUND_PAISE,
        dailySeries: Object.entries(days).map(([date, v]) => ({ date, ...v })),
        channelSplit: Array.from(channelCounts.entries()).map(([channel, count]) => ({ channel, count })),
        topCampaigns: allCampaigns
          .map((c) => ({ name: c.name, delivered: c.stats?.delivered ?? 0, read: c.stats?.read ?? 0,
            ctr: (c.stats?.delivered ?? 0) > 0 ? (c.stats!.read / c.stats!.delivered) : 0 }))
          .sort((a, b) => b.delivered - a.delivered)
          .slice(0, 5),
      };
    });
  });
}
