import 'server-only'
import { cache } from 'react'
import { controlDb } from '@/lib/control-db'
import { tenantDb } from '@/lib/tenant-db'
import { requireOrgSession } from './auth'
import { getBrand } from './brand'

/**
 * Everything a page needs about "who is asking and which environment answers".
 * Resolved once per request; the tenant client it returns is bound to this
 * org's database and no other.
 */
export const getAppContext = cache(async () => {
  const session = await requireOrgSession()
  const [org, memberships, brand, db] = await Promise.all([
    controlDb.org.findUniqueOrThrow({
      where: { id: session.orgId },
      include: { environment: true },
    }),
    controlDb.membership.findMany({
      where: { userId: session.user.id, isActive: true },
      include: { org: { include: { environment: true } } },
      orderBy: { lastAccessedAt: 'desc' },
    }),
    getBrand(session.orgId),
    tenantDb(session.orgId),
  ])

  const settings = await db.setting.findMany()
  const map = new Map(settings.map((s) => [s.key, s.value ?? '']))
  const flag = (key: string) => map.get(key) === 'true'

  return {
    session,
    org,
    brand,
    db,
    settings: map,
    features: {
      payroll: flag('payroll_enabled'),
      inventory: flag('inventory_enabled'),
      nonprofit: flag('nonprofit_mode'),
      jobs: true,
      ai: flag('ai_enabled'),
    },
    orgs: memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      tier: m.org.environment?.tier ?? 'DATABASE',
    })),
  }
})

export type AppContext = Awaited<ReturnType<typeof getAppContext>>
