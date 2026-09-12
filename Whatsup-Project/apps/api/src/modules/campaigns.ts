import type { FastifyInstance } from "fastify";
import { desc, eq, and, gte, sql, asc } from "drizzle-orm";
import { db, withOrgDb } from "../db/client.js";
import {
  campaigns, campaignSteps, campaignRecipients, channels, contacts, conversations, messages, templates,
} from "../db/schema.js";
import { getAdapter } from "../adapters/index.js";
import { sendSms, hasSmsCredentials } from "../adapters/sms.js";
import { requireCapability } from "../rbac.js";

// Real audience resolution: "All opted-in contacts" = every opted-in contact;
// any other segment label is matched against a contact's real tags array.
// No fake segment engine — an org with no contacts tagged that way gets 0, honestly.
function audienceWhere(orgId: string, segment: string) {
  const base = and(eq(contacts.orgId, orgId), eq(contacts.optIn, true));
  if (segment === "All opted-in contacts") return base;
  return and(base, sql`${contacts.tags} @> ARRAY[${segment}]::text[]`);
}

async function countAudience(orgId: string, segment: string) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(audienceWhere(orgId, segment));
  return row?.count ?? 0;
}

export async function campaignsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/campaigns", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const rows = await withOrgDb(orgId, (db) =>
      db.select().from(campaigns).where(eq(campaigns.orgId, orgId)).orderBy(desc(campaigns.createdAt))
    );
    // Real funnel: aggregated live from the messages this campaign actually generated,
    // not a static counter — "queued" is recipients not yet fully through the sequence.
    const out = [];
    for (const c of rows) {
      const counts = await withOrgDb(orgId, (db) =>
        db.select({ status: messages.status, n: sql<number>`count(*)::int` })
          .from(messages).where(eq(messages.campaignId, c.id)).groupBy(messages.status)
      );
      const funnel = { sent: 0, delivered: 0, read: 0, failed: 0 };
      for (const row of counts) if (row.status && row.status in funnel) (funnel as any)[row.status] = row.n;
      const [{ n: queued } = { n: 0 }] = await withOrgDb(orgId, (db) =>
        db.select({ n: sql<number>`count(*)::int` }).from(campaignRecipients)
          .where(and(eq(campaignRecipients.campaignId, c.id), sql`${campaignRecipients.status} != 'completed'`))
      );
      const steps = await withOrgDb(orgId, (db) =>
        db.select().from(campaignSteps).where(eq(campaignSteps.campaignId, c.id)).orderBy(asc(campaignSteps.stepIndex))
      );
      out.push({ ...c, funnel: { ...funnel, queued }, steps });
    }
    return out;
  });

  app.post("/orgs/:orgId/campaigns", { preHandler: requireCapability("manage_campaigns") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      name: string; templateId?: string; segment: string; scheduledAt?: string;
      channelId?: string; dailyLimit?: number; kind?: "single" | "drip"; smsFallback?: boolean;
      steps?: Array<{ templateId: string; delayHours: number }>;
    };
    const kind = body.kind === "drip" ? "drip" : "single";
    const steps: Array<{ templateId: string; delayHours: number }> =
      kind === "drip" && body.steps?.length ? body.steps : [{ templateId: body.templateId!, delayHours: 0 }];
    if (!body.name?.trim() || !body.segment || !steps[0]?.templateId) {
      return reply.status(400).send({ error: "name, segment, and at least one step's templateId are required" });
    }
    let channelId = body.channelId;
    if (!channelId) {
      const [ch] = await withOrgDb(orgId, (db) => db.select().from(channels).where(eq(channels.orgId, orgId)));
      channelId = ch?.id;
    }
    const audience = await withOrgDb(orgId, (db) => db.select().from(contacts).where(audienceWhere(orgId, body.segment)));

    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(campaigns).values({
        orgId, name: body.name.trim(), templateId: steps[0].templateId, segment: body.segment,
        audienceCount: audience.length, channelId, kind, smsFallback: !!body.smsFallback,
        dailyLimit: body.dailyLimit && body.dailyLimit > 0 ? body.dailyLimit : 250,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: body.scheduledAt && new Date(body.scheduledAt) > new Date() ? "scheduled" : "sending",
      }).returning();
      if (steps.length) {
        await db.insert(campaignSteps).values(
          steps.map((s, i) => ({ orgId, campaignId: r.id, stepIndex: i, templateId: s.templateId, delayHours: s.delayHours ?? 0 }))
        );
      }
      if (audience.length) {
        await db.insert(campaignRecipients).values(
          audience.map((c) => ({ campaignId: r.id, orgId, contactId: c.id, currentStep: 0, nextSendAt: new Date(), status: "active" as const }))
        );
      }
      return r;
    });
    return reply.status(201).send(row);
  });
}

