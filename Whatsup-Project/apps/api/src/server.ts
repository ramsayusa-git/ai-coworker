import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./modules/auth.js";
import { webhookRoutes } from "./modules/webhooks.js";
import { meRoutes } from "./modules/me.js";
import { contactsRoutes } from "./modules/contacts.js";
import { channelsRoutes } from "./modules/channels.js";
import { conversationsRoutes } from "./modules/conversations.js";
import { templatesRoutes } from "./modules/templates.js";
import { campaignsRoutes } from "./modules/campaigns.js";
import { botsRoutes } from "./modules/bots.js";
import { analyticsRoutes } from "./modules/analytics.js";

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
  await scoped.register(templatesRoutes);
  await scoped.register(campaignsRoutes);
  await scoped.register(botsRoutes);
  await scoped.register(analyticsRoutes);
}, { prefix: "/v1" });

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).then(() => {
  app.log.info(`Whatsup API listening on :${port}`);
});
