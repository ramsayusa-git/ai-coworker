import type { FastifyInstance } from "fastify";
import { and, eq, desc, lte } from "drizzle-orm";
import { withOrgDb, db as rawDb } from "../db/client.js";
import { socialPosts } from "../db/schema.js";
import { requireCapability } from "../rbac.js";
import {
  hasFacebookPageCredentials, hasInstagramCredentials, publishFacebookPost, publishInstagramPost,
} from "../adapters/social/meta-social.js";
import { hasTwitterPostCredentials, publishTweet } from "../adapters/social/twitter.js";
import { hasLinkedInPostCredentials, publishLinkedInPost } from "../adapters/social/linkedin.js";
import { hasTikTokPostCredentials, publishTikTokPost } from "../adapters/social/tiktok.js";

export const ORGANIC_PLATFORMS = ["facebook", "instagram", "twitter", "linkedin", "tiktok"] as const;
export type OrganicPlatform = (typeof ORGANIC_PLATFORMS)[number];

function organicConfigured(platform: OrganicPlatform) {
  switch (platform) {
    case "facebook": return hasFacebookPageCredentials();
    case "instagram": return hasInstagramCredentials();
    case "twitter": return hasTwitterPostCredentials();
    case "linkedin": return hasLinkedInPostCredentials();
    case "tiktok": return hasTikTokPostCredentials();
  }
}

async function publishOnPlatform(platform: OrganicPlatform, caption: string, mediaUrl?: string) {
  switch (platform) {
    case "facebook": return publishFacebookPost(caption, mediaUrl);
    case "instagram": return publishInstagramPost(caption, mediaUrl);
    case "twitter": return publishTweet(caption);
    case "linkedin": return publishLinkedInPost(caption);
    case "tiktok": return publishTikTokPost(caption, mediaUrl);
  }
}

async function attemptPublish(row: { id: string; platforms: string[]; caption: string; mediaUrl: string | null }) {
  const results: Record<string, { status: "published" | "failed"; externalId?: string; error?: string }> = {};
  for (const platform of row.platforms) {
    try {
      const r = await publishOnPlatform(platform as OrganicPlatform, row.caption, row.mediaUrl ?? undefined);
      results[platform] = { status: "published", externalId: r?.externalId };
    } catch (err) {
      results[platform] = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }
  const allOk = Object.values(results).every((r) => r.status === "published");
  const status = allOk ? "published" : "failed";
  await rawDb.update(socialPosts).set({ status, results }).where(eq(socialPosts.id, row.id));
  return { status, results };
}

// Ticked from server.ts — publishes any post whose scheduledAt has arrived.
export async function processScheduledSocialPosts() {
  const due = await rawDb.select().from(socialPosts).where(and(eq(socialPosts.status, "scheduled"), lte(socialPosts.scheduledAt, new Date())));
  for (const row of due) await attemptPublish(row);
}

export async function socialPostsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/social/status", async () => {
    const status: Record<string, boolean> = {};
    for (const p of ORGANIC_PLATFORMS) status[p] = organicConfigured(p);
    return status;
  });

  app.get("/orgs/:orgId/social/posts", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(socialPosts).where(eq(socialPosts.orgId, orgId)).orderBy(desc(socialPosts.createdAt))
    );
  });

  // Creates the post row; publishes immediately to every chosen platform unless a future
  // scheduledAt is given (saved "scheduled" for processScheduledSocialPosts() to publish
  // later). Per-platform outcome is real and independent — one platform can fail while
  // another succeeds; "results" records exactly what happened on each, never faked.
  app.post("/orgs/:orgId/social/posts", { preHandler: requireCapability("manage_ads") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as { platforms?: string[]; caption?: string; mediaUrl?: string; scheduledAt?: string };
    if (!body.caption?.trim()) return reply.status(400).send({ error: "caption is required" });
    if (!body.platforms?.length) return reply.status(400).send({ error: "at least one platform is required" });
    const bad = body.platforms.filter((p) => !ORGANIC_PLATFORMS.includes(p as OrganicPlatform));
    if (bad.length) return reply.status(400).send({ error: `unknown platform(s): ${bad.join(", ")}` });

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const scheduleForLater = !!(scheduledAt && scheduledAt.getTime() > Date.now());

    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(socialPosts).values({
        orgId, platforms: body.platforms!, caption: body.caption!.trim(), mediaUrl: body.mediaUrl,
        scheduledAt: scheduledAt ?? undefined,
        status: scheduleForLater ? "scheduled" : "draft",
      }).returning();
      return r;
    });

    if (scheduleForLater) return reply.status(201).send(row);

    const result = await attemptPublish(row);
    return reply.status(result.status === "published" ? 201 : 502).send({ ...row, ...result });
  });
}