// Real send loop, ticked from server.ts on an interval — no fake progress bars.
// Respects each campaign's dailyLimit (Wati-style staggered/batched sending), and — for a
// "drip" campaign — walks each recipient through campaignSteps at the configured delay
// between steps. A recipient set to "paused" (by webhooks.ts, when they reply mid-sequence —
// Wati's "what happens when someone replies") is skipped until someone resumes them.
export async function processCampaigns() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const now = new Date();

  const live = await db.select().from(campaigns).where(sql`${campaigns.status} in ('scheduled','sending')`);

  for (const c of live) {
    if (c.status === "scheduled") {
      if (!c.scheduledAt || c.scheduledAt > now) continue; // not due yet
      await db.update(campaigns).set({ status: "sending" }).where(eq(campaigns.id, c.id));
    }
    if (!c.channelId) continue;

    const [activeLeftRow] = await db.select({ n: sql<number>`count(*)::int` }).from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, c.id), eq(campaignRecipients.status, "active")));
    if ((activeLeftRow?.n ?? 0) === 0) {
      await db.update(campaigns).set({ status: "completed" }).where(eq(campaigns.id, c.id));
      continue;
    }

    const [sentTodayRow] = await db.select({ n: sql<number>`count(*)::int` }).from(messages)
      .where(and(eq(messages.campaignId, c.id), gte(messages.createdAt, startOfDay)));
    const remaining = (c.dailyLimit ?? 250) - (sentTodayRow?.n ?? 0);
    if (remaining <= 0) continue; // daily cap hit, resumes automatically tomorrow

    const due = await db.select().from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, c.id), eq(campaignRecipients.status, "active"), sql`${campaignRecipients.nextSendAt} <= now()`))
      .limit(Math.min(remaining, 25)); // small real batch per tick, not the whole list at once
    if (due.length === 0) continue; // nothing due this tick (drip delay not elapsed yet)

    const [channel] = await db.select().from(channels).where(eq(channels.id, c.channelId));
    const steps = await db.select().from(campaignSteps).where(eq(campaignSteps.campaignId, c.id)).orderBy(asc(campaignSteps.stepIndex));
    const adapter = channel ? getAdapter(channel.provider) : null;
    const hasCreds = channel?.credentials && Object.keys(channel.credentials).length > 0;

    for (const recipient of due) {
      const step = steps.find((s) => s.stepIndex === (recipient.currentStep ?? 0)) ?? steps[0];
      const [tplRow] = await db.select().from(templates).where(eq(templates.id, step.templateId));
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, recipient.contactId));
      if (!contact || !tplRow) continue;

      let [conv] = await db.select().from(conversations)
        .where(and(eq(conversations.orgId, c.orgId), eq(conversations.contactId, contact.id), eq(conversations.channelId, c.channelId)));
      if (!conv) {
        [conv] = await db.insert(conversations).values({
          orgId: c.orgId, channelId: c.channelId, contactId: contact.id, status: "open",
          lastMessage: tplRow.body, lastMessageAt: new Date(), lastMessageDirection: "out",
        }).returning();
      }

      let status: "sent" | "failed" = "sent";
      let providerMsgId: string | undefined;
      let errorMessage: string | undefined;
      let viaSms = false;
      if (adapter && hasCreds) {
        try {
          const sendResult = await adapter.sendText(channel!.credentials!, contact.phoneE164, tplRow.body);
          providerMsgId = sendResult.providerMsgId;
        } catch (err) {
          errorMessage = err instanceof Error ? err.message : String(err);
          if (c.smsFallback && hasSmsCredentials()) {
            try {
              const smsResult = await sendSms(contact.phoneE164, tplRow.body);
              providerMsgId = smsResult.providerMsgId;
              viaSms = true;
              errorMessage = undefined;
            } catch (smsErr) {
              status = "failed";
              errorMessage = `WhatsApp failed (${errorMessage}); SMS fallback also failed: ${smsErr instanceof Error ? smsErr.message : String(smsErr)}`;
            }
          } else {
            status = "failed";
          }
        }
      } else {
        status = "failed";
        errorMessage = "Channel has no connected provider credentials";
      }

      await db.insert(messages).values({
        orgId: c.orgId, conversationId: conv.id, channelId: c.channelId, direction: "out",
        body: viaSms ? `[SMS fallback] ${tplRow.body}` : tplRow.body, status, templateId: step.templateId, campaignId: c.id,
        providerMsgId, errorMessage,
      });
      await db.update(conversations).set({
        lastMessage: tplRow.body, lastMessageAt: new Date(), lastMessageDirection: "out",
      }).where(eq(conversations.id, conv.id));

      const nextStep = steps.find((s) => s.stepIndex === (recipient.currentStep ?? 0) + 1);
      if (nextStep) {
        await db.update(campaignRecipients).set({
          currentStep: nextStep.stepIndex,
          nextSendAt: new Date(now.getTime() + (nextStep.delayHours ?? 0) * 3_600_000),
          updatedAt: new Date(),
        }).where(eq(campaignRecipients.id, recipient.id));
      } else {
        await db.update(campaignRecipients).set({ status: "completed", updatedAt: new Date() })
          .where(eq(campaignRecipients.id, recipient.id));
      }
    }
  }
}
