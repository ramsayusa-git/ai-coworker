import 'server-only'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'pg'
import { controlDb } from '@/lib/control-db'
import { encryptMaster, newOrgDataKey, randomPassword } from '@/lib/crypto'
import { env } from '@/lib/env'
import { releaseTenantDb } from '@/lib/tenant-db'
import type { IsolationTier, Org, OrgEnvironment } from '@/generated/control/client'

const exec = promisify(execFile)

/**
 * Environment provisioning — the piece that makes "one isolated environment per
 * org" real. Every tier runs the SAME tenant migration history; they differ
 * only in where that history is applied and who may connect to it.
 *
 *   SCHEMA      CREATE SCHEMA org_<slug> in the shared database, a role that
 *               owns only that schema, REVOKE on public.
 *   DATABASE    CREATE ROLE + CREATE DATABASE aob_<slug> OWNER that role,
 *               REVOKE CONNECT FROM PUBLIC. (default)
 *   DEDICATED   as DATABASE, plus a ComputeNode row: the org is served by its
 *               own app runtime, and the shared runtime never opens its DB.
 *   SELF_HOSTED the installation is the environment; one org, local database.
 *
 * Promotion between tiers is a dump/restore of one database — no schema change,
 * no application change, because tenant rows carry no org column.
 */

export type ProvisionInput = {
  slug: string
  name: string
  tier?: IsolationTier
  baseCurrency?: string
  timezone?: string
  isNonprofit?: boolean
  createdBy?: string
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export function assertSlug(slug: string) {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      'Org slug must be 3-40 chars, lowercase letters, digits and hyphens, not starting or ending with a hyphen',
    )
  }
}

/** Postgres identifiers derived from the slug. Hyphens are illegal unquoted. */
export function identifiers(slug: string) {
  const safe = slug.replace(/-/g, '_')
  return {
    database: `aob_${safe}`,
    role: `aob_${safe}_owner`,
    schema: `org_${safe}`,
  }
}

