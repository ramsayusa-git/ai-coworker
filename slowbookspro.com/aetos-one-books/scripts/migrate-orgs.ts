/** Fleet upgrade: apply the tenant migration history to every org environment. */
import 'dotenv/config'
import { migrateAllOrgs } from '../src/server/provisioning'
import { controlDb } from '../src/lib/control-db'

const results = await migrateAllOrgs()
for (const r of results) {
  console.log(r.ok ? `✓ org ${r.orgId}` : `✗ org ${r.orgId}: ${r.error}`)
}
await controlDb.$disconnect()
process.exit(results.every((r) => r.ok) ? 0 : 1)
