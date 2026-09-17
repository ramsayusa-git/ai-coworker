import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { licenses, licenseActivations, plans } from "./db/schema.js";

// Licence keys for the deployments we do not host (self-hosted, and dedicated cloud
// before it is handed over). The key is SELF-DESCRIBING and SIGNED: an instance can
// verify its own entitlements offline with the public signing secret baked into the
// build, and only phones home to activate and to pick up revocations.
//
// Format: LQ1.<base64url(payload json)>.<base64url(hmac-sha256)>
// Prefixing with a version means the format can change without bricking old keys.
const VERSION = "LQ1";

function signingSecret() {
  const s = process.env.LICENSE_SIGNING_SECRET;
  if (!s) {
    throw new Error(
      "LICENSE_SIGNING_SECRET is not set on the API. Issuing or verifying licences needs it — " +
      "set it in apps/api/.env and restart whatsup-api. Use a long random value and keep it secret; " +
      "every key ever issued verifies against it."
    );
  }
  return s;
}

export type LicensePayload = {
  id: string;
  plan: string;
  deployment: string;          // self_hosted | dedicated
  name: string;                // who it was issued to
  seats: number;               // -1 = unlimited
  channels: number;
  maxInstances: number;
  whiteLabel: boolean;
  partner?: string | null;     // issuing partner id, if a reseller issued it
  from: string;                // ISO
  until?: string | null;       // ISO, null = perpetual
};

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function signLicense(payload: LicensePayload): string {
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", signingSecret()).update(`${VERSION}.${body}`).digest("base64url");
  return `${VERSION}.${body}.${sig}`;
}

export type VerifyResult =
  | { valid: true; payload: LicensePayload }
  | { valid: false; reason: string };

// Pure signature + expiry check. No database access, so the same function can be
// compiled into a self-hosted build where our database is unreachable.
export function verifyLicenseKey(key: string): VerifyResult {
  const parts = (key ?? "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return { valid: false, reason: "malformed key" };
  const [, body, sig] = parts;
  let expected: string;
  try {
    expected = crypto.createHmac("sha256", signingSecret()).update(`${VERSION}.${body}`).digest("base64url");
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "cannot verify" };
  }
  // Constant-time compare — a length-safe wrapper, since timingSafeEqual throws on
  // mismatched lengths and that difference itself would leak information.
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: "signature mismatch" };

  let payload: LicensePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "unreadable payload" };
  }
  if (payload.until && new Date(payload.until) < new Date()) return { valid: false, reason: "expired" };
  if (payload.from && new Date(payload.from) > new Date()) return { valid: false, reason: "not yet valid" };
  return { valid: true, payload };
}

export const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

export async function issueLicense(input: {
  planId: string;
  deployment: string;
  issuedToName: string;
  issuedToEmail?: string | null;
  seats?: number;
  channels?: number;
  maxInstances?: number;
  whiteLabel?: boolean;
  validUntil?: Date | null;
  partnerId?: string | null;
  orgId?: string | null;
  notes?: string | null;
}) {
  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  if (!plan) throw new Error(`Unknown plan "${input.planId}"`);
  if (plan.deployment === "hosted") {
    throw new Error("Hosted plans run on our own infrastructure and do not use licence keys — pick a self-hosted or dedicated plan.");
  }

  const id = crypto.randomUUID();
  const from = new Date();
  const payload: LicensePayload = {
    id,
    plan: plan.id,
    deployment: input.deployment,
    name: input.issuedToName,
    seats: input.seats ?? -1,
    channels: input.channels ?? -1,
    maxInstances: input.maxInstances ?? 1,
    whiteLabel: input.whiteLabel ?? true,
    partner: input.partnerId ?? null,
    from: from.toISOString(),
    until: input.validUntil ? input.validUntil.toISOString() : null,
  };
  const key = signLicense(payload);

  const [row] = await db.insert(licenses).values({
    id,
    key,
    keyHash: hashKey(key),
    planId: plan.id,
    deployment: input.deployment,
    partnerId: input.partnerId ?? null,
    orgId: input.orgId ?? null,
    issuedToName: input.issuedToName,
    issuedToEmail: input.issuedToEmail ?? null,
    seats: payload.seats,
    channels: payload.channels,
    maxInstances: payload.maxInstances,
    whiteLabel: payload.whiteLabel,
    validFrom: from,
    validUntil: input.validUntil ?? null,
    notes: input.notes ?? null,
  }).returning();

  return { license: row, key };
}

export type ActivationResult =
  | { ok: true; entitlements: LicensePayload & { status: string }; activationId: string }
  | { ok: false; code: number; error: string };

// Called by a self-hosted or dedicated instance at startup and periodically after.
// This is where revocation, suspension and the instance cap are actually enforced —
// the signature alone cannot know that a licence was cancelled yesterday.
export async function activateLicense(input: {
  key: string;
  instanceId: string;
  hostname?: string;
  version?: string;
  ipAddress?: string;
}): Promise<ActivationResult> {
  const verified = verifyLicenseKey(input.key);
  if (!verified.valid) return { ok: false, code: 400, error: `Invalid licence key: ${verified.reason}` };

  const [row] = await db.select().from(licenses).where(eq(licenses.keyHash, hashKey(input.key))).limit(1);
  if (!row) return { ok: false, code: 404, error: "This licence key is not on record." };
  if (row.status !== "active") return { ok: false, code: 403, error: `This licence is ${row.status}.` };
  if (row.validUntil && row.validUntil < new Date()) return { ok: false, code: 403, error: "This licence has expired." };

  const live = await db.select().from(licenseActivations)
    .where(and(eq(licenseActivations.licenseId, row.id), isNull(licenseActivations.revokedAt)));
  const known = live.find((a) => a.instanceId === input.instanceId);
  if (!known && row.maxInstances >= 0 && live.length >= row.maxInstances) {
    return {
      ok: false, code: 409,
      error: `This licence allows ${row.maxInstances} instance(s) and ${live.length} are already active. ` +
             `Deactivate one, or ask for a licence with a higher instance count.`,
    };
  }

  const [activation] = await db.insert(licenseActivations).values({
    licenseId: row.id,
    instanceId: input.instanceId,
    hostname: input.hostname ?? null,
    version: input.version ?? null,
    ipAddress: input.ipAddress ?? null,
    lastSeenAt: new Date(),
  }).onConflictDoUpdate({
    target: [licenseActivations.licenseId, licenseActivations.instanceId],
    // A heartbeat often carries only the key and instanceId. Overwriting with nulls
    // would erase the hostname/version recorded at first activation, so each field is
    // only updated when the caller actually sent one.
    set: {
      lastSeenAt: new Date(),
      ...(input.hostname ? { hostname: input.hostname } : {}),
      ...(input.version ? { version: input.version } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      revokedAt: null,
    },
  }).returning();

  return {
    ok: true,
    activationId: activation.id,
    entitlements: { ...verified.payload, status: row.status },
  };
}
