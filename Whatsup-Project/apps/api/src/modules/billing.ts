import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, withOrgDb } from "../db/client.js";
import { orgs, plans, conversationRates, walletTransactions, conversationCharges } from "../db/schema.js";
import { creditWallet, getPlan } from "../billing.js";
import { requireCapability } from "../rbac.js";

// Public (authenticated but not org-scoped) catalogue routes — the pricing page and the
// plan picker both read these.
export async function billingCatalogRoutes(app: FastifyInstance) {
  app.get("/plans", async () =>
    db.select().from(plans).where(eq(plans.active, true)).orderBy(plans.position)
  );

  app.get("/conversation-rates", async () =>
    db.select().from(conversationRates).orderBy(conversationRates.country)
  );
}

export async function billingRoutes(app: FastifyInstance) {
  // Everything the Billing tab needs in one call: plan, entitlements, wallet balance,
  // this month's real metered usage, and the org's applicable rate card.
  app.get("/orgs/:orgId/billing", async (req) => {
    const { orgId } = req.params as { orgId: string };
    const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
    const plan = await getPlan(org?.planId);
    const [rate] = await db.select().from(conversationRates)
      .where(eq(conversationRates.countryCode, org?.billingCountryCode ?? "IN")).limit(1);

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const usage = await withOrgDb(orgId, (sdb) =>
      sdb.select({
        category: conversationCharges.category,
        conversations: sql<number>`count(*)::int`,
        milliPaise: sql<number>`coalesce(sum(${conversationCharges.ratePaise}), 0)::int`,
      }).from(conversationCharges)
        .where(and(eq(conversationCharges.orgId, orgId), gte(conversationCharges.createdAt, monthStart)))
        .groupBy(conversationCharges.category)
    );

    const spentPaise = Math.ceil(usage.reduce((s, u) => s + u.milliPaise, 0) / 1000);
    return {
      plan,
      planCycle: org?.planCycle ?? "monthly",
      planStatus: org?.planStatus ?? "active",
      planRenewsAt: org?.planRenewsAt ?? null,
      billingCountryCode: org?.billingCountryCode ?? "IN",
      walletPaise: org?.walletPaise ?? 0,
      rateCard: rate ?? null,
      usageThisMonth: { byCategory: usage, spentPaise, since: monthStart.toISOString() },
    };
  });

  app.get("/orgs/:orgId/billing/transactions", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (sdb) =>
      sdb.select().from(walletTransactions)
        .where(eq(walletTransactions.orgId, orgId))
        .orderBy(desc(walletTransactions.createdAt)).limit(100)
    );
  });

  // Change plan / billing cycle / billing country. No payment gateway is wired into this
  // codebase, so this records the plan change and nothing is actually charged to a card —
  // stated plainly in the response so the UI can say so too.
  app.post("/orgs/:orgId/billing/plan", { preHandler: requireCapability("manage_billing") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as { planId?: string; cycle?: string; billingCountryCode?: string };
    const patch: Record<string, unknown> = {};

    if (b.planId) {
      const plan = await getPlan(b.planId);
      if (!plan) return reply.code(400).send({ error: "unknown plan" });
      patch.planId = plan.id;
      const months = b.cycle === "annual" ? 12 : b.cycle === "quarterly" ? 3 : 1;
      patch.planRenewsAt = new Date(Date.now() + months * 30 * 24 * 3600 * 1000);
    }
    if (b.cycle) patch.planCycle = b.cycle;
    if (b.billingCountryCode) patch.billingCountryCode = b.billingCountryCode.toUpperCase();
    if (!Object.keys(patch).length) return reply.code(400).send({ error: "nothing to change" });

    const [org] = await db.update(orgs).set(patch).where(eq(orgs.id, orgId)).returning();
    return {
      org: { planId: org.planId, planCycle: org.planCycle, planRenewsAt: org.planRenewsAt, billingCountryCode: org.billingCountryCode },
      note: "Plan recorded. No payment was collected — no payment gateway is connected to this deployment yet.",
    };
  });

  // Manual wallet top-up. Same honesty caveat: this credits the ledger directly; there is
  // no Razorpay/Stripe checkout behind it yet.
  app.post("/orgs/:orgId/billing/topup", { preHandler: requireCapability("manage_billing") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const { amountPaise, reason } = req.body as { amountPaise?: number; reason?: string };
    if (!amountPaise || amountPaise <= 0) return reply.code(400).send({ error: "amountPaise must be > 0" });
    const tx = await creditWallet({
      orgId, amountPaise, reason: reason || "Manual wallet top-up", refType: "topup",
    });
    return { transaction: tx, note: "Credited directly — no payment gateway is connected to this deployment yet." };
  });
}
