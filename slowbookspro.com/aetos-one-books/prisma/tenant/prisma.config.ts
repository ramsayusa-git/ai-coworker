import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Tenant schema config. TENANT_DATABASE_URL points at ONE org environment —
 * the provisioner sets it per org and runs `prisma migrate deploy` with this
 * config, so every org database (or schema, at SCHEMA tier) gets the same
 * migration history.
 */
export default defineConfig({
  schema: path.join(__dirname, 'schema.prisma'),
  migrations: { path: path.join(__dirname, 'migrations') },
  datasource: {
    url: process.env.TENANT_DATABASE_URL,
  },
})
