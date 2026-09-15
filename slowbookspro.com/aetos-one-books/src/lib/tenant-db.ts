import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/tenant/client'
import { controlDb } from './control-db'
import { decryptMaster } from './crypto'

/**
 * Per-org tenant client factory.
 *
 * An org's environment is resolved from the control plane, its DSN decrypted
 * with the master key, and a PrismaClient opened against THAT database (or,
 * at SCHEMA tier, that schema via `search_path`). Clients are cached per org
 * and evicted LRU so a busy installation does not exhaust connections.
 *
 * Nothing in this module accepts a raw connection string from a request, and
 * no client is ever shared between orgs — the cache key is the org id and the
 * value is bound to one DSN for its whole life.
 */

type Entry = { client: PrismaClient; lastUsed: number; tier: string }

const MAX_CLIENTS = Number(process.env.TENANT_CLIENT_CACHE ?? 25)

const globalForTenant = globalThis as unknown as { tenantClients?: Map<number, Entry> }
const cache: Map<number, Entry> = globalForTenant.tenantClients ?? new Map()
if (process.env.NODE_ENV !== 'production') globalForTenant.tenantClients = cache

export class OrgUnavailableError extends Error {
  constructor(public readonly orgId: number, message: string) {
    super(message)
    this.name = 'OrgUnavailableError'
  }
}

async function evictIfNeeded() {
  if (cache.size < MAX_CLIENTS) return
  const oldest = [...cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
  if (!oldest) return
  cache.delete(oldest[0])
  await oldest[1].client.$disconnect().catch(() => {})
}

export async function tenantDb(orgId: number): Promise<PrismaClient> {
  const hit = cache.get(orgId)
  if (hit) {
    hit.lastUsed = Date.now()
    return hit.client
  }

  const org = await controlDb.org.findUnique({
    where: { id: orgId },
    include: { environment: true },
  })
  if (!org) throw new OrgUnavailableError(orgId, 'Org not found')
  if (!org.environment) throw new OrgUnavailableError(orgId, 'Org has no environment yet')
  if (org.status !== 'ACTIVE') {
    throw new OrgUnavailableError(orgId, `Org is ${org.status.toLowerCase()}`)
  }

  const dsn = decryptMaster(org.environment.dsnEncrypted)
  const env = org.environment

  // SCHEMA tier: every connection is pinned to the org's own schema. The role
  // has USAGE on that schema only and no rights on `public`, so search_path is
  // ergonomics — the grant is the boundary.
  await evictIfNeeded()

  const client = new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString: dsn,
        max: env.poolSize,
        // Belt and braces: the role's search_path is set at provision time,
        // this pins it on every connection in the pool as well.
        ...(env.tier === 'SCHEMA' && env.schemaName
          ? { options: `-c search_path="${env.schemaName}"` }
          : {}),
      },
      env.tier === 'SCHEMA' && env.schemaName ? { schema: env.schemaName } : undefined,
    ),
  })

  cache.set(orgId, { client, lastUsed: Date.now(), tier: env.tier })
  return client
}

/** Drop a cached client — call after migrating, suspending or destroying an org. */
export async function releaseTenantDb(orgId: number) {
  const entry = cache.get(orgId)
  if (!entry) return
  cache.delete(orgId)
  await entry.client.$disconnect().catch(() => {})
}

export async function releaseAllTenantDbs() {
  const entries = [...cache.values()]
  cache.clear()
  await Promise.all(entries.map((e) => e.client.$disconnect().catch(() => {})))
}

export type TenantClient = PrismaClient
