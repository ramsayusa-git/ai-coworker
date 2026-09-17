import { testDatabaseUrl } from "./db.js";

// The app reads DATABASE_URL at import time, so it must be pointed at the test
// database BEFORE any src/ module is imported. Every integration test imports this
// helper first for that reason.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.LICENSE_SIGNING_SECRET ??= "test-license-secret";

export async function buildApp() {
  const Fastify = (await import("fastify")).default;
  const cors = (await import("@fastify/cors")).default;
  const authPlugin = (await import("../../src/plugins/auth.js")).default;
  const { authRoutes } = await import("../../src/modules/auth.js");
  const { meRoutes } = await import("../../src/modules/me.js");
  const { contactsRoutes } = await import("../../src/modules/contacts.js");
  const { templatesRoutes } = await import("../../src/modules/templates.js");
  const { billingCatalogRoutes, billingRoutes } = await import("../../src/modules/billing.js");
  const { developerRoutes } = await import("../../src/modules/developer.js");
  const { publicApiRoutes } = await import("../../src/modules/public-api.js");
  const { licenseActivationRoutes, partnerLicenseRoutes } = await import("../../src/modules/licenses.js");
  const { partnersRoutes } = await import("../../src/modules/partners.js");
  const { dashboardRoutes } = await import("../../src/modules/dashboard.js");
  const { ticketsRoutes } = await import("../../src/modules/tickets.js");
  const { leadsRoutes } = await import("../../src/modules/leads.js");
  const { quotesRoutes, appointmentsRoutes } = await import("../../src/modules/sales-extras.js");
  const { surveysRoutes } = await import("../../src/modules/surveys.js");
  const { timelineRoutes } = await import("../../src/modules/timeline.js");

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"] });
  await app.register(authPlugin);

  await app.register(authRoutes, { prefix: "/v1" });
  await app.register(licenseActivationRoutes, { prefix: "/v1" });
  await app.register(meRoutes, { prefix: "/v1" });
  await app.register(billingCatalogRoutes, { prefix: "/v1" });
  await app.register(publicApiRoutes, { prefix: "/api/v1" });
  await app.register(partnersRoutes, { prefix: "/v1" });
  await app.register(async (scoped) => {
    scoped.addHook("preHandler", async (req, reply) => { await app.authenticate(req, reply); });
    await scoped.register(partnerLicenseRoutes);
  }, { prefix: "/v1" });

  await app.register(async (scoped) => {
    scoped.addHook("preHandler", async (req, reply) => {
      await app.authenticate(req, reply);
      if (reply.sent) return;
      await app.requireOrgMatch(req, reply);
    });
    await scoped.register(contactsRoutes);
    await scoped.register(templatesRoutes);
    await scoped.register(billingRoutes);
    await scoped.register(developerRoutes);
    await scoped.register(dashboardRoutes);
    await scoped.register(ticketsRoutes);
    await scoped.register(leadsRoutes);
    await scoped.register(quotesRoutes);
    await scoped.register(appointmentsRoutes);
    await scoped.register(surveysRoutes);
    await scoped.register(timelineRoutes);
  }, { prefix: "/v1" });

  await app.ready();
  return app;
}

export type Json = Record<string, any>;
export const body = (res: { body: string }): Json => JSON.parse(res.body);
