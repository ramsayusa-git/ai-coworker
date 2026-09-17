import crypto from "node:crypto";
import { and, eq, lte, or, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { webhookEndpoints, webhookDeliveries } from "./db/schema.js";

// Events an org can subscribe an outbound webhook to. Keep this list and the
// frontend's checkbox list in sync — it is the documented contract.
export const WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "message.status",
  "conversation.assigned",
  "conversation.status_changed",
  "contact.created",
  "campaign.completed",
  "flow.response",
  "deal.stage_changed",
  "ticket.created",
  "ticket.status_changed",
  "survey.answered",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const MAX_ATTEMPTS = 5;
// Exponential backoff in seconds between retries, indexed by attempt count.
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200];

export function signPayload(secret: string, body: string, timestamp: number) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

// Queues one event for every active endpoint of an org subscribed to it. Returns
// immediately — actual HTTP delivery happens on the dispatch tick, so a slow or dead
// customer endpoint can never block a message send.
export async function emitEvent(orgId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  try {
    const endpoints = await db.select().from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.active, true)));
    const targets = endpoints.filter((e) => (e.events ?? []).includes(event) || (e.events ?? []).includes("*"));
    if (!targets.length) return;
    await db.insert(webhookDeliveries).values(
      targets.map((e) => ({
        orgId, endpointId: e.id, event,
        payload: { event, orgId, occurredAt: new Date().toISOString(), data: payload },
        status: "pending" as const, nextAttemptAt: new Date(),
      }))
    );
  } catch {
    // Never let webhook bookkeeping break the operation that produced the event.
  }
}

async function deliverOne(row: typeof webhookDeliveries.$inferSelect) {
  const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, row.endpointId)).limit(1);
  if (!endpoint || !endpoint.active) {
    await db.update(webhookDeliveries).set({ status: "failed", error: "endpoint removed or disabled" })
      .where(eq(webhookDeliveries.id, row.id));
    return;
  }

  const body = JSON.stringify(row.payload ?? {});
  const ts = Math.floor(Date.now() / 1000);
  const attempts = (row.attempts ?? 0) + 1;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-loqio-event": row.event,
        "x-loqio-delivery": row.id,
        "x-loqio-timestamp": String(ts),
        "x-loqio-signature": `sha256=${signPayload(endpoint.secret, body, ts)}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      await db.update(webhookDeliveries).set({
        status: "delivered", attempts, responseCode: res.status, deliveredAt: new Date(), error: null,
      }).where(eq(webhookDeliveries.id, row.id));
      return;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const exhausted = attempts >= MAX_ATTEMPTS;
    await db.update(webhookDeliveries).set({
      status: exhausted ? "failed" : "pending",
      attempts,
      error: message,
      nextAttemptAt: exhausted ? null : new Date(Date.now() + BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length) - 1] * 1000),
    }).where(eq(webhookDeliveries.id, row.id));
  }
}

// Ticked from server.ts. Picks up due pending deliveries and POSTs them with an
// HMAC-SHA256 signature the receiver can verify against their endpoint secret.
export async function processWebhookDeliveries() {
  const due = await db.select().from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, new Date())))
    .limit(50);
  for (const row of due) await deliverOne(row);
}
