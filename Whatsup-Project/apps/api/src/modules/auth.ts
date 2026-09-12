import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db, withOrgDb } from "../db/client.js";
import { users, orgMembers, orgs, partners, invites } from "../db/schema.js";
import { ACCESS_TOKEN_TTL, issueRefreshFamily, rotateRefreshToken, revokeRefreshToken } from "../auth-tokens.js";

function signSession(app: FastifyInstance, userId: string, orgId: string, role: string, email: string) {
  return app.jwt.sign({ userId, orgId, role, email }, { expiresIn: ACCESS_TOKEN_TTL });
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) return reply.status(400).send({ error: "email and password required" });

    const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const [membership] = await db.select({ role: orgMembers.role, orgId: orgs.id, orgName: orgs.name })
      .from(orgMembers).innerJoin(orgs, eq(orgMembers.orgId, orgs.id))
      .where(eq(orgMembers.userId, user.id)).limit(1);
    if (!membership) return reply.status(403).send({ error: "User has no organization" });

    const token = signSession(app, user.id, membership.orgId, membership.role, user.email);
    const refreshToken = await issueRefreshFamily(user.id);
    return reply.send({
      token, refreshToken,
      user: { id: user.id, email: user.email, name: user.name, orgId: membership.orgId, orgName: membership.orgName, role: membership.role },
    });
  });

  // Access tokens are short-lived (15m); the frontend calls this silently when one expires.
  // Rotates the refresh token on every use and detects replay of an already-used token by
  // killing the whole family (see auth-tokens.ts) — a stolen refresh token stops working the
  // moment the legitimate client uses its own copy again.
  app.post("/auth/refresh", async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) return reply.status(400).send({ error: "refreshToken required" });

    const result = await rotateRefreshToken(refreshToken);
    if (!result) return reply.status(401).send({ error: "Invalid or expired refresh token" });
    if ("reused" in result) return reply.status(401).send({ error: "Refresh token already used — session revoked, please log in again" });

    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    if (!user) return reply.status(401).send({ error: "Invalid refresh token" });
    const [membership] = await db.select({ role: orgMembers.role, orgId: orgs.id, orgName: orgs.name })
      .from(orgMembers).innerJoin(orgs, eq(orgMembers.orgId, orgs.id))
      .where(eq(orgMembers.userId, user.id)).limit(1);
    if (!membership) return reply.status(403).send({ error: "User has no organization" });

    const token = signSession(app, user.id, membership.orgId, membership.role, user.email);
    return reply.send({
      token, refreshToken: result.token,
      user: { id: user.id, email: user.email, name: user.name, orgId: membership.orgId, orgName: membership.orgName, role: membership.role },
    });
  });

  app.post("/auth/logout", async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) await revokeRefreshToken(refreshToken);
    return reply.send({ ok: true });
  });

  // Self-serve signup: creates a brand-new org + its owner user. No invite needed.
  app.post("/auth/register", async (req, reply) => {
    const { email, password, name, orgName } = req.body as { email?: string; password?: string; name?: string; orgName?: string };
    if (!email?.trim() || !password || password.length < 8 || !orgName?.trim()) {
      return reply.status(400).send({ error: "email, password (min 8 chars), and orgName are required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (existing) return reply.status(409).send({ error: "An account with that email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(users).values({ email: normalizedEmail, name: name?.trim(), passwordHash }).returning();

    let [directPartner] = await db.select().from(partners).where(eq(partners.slug, "direct"));
    if (!directPartner) [directPartner] = await db.insert(partners).values({ name: "Direct", slug: "direct" }).returning();

    const [org] = await db.insert(orgs).values({ partnerId: directPartner.id, name: orgName.trim() }).returning();
    await db.insert(orgMembers).values({ orgId: org.id, userId: user.id, role: "org_owner", status: "active" });

    const token = signSession(app, user.id, org.id, "org_owner", user.email);
    const refreshToken = await issueRefreshFamily(user.id);
    return reply.status(201).send({
      token, refreshToken, user: { id: user.id, email: user.email, name: user.name, orgId: org.id, orgName: org.name, role: "org_owner" },
    });
  });

  // Create an invite (requires an authenticated org admin/owner).
  app.post("/orgs/:orgId/invites", { preHandler: app.authenticate }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    if (orgId !== req.authUser!.orgId) return reply.status(403).send({ error: "Forbidden" });
    if (!["org_owner", "org_admin"].includes(req.authUser!.role)) {
      return reply.status(403).send({ error: "Only org owners/admins can invite members" });
    }
    const { email, role } = req.body as { email?: string; role?: string };
    if (!email?.trim()) return reply.status(400).send({ error: "email required" });

    const token = randomBytes(24).toString("hex");
    const [invite] = await db.insert(invites).values({
      orgId, email: email.trim().toLowerCase(), role: (role as any) ?? "agent",
      token, invitedBy: req.authUser!.userId, expiresAt: new Date(Date.now() + 7 * 86_400_000),
    }).returning();

    // No email service wired up yet — hand the accept link back so the caller can share it manually.
    return reply.status(201).send({ ...invite, acceptUrl: `/accept-invite?token=${token}` });
  });

  app.get("/orgs/:orgId/invites", { preHandler: app.authenticate }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    if (orgId !== req.authUser!.orgId) return reply.status(403).send({ error: "Forbidden" });
    return db.select().from(invites).where(and(eq(invites.orgId, orgId), isNull(invites.acceptedAt)));
  });

  // List active members of the org (for Settings > Team & Roles).
  app.get("/orgs/:orgId/members", { preHandler: app.authenticate }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    if (orgId !== req.authUser!.orgId) return reply.status(403).send({ error: "Forbidden" });
    return withOrgDb(orgId, (scoped) =>
      scoped.select({ userId: users.id, name: users.name, email: users.email, role: orgMembers.role, status: orgMembers.status })
        .from(orgMembers).innerJoin(users, eq(orgMembers.userId, users.id))
        .where(eq(orgMembers.orgId, orgId))
    );
  });

  app.post("/auth/accept-invite", async (req, reply) => {
    const { token, password, name } = req.body as { token?: string; password?: string; name?: string };
    if (!token || !password || password.length < 8) {
      return reply.status(400).send({ error: "token and password (min 8 chars) required" });
    }
    const [invite] = await db.select().from(invites).where(eq(invites.token, token));
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return reply.status(400).send({ error: "Invite is invalid or expired" });
    }

    let [user] = await db.select().from(users).where(eq(users.email, invite.email));
    const passwordHash = await bcrypt.hash(password, 10);
    if (!user) {
      [user] = await db.insert(users).values({ email: invite.email, name: name?.trim(), passwordHash }).returning();
    } else {
      await db.update(users).set({ passwordHash, name: name?.trim() ?? user.name }).where(eq(users.id, user.id));
    }

    await db.insert(orgMembers).values({ orgId: invite.orgId, userId: user.id, role: invite.role, status: "active" })
      .onConflictDoUpdate({ target: [orgMembers.orgId, orgMembers.userId], set: { status: "active", role: invite.role } });
    await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

    const [org] = await db.select().from(orgs).where(eq(orgs.id, invite.orgId));
    const token2 = signSession(app, user.id, invite.orgId, invite.role, user.email);
    const refreshToken = await issueRefreshFamily(user.id);
    return reply.send({
      token: token2, refreshToken,
      user: { id: user.id, email: user.email, name: user.name, orgId: invite.orgId, orgName: org?.name, role: invite.role },
    });
  });
}
