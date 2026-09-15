import 'server-only'
import { cookies, headers } from 'next/headers'
import { hash, verify } from '@node-rs/argon2'
import { controlDb } from '@/lib/control-db'
import { env } from '@/lib/env'
import { randomToken, sha256 } from '@/lib/crypto'
import type { Principal } from '@/lib/rbac'
import type { PlatformRole } from '@/generated/control/client'

/**
 * Authentication and session handling.
 *
 * The cookie holds an opaque token and nothing else. Which org a request acts
 * in is read from the Session row and re-checked against Membership on every
 * request, so a tampered cookie cannot reach another org's environment. That
 * check is what makes the isolation promise hold at the application layer, on
 * top of the database-level separation.
 */

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

export const hashPassword = (plain: string) => hash(plain, ARGON)

export async function verifyPassword(stored: string, supplied: string) {
  try {
    return await verify(stored, supplied)
  } catch {
    return false
  }
}

export class AuthError extends Error {
  status = 401
  constructor(message = 'Not signed in') {
    super(message)
    this.name = 'AuthError'
  }
}

async function clientMeta() {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  return {
    ip: (forwarded ? forwarded.split(',')[0]!.trim() : h.get('x-real-ip') ?? '').slice(0, 45) || null,
    userAgent: (h.get('user-agent') ?? '').slice(0, 255) || null,
  }
}

export async function signIn(username: string, password: string) {
  const meta = await clientMeta()
  const name = username.trim().toLowerCase()
  const user = await controlDb.user.findUnique({
    where: { username: name },
    include: { memberships: { where: { isActive: true }, include: { org: true } } },
  })

  const record = async (success: boolean, reason?: string) => {
    await controlDb.loginAttempt.create({
      data: { username: name, success, reason, ...meta },
    })
  }

  if (!user || !user.isActive) {
    // Same shape and roughly the same cost as a wrong password, so the
    // response does not disclose whether the account exists.
    await hashPassword(password).catch(() => undefined)
    await record(false, user ? 'inactive' : 'unknown_user')
    throw new AuthError('Incorrect username or password')
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    await record(false, 'bad_password')
    throw new AuthError('Incorrect username or password')
  }

  const token = randomToken()
  const now = new Date()
  const only = user.memberships.length === 1 ? user.memberships[0] : undefined

  await controlDb.session.create({
    data: {
      tokenHash: sha256(token),
      userId: user.id,
      activeOrgId: only?.orgId ?? null,
      membershipId: only?.id ?? null,
      expiresAt: new Date(now.getTime() + env.sessionMaxAgeSeconds * 1000),
      ...meta,
    },
  })

  await controlDb.user.update({ where: { id: user.id }, data: { lastLoginAt: now } })
  await record(true)

  const jar = await cookies()
  jar.set(env.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: env.sessionMaxAgeSeconds,
  })

  return { user, memberships: user.memberships, activeOrgId: only?.orgId ?? null }
}

export async function signOut() {
  const jar = await cookies()
  const token = jar.get(env.sessionCookie)?.value
  if (token) {
    await controlDb.session
      .updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined)
  }
  jar.delete(env.sessionCookie)
}

export type SessionContext = {
  sessionId: number
  user: { id: number; username: string; displayName: string; isPlatformAdmin: boolean }
  orgId: number | null
  role: PlatformRole | null
}

/** Resolve the caller, refresh the idle window, or return null. */
export async function getSession(): Promise<SessionContext | null> {
  const jar = await cookies()
  const token = jar.get(env.sessionCookie)?.value
  if (!token) return null

  const session = await controlDb.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true, membership: true },
  })
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null
  if (!session.user.isActive) return null

  if (env.sessionIdleSeconds > 0) {
    const idleMs = Date.now() - session.lastActivityAt.getTime()
    if (idleMs > env.sessionIdleSeconds * 1000) {
      await controlDb.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      })
      return null
    }
  }

  // Throttle the sliding-window write: one per minute is plenty.
  if (Date.now() - session.lastActivityAt.getTime() > 60_000) {
    await controlDb.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    })
  }

  // Re-check the membership every request: revoking access takes effect now,
  // not when the cookie expires.
  let orgId: number | null = session.activeOrgId
  let role: PlatformRole | null = session.membership?.role ?? null
  if (orgId) {
    const membership = await controlDb.membership.findUnique({
      where: { userId_orgId: { userId: session.userId, orgId } },
    })
    if (!membership?.isActive) {
      orgId = null
      role = null
    } else {
      role = membership.role
    }
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName || session.user.username,
      isPlatformAdmin: session.user.isPlatformAdmin,
    },
    orgId,
    role,
  }
}

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession()
  if (!session) throw new AuthError()
  return session
}

/** A session that has an org selected — what every business page needs. */
export async function requireOrgSession(): Promise<SessionContext & { orgId: number; role: PlatformRole }> {
  const session = await requireSession()
  if (!session.orgId || !session.role) throw new AuthError('No company selected')
  return session as SessionContext & { orgId: number; role: PlatformRole }
}

export async function switchOrg(orgId: number) {
  const session = await requireSession()
  const membership = await controlDb.membership.findUnique({
    where: { userId_orgId: { userId: session.user.id, orgId } },
  })
  if (!membership?.isActive) throw new AuthError('You do not have access to that company')

  await controlDb.session.update({
    where: { id: session.sessionId },
    data: { activeOrgId: orgId, membershipId: membership.id },
  })
  await controlDb.membership.update({
    where: { id: membership.id },
    data: { lastAccessedAt: new Date() },
  })
}

export function principalFrom(session: SessionContext & { orgId: number; role: PlatformRole }): Principal {
  return {
    kind: 'user',
    id: session.user.id,
    name: session.user.username,
    role: session.role,
    orgId: session.orgId,
    isPlatformAdmin: session.user.isPlatformAdmin,
  }
}
