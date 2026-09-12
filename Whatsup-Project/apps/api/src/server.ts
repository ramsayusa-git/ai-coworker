import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./modules/auth.js";
import { webhookRoutes } from "./modules/webhooks.js";
import { meRoutes } from "./modules/me.js";
import { partnersRoutes } from "./modules/partners.js";
import { contactsRoutes } from "./modules/contacts.js";
import { channelsRoutes } from "./modules/channels.js";
import { conversationsRoutes, savedViewsRoutes, cannedResponsesRoutes } from "./modules/conversations.js";
import { templatesRoutes } from "./modules/templates.js";
import { campaignsRoutes, processCampaigns } from "./modules/campaigns.js";
import { botsRoutes } from "./modules/bots.js";
import { teamsRoutes } from "./modules/teams.js";
import { analyticsRoutes } from "./modules/analytics.js";
import { automationsRoutes } from "./modules/automations.js";
import { adsRoutes, processScheduledAds } from "./modules/ads.js";
import { socialPostsRoutes, processScheduledSocialPosts } from "./modules/social-posts.js";

const app = Fastify({
  logger: { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } },
});

await app.register(cors, { origin: true });
await app.register(authPlugin);

app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

// Unauthenticated — hit by our own frontend (auth) or by Meta/Whapi's servers directly (webhooks)
await app.register(authRoutes, { prefix: "/v1" });
await app.register(webhookRoutes, { prefix: "/v1" });
// Authenticated but no :orgId in the URL
await app.register(meRoutes, { prefix: "/v1" });
// Partner (multi-vendor/reseller) console — scoped by :partnerId, not :orgId; each handler
// authenticates and checks partner_members itself, since a partner isn't an org.
await app.register(partnersRoutes, { prefix: "/v1" });

// Everything under /v1/orgs/:orgId/* requires a valid token whose orgId matches the URL.
await app.register(async (scoped) => {
  scoped.addHook("preHandler", async (req, reply) => {
    await app.authenticate(req, reply);
    if (reply.sent) return;
    await app.requireOrgMatch(req, reply);
  });
  await scoped.register(contactsRoutes);
  await scoped.register(channelsRoutes);
  await scoped.register(conversationsRoutes);
  await scoped.register(savedViewsRoutes);
  await scoped.register(cannedResponsesRoutes);
  await scoped.register(templatesRoutes);
  await scoped.register(campaignsRoutes);
  await scoped.register(botsRoutes);
  await scoped.register(teamsRoutes);
  await scoped.register(analyticsRoutes);
  await scoped.register(automationsRoutes);
  await scoped.register(adsRoutes);
  await scoped.register(socialPostsRoutes);
}, { prefix: "/v1" });

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).then(() => {
  app.log.info(`Whatsup API listening on :${port}`);
  // Real campaign sender tick — see processCampaigns() for what "real" means here
  // (actual adapter sends respecting each campaign's daily cap, no simulated progress).
  setInterval(() => {
    processCampaigns().catch((err) => app.log.error({ err }, "processCampaigns tick failed"));
  }, 45_000);
  // Launches scheduled ad campaigns / publishes scheduled social posts once their
  // scheduledAt arrives — same real-adapter, honest-failure pattern as above.
  setInterval(() => {
    processScheduledAds().catch((err) => app.log.error({ err }, "processScheduledAds tick failed"));
    processScheduledSocialPosts().catch((err) => app.log.error({ err }, "processScheduledSocialPosts tick failed"));
  }, 30_000);
});
