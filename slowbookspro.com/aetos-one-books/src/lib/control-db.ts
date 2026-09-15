import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/control/client'
import { env } from './env'

/**
 * Control-plane client. One per process — it serves every request, holds no
 * business data, and is the only client allowed to read org credentials.
 */
const globalForControl = globalThis as unknown as { controlDb?: PrismaClient }

export const controlDb =
  globalForControl.controlDb ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.controlDatabaseUrl }),
  })

if (process.env.NODE_ENV !== 'production') globalForControl.controlDb = controlDb
