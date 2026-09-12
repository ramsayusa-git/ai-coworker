import { randomBytes, randomUUID, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db/client.js";
import { refreshTokens } from "./db/schema.js";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const ACCESS_TOKEN_TTL = "15m";

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Issues the first refresh token of a new family (a fresh login/register/invite-accept).
export async function issueRefreshFamily(userId: string) {
  const token = randomBytes(32).toString("hex");
  const family = randomUUID();
  await db.insert(refreshTokens).values({
    userId, tokenHash: hash(token), family, expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return token;
}

// Rotates a refresh token: the presented token is marked used (revoked) and a new one is
// issued in the same family. If a token that was already revoked is presented again, that's
// a stolen/replayed token — revoke the entire family so every descendant token stops working.
export async function rotateRefreshToken(presented: string): Promise<{ userId: string; token: string } | { reused: true } | null> {
  const tokenHash = hash(presented);
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  if (!row) return null;

  if (row.revokedAt) {
    await db.update(refreshTokens).set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.family, row.family), isNull(refreshTokens.revokedAt)));
    return { reused: true };
  }
  if (row.expiresAt < new Date()) return null;

  const next = randomBytes(32).toString("hex");
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
  await db.insert(refreshTokens).values({
    userId: row.userId, tokenHash: hash(next), family: row.family, expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { userId: row.userId, token: next };
}

export async function revokeRefreshToken(presented: string) {
  const tokenHash = hash(presented);
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  if (!row) return;
  await db.update(refreshTokens).set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.family, row.family), isNull(refreshTokens.revokedAt)));
}
