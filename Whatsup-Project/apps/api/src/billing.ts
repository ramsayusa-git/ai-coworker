import { and, eq, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { orgs, plans, conversationRates, walletTransactions, conversationCharges, conversations } from "./db/schema.js";

// Money convention: paise everywhere. Conversation rates are stored in MILLI-paise
// because Meta's published rates go to 3-4 rupee decimals (India utility = Rs 0.115).
export const MILLI = 1000;
export const rupees = (milliPaise: number) => milliPaise / (100 * MILLI);

// Meta bills per 24-hour conversation window, per category — not per message. A
// second marketing message inside the same open marketing window is free, which is
// why conversationCharges is unique on (conversationId, category, windowStart).
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type ConversationCategory = "marketing" | "utility" | "authentication" | "service";

// A template's Meta category maps directly onto a billing category; a free-form agent
// reply inside the 24h service window is a "service" conversation.
export function categoryFor(templateCategory?: string | null): ConversationCategory {
  const c = (templateCategory ?? "").toUpperCase();
  if (c === "MARKETING") return "marketing";
  if (c === "UTILITY") return "utility";
  if (c === "AUTHENTICATION") return "authentication";
  return "service";
}

function windowStartFor(now = new Date()) {
  // Windows are anchored to the hour the conversation opened in practice; for metering
  // we anchor to a rolling 24h bucket from midnight UTC so a window is deterministic
  // and a repeat message the same day in the same category doesn't double-charge.
  return new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
}

export async function getRateCard(countryCode: string) {
  const [row] = await db.select().from(conversationRates).where(eq(conversationRates.countryCode, countryCode)).limit(1);
  return row ?? null;
}

export type ChargeResult =
  | { charged: false; reason: "already_charged" | "no_rate_card" | "zero_rate" }
  | { charged: true; milliPaise: number; balanceAfterPaise: number; category: ConversationCategory };

// Charges one conversation window against the org wallet. Idempotent per window+category:
// a duplicate insert is swallowed by the unique constraint and reported as already_charged.
// Never throws on a billing problem — a metering failure must not break message delivery.
export async function chargeConversation(opts: {
  orgId: string;
  conversationId: string;
  category: ConversationCategory;
  messageId?: string;
}): Promise<ChargeResult> {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, opts.orgId)).limit(1);
  const countryCode = org?.billingCountryCode ?? "IN";
  const rate = await getRateCard(countryCode);
  if (!rate) return { charged: false, reason: "no_rate_card" };

  const base =
    opts.category === "marketing" ? rate.marketingMilliPaise
    : opts.category === "utility" ? rate.utilityMilliPaise
    : opts.category === "authentication" ? rate.authenticationMilliPaise
    : rate.serviceMilliPaise;
  // "No markup" is the brochure promise, implemented as a rate-card field rather than a
  // hardcoded assumption — markupBps defaults to 0 for every seeded country.
  const milliPaise = Math.round(base * (1 + rate.markupBps / 10_000));
  if (milliPaise <= 0) return { charged: false, reason: "zero_rate" };

  const windowStart = windowStartFor();
  const windowEnd = new Date(windowStart.getTime() + WINDOW_MS);

  const inserted = await db.insert(conversationCharges).values({
    orgId: opts.orgId,
    conversationId: opts.conversationId,
    category: opts.category,
    countryCode,
    ratePaise: milliPaise,
    windowStart,
    windowEnd,
    messageId: opts.messageId,
  }).onConflictDoNothing().returning();

  if (!inserted.length) return { charged: false, reason: "already_charged" };

  // Debit the wallet in whole paise (round up so fractional paise never accrue to the
  // platform's loss) and write the ledger row.
  const debitPaise = Math.ceil(milliPaise / MILLI);
  const [updated] = await db.update(orgs)
    .set({ walletPaise: sql`${orgs.walletPaise} - ${debitPaise}` })
    .where(eq(orgs.id, opts.orgId))
    .returning({ walletPaise: orgs.walletPaise });

  await db.insert(walletTransactions).values({
    orgId: opts.orgId,
    kind: "debit",
    amountPaise: -debitPaise,
    balanceAfterPaise: updated?.walletPaise ?? 0,
    reason: `${opts.category} conversation (${countryCode})`,
    refType: "conversation_charge",
    refId: opts.conversationId,
  });

  return { charged: true, milliPaise, balanceAfterPaise: updated?.walletPaise ?? 0, category: opts.category };
}

export async function creditWallet(opts: {
  orgId: string; amountPaise: number; reason: string; kind?: string; refType?: string; refId?: string;
}) {
  const [updated] = await db.update(orgs)
    .set({ walletPaise: sql`${orgs.walletPaise} + ${opts.amountPaise}` })
    .where(eq(orgs.id, opts.orgId))
    .returning({ walletPaise: orgs.walletPaise });
  const [tx] = await db.insert(walletTransactions).values({
    orgId: opts.orgId,
    kind: opts.kind ?? "credit",
    amountPaise: opts.amountPaise,
    balanceAfterPaise: updated?.walletPaise ?? 0,
    reason: opts.reason,
    refType: opts.refType,
    refId: opts.refId,
  }).returning();
  return tx;
}

// ---- Plan entitlements -----------------------------------------------------
// Features are read from the plans table (seeded from the published tier list) rather
// than hardcoded, so changing a tier is a data edit, not a deploy.
export async function getPlan(planId: string | null | undefined) {
  const [row] = await db.select().from(plans).where(eq(plans.id, planId ?? "free")).limit(1);
  if (row) return row;
  // An org on a plan id that no longer exists (a legacy/renamed tier) falls back to Free
  // rather than to "no plan at all" — otherwise every feature check silently returns
  // false and the UI has nothing to show.
  const [fallback] = await db.select().from(plans).where(eq(plans.id, "free")).limit(1);
  return fallback ?? null;
}

export async function orgHasFeature(orgId: string, feature: string): Promise<boolean> {
  const [org] = await db.select({ planId: orgs.planId }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
  const plan = await getPlan(org?.planId);
  return Boolean(plan?.features?.[feature]);
}

export async function orgLimit(orgId: string, key: string): Promise<number> {
  const [org] = await db.select({ planId: orgs.planId }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
  const plan = await getPlan(org?.planId);
  const v = plan?.limits?.[key];
  return typeof v === "number" ? v : -1; // -1 = unlimited
}

// Fastify preHandler: 402-gates a route behind a plan feature flag. Used for webhooks
// and the developer API, which the brochure's tier list puts on the Advanced plan.
export function requireFeature(feature: string, label: string) {
  return async (req: any, reply: any) => {
    const { orgId } = req.params as { orgId: string };
    if (!(await orgHasFeature(orgId, feature))) {
      return reply.code(402).send({
        error: "plan_upgrade_required",
        feature,
        message: `${label} is not included in your current plan. Upgrade in Settings > Billing.`,
      });
    }
  };
}