function quoteIdent(name: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier: ${name}`)
  return `"${name}"`
}

function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

async function adminClient() {
  if (!env.provisionerDatabaseUrl) {
    throw new Error('PROVISIONER_DATABASE_URL is not set — cannot create environments')
  }
  const client = new Client({ connectionString: env.provisionerDatabaseUrl })
  await client.connect()
  return client
}

async function logStep(jobId: number, step: string, ok: boolean, detail?: string) {
  const job = await controlDb.provisioningJob.findUnique({ where: { id: jobId } })
  const log = Array.isArray(job?.log) ? (job!.log as unknown[]) : []
  await controlDb.provisioningJob.update({
    where: { id: jobId },
    data: { log: [...log, { step, ok, detail, at: new Date().toISOString() }] as never },
  })
}

function dsnFor(opts: {
  host: string
  port: number
  database: string
  role: string
  password: string
  schema?: string | null
}) {
  const base = `postgresql://${encodeURIComponent(opts.role)}:${encodeURIComponent(
    opts.password,
  )}@${opts.host}:${opts.port}/${opts.database}`
  return opts.schema ? `${base}?schema=${encodeURIComponent(opts.schema)}` : base
}

/**
 * Create the org row plus its isolated environment, migrate it and seed it.
 * Idempotent per slug: a FAILED org can be re-provisioned.
 */
export async function provisionOrg(input: ProvisionInput): Promise<Org> {
  assertSlug(input.slug)
  const tier: IsolationTier = input.tier ?? tierFromEnv()
  const ids = identifiers(input.slug)

  const org = await controlDb.org.upsert({
    where: { slug: input.slug },
    update: { name: input.name, status: 'PROVISIONING' },
    create: {
      slug: input.slug,
      name: input.name,
      status: 'PROVISIONING',
      edition: env.mode === 'self-hosted' ? 'SELF_HOSTED' : 'FREE',
      baseCurrency: input.baseCurrency ?? 'USD',
      timezone: input.timezone ?? 'America/Chicago',
      isNonprofit: input.isNonprofit ?? false,
    },
  })

  const job = await controlDb.provisioningJob.create({
    data: {
      orgId: org.id,
      kind: 'CREATE',
      status: 'RUNNING',
      startedAt: new Date(),
      createdBy: input.createdBy ?? 'system',
    },
  })

  try {
    const password = randomPassword()
    const host = env.defaultDbHost
    const port = env.defaultDbPort
    const database = tier === 'SCHEMA' ? env.sharedTenantDatabase : ids.database
    const schema = tier === 'SCHEMA' ? ids.schema : null

    await createPhysicalEnvironment({ tier, ids, password, database, schema, jobId: job.id })

    const dsn = dsnFor({ host, port, database, role: ids.role, password, schema })
    const dataKey = newOrgDataKey()
    const storageRoot = path.resolve(env.storageRoot, input.slug)
    await fs.mkdir(path.join(storageRoot, 'attachments'), { recursive: true })
    await fs.mkdir(path.join(storageRoot, 'backups'), { recursive: true })
    await fs.mkdir(path.join(storageRoot, 'exports'), { recursive: true })
    await logStep(job.id, 'storage', true, storageRoot)

    const environment = await controlDb.orgEnvironment.upsert({
      where: { orgId: org.id },
      update: {
        tier,
        schemaName: schema,
        databaseName: database,
        databaseRole: ids.role,
        dbHost: host,
        dbPort: port,
        dsnEncrypted: encryptMaster(dsn),
        dataKeyWrapped: dataKey.wrapped,
        storageRoot,
      },
      create: {
        orgId: org.id,
        tier,
        schemaName: schema,
        databaseName: database,
        databaseRole: ids.role,
        dbHost: host,
        dbPort: port,
        dsnEncrypted: encryptMaster(dsn),
        dataKeyWrapped: dataKey.wrapped,
        storageRoot,
      },
    })

    await migrateOrg(environment, dsn)
    await logStep(job.id, 'migrate', true)

    await controlDb.brandProfile.upsert({
      where: { orgId: org.id },
      update: {},
      create: {
        orgId: org.id,
        productName: env.brand.productName,
        vendorName: env.brand.vendorName,
        colorPrimary: env.brand.colorPrimary,
      },
    })

    const activated = await controlDb.org.update({
      where: { id: org.id },
      data: { status: 'ACTIVE' },
    })

    await controlDb.provisioningJob.update({
      where: { id: job.id },
      data: { status: 'DONE', finishedAt: new Date() },
    })

    return activated
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await controlDb.provisioningJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: message, finishedAt: new Date() },
    })
    await controlDb.org.update({ where: { id: org.id }, data: { status: 'FAILED' } })
    throw error
  }
}

function tierFromEnv(): IsolationTier {
  if (env.mode === 'self-hosted') return 'SELF_HOSTED'
  switch (env.defaultTier) {
    case 'schema':
      return 'SCHEMA'
    case 'dedicated':
      return 'DEDICATED'
    default:
      return 'DATABASE'
  }
}

async function createPhysicalEnvironment(opts: {
  tier: IsolationTier
  ids: ReturnType<typeof identifiers>
  password: string
  database: string
  schema: string | null
  jobId: number
}) {
  const { tier, ids, password, database, schema, jobId } = opts
  const admin = await adminClient()
  try {
    // The login role is per-org at every tier: credentials are never shared.
    await admin.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(ids.role)}) THEN
           CREATE ROLE ${quoteIdent(ids.role)} LOGIN PASSWORD ${quoteLiteral(password)};
         ELSE
           ALTER ROLE ${quoteIdent(ids.role)} WITH LOGIN PASSWORD ${quoteLiteral(password)};
         END IF;
       END $$;`,
    )
    await logStep(jobId, 'role', true, ids.role)

    if (tier === 'SCHEMA') {
      // Shared database, private schema. The role gets no rights anywhere else.
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
      if (exists.rowCount === 0) {
        await admin.query(`CREATE DATABASE ${quoteIdent(database)}`)
      }
      const shared = new Client({
        connectionString: env.provisionerDatabaseUrl.replace(/\/[^/?]+(\?|$)/, `/${database}$1`),
      })
      await shared.connect()
      try {
        await shared.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema!)} AUTHORIZATION ${quoteIdent(ids.role)}`)
        await shared.query(`REVOKE ALL ON SCHEMA public FROM ${quoteIdent(ids.role)}`)
        await shared.query(`REVOKE ALL ON DATABASE ${quoteIdent(database)} FROM PUBLIC`)
        // CONNECT to reach it, CREATE so `prisma migrate` can create its own
        // schema-qualified objects. The role still has no rights on `public`
        // or on any other org's schema.
        await shared.query(
          `GRANT CONNECT, CREATE ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(ids.role)}`,
        )
        await shared.query(`ALTER ROLE ${quoteIdent(ids.role)} SET search_path TO ${quoteIdent(schema!)}`)
      } finally {
        await shared.end()
      }
      await logStep(jobId, 'schema', true, `${database}.${schema}`)
      return
    }

    // DATABASE / DEDICATED / SELF_HOSTED: a database of its own.
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${quoteIdent(database)} OWNER ${quoteIdent(ids.role)}`)
    }
    await admin.query(`REVOKE ALL ON DATABASE ${quoteIdent(database)} FROM PUBLIC`)
    await admin.query(`GRANT ALL ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(ids.role)}`)
    await logStep(jobId, 'database', true, database)
  } finally {
    await admin.end()
  }
}

