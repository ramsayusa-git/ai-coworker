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
import { dealsRoutes } from "./modules/deals.js";
import { companiesRoutes } from "./modules/companies.js";
import { tasksRoutes } from "./modules/tasks.js";
import { flowsRoutes } from "./modules/flows.js";
import { dashboardRoutes } from "./modules/dashboard.js";
import { ticketsRoutes } from "./modules/tickets.js";
import { leadsRoutes } from "./modules/leads.js";
import { quotesRoutes, appointmentsRoutes } from "./modules/sales-extras.js";
import { surveysRoutes } from "./modules/surveys.js";
import { timelineRoutes } from "./modules/timeline.js";
import { licenseActivationRoutes, partnerLicenseRoutes } from "./modules/licenses.js";
import { billingRoutes, billingCatalogRoutes } from "./modules/billing.js";
import { developerRoutes } from "./modules/developer.js";
import { publicApiRoutes } from "./modules/public-api.js";
import { processWebhookDeliveries } from "./events.js";

const app = Fastify({
  logger: { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } },
});

// @fastify/cors v11's own default `methods` is just "GET,HEAD,POST" (not the full REST verb
// set docs imply) — every PATCH/PUT/DELETE route in this app was silently unreachable from
// the browser (blocked at the preflight, never even logged server-side) until this was made
// explicit. Found while wiring up Deals' PATCH routes; applies to every existing module too.
await app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"] });
await app.register(authPlugin);

app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

// Unauthenticated — hit by our own frontend (auth) or by Meta/Whapi's servers directly (webhooks)
await app.register(authRoutes, { prefix: "/v1" });
await app.register(webhookRoutes, { prefix: "/v1" });
// Self-hosted / dedicated instances activate here — no session, only a licence key.
await app.register(licenseActivationRoutes, { prefix: "/v1" });
// Authenticated but no :orgId in the URL
await app.register(meRoutes, { prefix: "/v1" });
// Plan/rate catalogue — authenticated but not org-scoped (pricing page + plan picker)
await app.register(billingCatalogRoutes, { prefix: "/v1" });
// Public developer REST API, authenticated by an org API key rather than a user JWT.
await app.register(publicApiRoutes, { prefix: "/api/v1" });
// Partner (multi-vendor/reseller) console — scoped by :partnerId, not :orgId; each handler
// authenticates and checks partner_members itself, since a partner isn't an org.
await app.register(partnersRoutes, { prefix: "/v1" });
await app.register(async (scoped) => {
  scoped.addHook("preHandler", async (req, reply) => { await app.authenticate(req, reply); });
  await scoped.register(partnerLicenseRoutes);
}, { prefix: "/v1" });

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
  await scoped.register(dealsRoutes);
  await scoped.register(companiesRoutes);
  await scoped.register(tasksRoutes);
  await scoped.register(flowsRoutes);
  await scoped.register(dashboardRoutes);
  await scoped.register(ticketsRoutes);
  await scoped.register(leadsRoutes);
  await scoped.register(quotesRoutes);
  await scoped.register(appointmentsRoutes);
  await scoped.register(surveysRoutes);
  await scoped.register(timelineRoutes);
  await scoped.register(billingRoutes);
  await scoped.register(developerRoutes);
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
  // Outbound webhook dispatch: delivers queued events with an HMAC signature and retries
  // failures with exponential backoff. Queueing is decoupled from delivery on purpose so a
  // dead customer endpoint can never slow down a message send.
  setInterval(() => {
    processWebhookDeliveries().catch((err) => app.log.error({ err }, "processWebhookDeliveries tick failed"));
  }, 15_000);
});
