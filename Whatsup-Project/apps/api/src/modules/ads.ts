import type { FastifyInstance } from "fastify";
import { and, eq, desc, lte } from "drizzle-orm";
import { withOrgDb, db as rawDb } from "../db/client.js";
import { adCampaigns, channels } from "../db/schema.js";
import { hasMetaAdsCredentials, createClickToWhatsAppCampaign } from "../adapters/meta-ads.js";
import { hasFacebookAdsCredentials, hasInstagramAdsCredentials, createMetaPlatformAdCampaign } from "../adapters/social/meta-social.js";
import { hasTwitterAdsCredentials, createTwitterAdCampaign } from "../adapters/social/twitter.js";
import { hasLinkedInAdsCredentials, createLinkedInAdCampaign } from "../adapters/social/linkedin.js";
import { hasGoogleAdsCredentials, createGoogleAdCampaign } from "../adapters/social/google-ads.js";
import { hasTikTokAdsCredentials, createTikTokAdCampaign } from "../adapters/social/tiktok.js";
import { requireCapability } from "../rbac.js";

export const AD_PLATFORMS = ["whatsapp", "facebook", "instagram", "twitter", "linkedin", "google_ads", "tiktok"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

function platformConfigured(platform: AdPlatform) {
  switch (platform) {
    case "whatsapp": return hasMetaAdsCredentials();
    case "facebook": return hasFacebookAdsCredentials();
    case "instagram": return hasInstagramAdsCredentials();
    case "twitter": return hasTwitterAdsCredentials();
    case "linkedin": return hasLinkedInAdsCredentials();
    case "google_ads": return hasGoogleAdsCredentials();
    case "tiktok": return hasTikTokAdsCredentials();
  }
}

async function launchOnPlatform(platform: AdPlatform, name: string, dailyBudgetPaise: number): Promise<{ id?: string }> {
  switch (platform) {
    case "whatsapp": return createClickToWhatsAppCampaign({ name, dailyBudgetPaise });
    case "facebook": case "instagram": return createMetaPlatformAdCampaign(name, dailyBudgetPaise);
    case "twitter": return createTwitterAdCampaign(name, dailyBudgetPaise);
    case "linkedin": return createLinkedInAdCampaign(name, dailyBudgetPaise);
    case "google_ads": return createGoogleAdCampaign(name, dailyBudgetPaise);
    case "tiktok": return createTikTokAdCampaign(name, dailyBudgetPaise);
  }
}

async function attemptLaunch(row: { id: string; platform: string; name: string; dailyBudgetPaise: number }) {
  let status: "active" | "failed" = "failed";
  let externalCampaignId: string | undefined;
  let errorMessage: string | undefined;
  try {
    const result = await launchOnPlatform(row.platform as AdPlatform, row.name, row.dailyBudgetPaise);
    externalCampaignId = result.id;
    status = "active";
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  await rawDb.update(adCampaigns).set({ status, externalCampaignId, errorMessage }).where(eq(adCampaigns.id, row.id));
  return { status, externalCampaignId, errorMessage };
}

// Ticked from server.ts alongside processCampaigns() — launches any ad campaign whose
// scheduledAt has arrived. Real per-platform API calls, same honest failure handling.
export async function processScheduledAds() {
  const due = await rawDb.select().from(adCampaigns).where(and(eq(adCampaigns.status, "scheduled"), lte(adCampaigns.scheduledAt, new Date())));
  for (const row of due) await attemptLaunch(row);
}

export async function adsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/ads/status", async () => {
    const status: Record<string, boolean> = {};
    for (const p of AD_PLATFORMS) status[p] = platformConfigured(p);
    return status;
  });

  app.get("/orgs/:orgId/ads/campaigns", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(adCampaigns).where(eq(adCampaigns.orgId, orgId)).orderBy(desc(adCampaigns.createdAt))
    );
  });

  // Creates the ad campaign row; launches immediately on the chosen platform unless a
  // future scheduledAt is given, in which case it's saved "scheduled" for processScheduledAds()
  // to launch later. On any failure (missing credentials, a genuine API error) the row is
  // still saved with status "failed" and the real error message — never faked as "active".
  app.post("/orgs/:orgId/ads/campaigns", { preHandler: requireCapability("manage_ads") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      name?: string; dailyBudgetPaise?: number; channelId?: string; templateId?: string;
      platform?: string; scheduledAt?: string;
    };
    if (!body.name?.trim() || !body.dailyBudgetPaise || body.dailyBudgetPaise <= 0) {
      return reply.status(400).send({ error: "name and a positive dailyBudgetPaise are required" });
    }
    const platform = (body.platform ?? "whatsapp") as AdPlatform;
    if (!AD_PLATFORMS.includes(platform)) return reply.status(400).send({ error: `platform must be one of ${AD_PLATFORMS.join(", ")}` });
    if (body.channelId) {
      const [channel] = await withOrgDb(orgId, (db) => db.select().from(channels).where(and(eq(channels.id, body.channelId!), eq(channels.orgId, orgId))));
      if (!channel) return reply.status(400).send({ error: "channelId does not belong to this org" });
    }

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const scheduleForLater = !!(scheduledAt && scheduledAt.getTime() > Date.now());

    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(adCampaigns).values({
        orgId, name: body.name!.trim(), dailyBudgetPaise: body.dailyBudgetPaise!,
        channelId: body.channelId, templateId: body.templateId, platform,
        scheduledAt: scheduledAt ?? undefined,
        status: scheduleForLater ? "scheduled" : "draft",
      }).returning();
      return r;
    });

    if (scheduleForLater) return reply.status(201).send(row);

    const result = await attemptLaunch(row);
    return reply.status(result.status === "active" ? 201 : 502).send({ ...row, ...result });
  });
}
