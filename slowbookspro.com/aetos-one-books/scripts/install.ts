/**
 * Install / bootstrap CLI.
 *
 *   npm run install:app -- --org main --name "My Company" --admin admin --password secret
 *
 * Creates (or repairs) the control plane, provisions the org's isolated
 * environment at the configured tier, migrates and seeds it, and creates the
 * first user. Safe to re-run: every step is idempotent.
 */
import 'dotenv/config'
import { controlDb } from '../src/lib/control-db'
import { provisionOrg } from '../src/server/provisioning'
import { hashPassword } from '../src/server/auth'
import { seedTenant } from '../src/server/seed-tenant'
import { tenantDb } from '../src/lib/tenant-db'
import { env } from '../src/lib/env'
import type { IsolationTier } from '../src/generated/control/client'

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

async function main() {
  const slug = arg('org', env.singleOrgSlug)!
  const name = arg('name', env.singleOrgName)!
  const username = (arg('admin', 'admin') ?? 'admin').toLowerCase()
  const password = arg('password', 'changeme')!
  const tier = arg('tier') as IsolationTier | undefined
  const currency = arg('currency', 'USD')!

  console.log(`\n▸ Provisioning org "${name}" (${slug})`)
  const org = await provisionOrg({
    slug,
    name,
    tier,
    baseCurrency: currency,
    createdBy: 'install-cli',
  })
  const environment = await controlDb.orgEnvironment.findUnique({ where: { orgId: org.id } })
  console.log(`  tier      ${environment?.tier}`)
  console.log(`  database  ${environment?.databaseName}${environment?.schemaName ? `.${environment.schemaName}` : ''}`)
  console.log(`  storage   ${environment?.storageRoot}`)

  console.log('▸ Seeding chart of accounts and settings')
  const db = await tenantDb(org.id)
  const seeded = await seedTenant(db, { companyName: name, baseCurrency: currency })
  console.log(`  accounts  ${seeded.accounts} created`)

  console.log(`▸ Creating user "${username}"`)
  const user = await controlDb.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      displayName: username,
      passwordHash: await hashPassword(password),
      isPlatformAdmin: true,
    },
  })
  await controlDb.membership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: { role: 'OWNER', isActive: true },
    create: { userId: user.id, orgId: org.id, role: 'OWNER', invitedBy: 'install-cli' },
  })

  console.log(`\n✓ Ready. Sign in at ${env.appUrl} as ${username}\n`)
  await controlDb.$disconnect()
  process.exit(0)
}

main().catch((error) => {
  console.error('\n✗ Install failed:', error)
  process.exit(1)
})
