import type { PlatformRole } from '@/generated/control/client'

/**
 * Role model, unchanged in spirit from upstream but evaluated per org:
 *   OWNER      everything, including org settings, billing and deleting the org
 *   ADMIN      everything operational: users, settings, payroll, closing dates
 *   BOOKKEEPER day-to-day entry and reporting; no user or system administration
 *   READONLY   reads only — every mutating verb is refused
 *
 * A non-human principal (API token) wears a role exactly like a user does; the
 * gate cannot tell them apart, which is the point. Two hard restrictions live
 * here, not in data: tokens may never manage users or tokens.
 */

export const ROLE_RANK: Record<PlatformRole, number> = {
  OWNER: 40,
  ADMIN: 30,
  BOOKKEEPER: 20,
  READONLY: 10,
}

/** Areas only an owner/admin may touch at all. */
const ADMIN_ONLY = [
  'users',
  'tokens',
  'settings',
  'backups',
  'system',
  'audit',
  'migration',
  'org',
  'branding',
  'licence',
]

/** Areas an admin may write but a bookkeeper may not. */
const ADMIN_WRITE = ['payroll', 'employees', 'benefits', 'deductions', 'tax-forms', 'closing-date']

export type Principal = {
  kind: 'user' | 'token'
  id: number
  name: string
  role: PlatformRole
  orgId: number
  isPlatformAdmin?: boolean
}

export type Verb = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const READ_VERBS = new Set<Verb>(['GET', 'HEAD'])

export function roleAllows(principal: Principal, verb: Verb, area: string): boolean {
  const isRead = READ_VERBS.has(verb)

  if (principal.kind === 'token' && (area === 'users' || area === 'tokens')) return false

  if (ADMIN_ONLY.includes(area)) {
    return ROLE_RANK[principal.role] >= ROLE_RANK.ADMIN
  }

  if (!isRead && ADMIN_WRITE.includes(area)) {
    return ROLE_RANK[principal.role] >= ROLE_RANK.ADMIN
  }

  if (isRead) return ROLE_RANK[principal.role] >= ROLE_RANK.READONLY

  return ROLE_RANK[principal.role] >= ROLE_RANK.BOOKKEEPER
}

export class ForbiddenError extends Error {
  status = 403
  constructor(message = 'Your role does not permit this action') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export function requireRole(principal: Principal, minimum: PlatformRole) {
  if (ROLE_RANK[principal.role] < ROLE_RANK[minimum]) throw new ForbiddenError()
}
