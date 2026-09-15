import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Control-plane schema config (default target of `npx prisma ...`).
 * The tenant schema has its own config: prisma/tenant/prisma.config.ts
 */
export default defineConfig({
  schema: path.join('prisma', 'control', 'schema.prisma'),
  migrations: { path: path.join('prisma', 'control', 'migrations') },
  datasource: {
    url: process.env.CONTROL_DATABASE_URL,
  },
})