/** Apply the tenant migration history to one environment. */
export async function migrateOrg(environment: OrgEnvironment, dsn?: string) {
  const url = dsn ?? (await resolveDsn(environment.orgId))
  await exec(
    'npx',
    ['prisma', 'migrate', 'deploy', '--config', 'prisma/tenant/prisma.config.ts'],
    { env: { ...process.env, TENANT_DATABASE_URL: url }, cwd: process.cwd() },
  )
  await controlDb.orgEnvironment.update({
    where: { id: environment.id },
    data: { lastMigratedAt: new Date() },
  })
  await releaseTenantDb(environment.orgId)
}

/** Migrate every ACTIVE org — the deploy-time fleet upgrade. */
export async function migrateAllOrgs() {
  const environments = await controlDb.orgEnvironment.findMany({
    where: { org: { status: { in: ['ACTIVE', 'SUSPENDED'] } } },
  })
  const results: { orgId: number; ok: boolean; error?: string }[] = []
  for (const environment of environments) {
    try {
      await migrateOrg(environment)
      results.push({ orgId: environment.orgId, ok: true })
    } catch (error) {
      results.push({
        orgId: environment.orgId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

async function resolveDsn(orgId: number) {
  const environment = await controlDb.orgEnvironment.findUnique({ where: { orgId } })
  if (!environment) throw new Error(`Org ${orgId} has no environment`)
  const { decryptMaster } = await import('@/lib/crypto')
  return decryptMaster(environment.dsnEncrypted)
}

/** Dump one org to a file inside its own storage root. */
export async function backupOrg(orgId: number) {
  const environment = await controlDb.orgEnvironment.findUnique({ where: { orgId } })
  if (!environment) throw new Error(`Org ${orgId} has no environment`)
  const dsn = await resolveDsn(orgId)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(environment.storageRoot, 'backups', `${stamp}.dump`)
  const args = ['--format=custom', `--file=${file}`, dsn]
  if (environment.tier === 'SCHEMA' && environment.schemaName) {
    args.unshift(`--schema=${environment.schemaName}`)
  }
  await exec('pg_dump', args)
  await controlDb.orgEnvironment.update({
    where: { id: environment.id },
    data: { lastBackupAt: new Date() },
  })
  return file
}

/** Destroy an org environment. Irreversible; the caller must have confirmed. */
export async function destroyOrg(orgId: number, opts: { keepBackup?: boolean } = {}) {
  const org = await controlDb.org.findUnique({
    where: { id: orgId },
    include: { environment: true },
  })
  if (!org?.environment) throw new Error(`Org ${orgId} has no environment`)
  if (opts.keepBackup !== false) await backupOrg(orgId)
  await releaseTenantDb(orgId)

  const admin = await adminClient()
  try {
    if (org.environment.tier === 'SCHEMA' && org.environment.schemaName) {
      const shared = new Client({
        connectionString: env.provisionerDatabaseUrl.replace(
          /\/[^/?]+(\?|$)/,
          `/${org.environment.databaseName}$1`,
        ),
      })
      await shared.connect()
      try {
        await shared.query(`DROP SCHEMA IF EXISTS ${quoteIdent(org.environment.schemaName)} CASCADE`)
      } finally {
        await shared.end()
      }
    } else {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
        [org.environment.databaseName],
      )
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(org.environment.databaseName)}`)
    }
    await admin.query(`DROP ROLE IF EXISTS ${quoteIdent(org.environment.databaseRole)}`)
  } finally {
    await admin.end()
  }

  await controlDb.org.update({
    where: { id: orgId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  })
}
