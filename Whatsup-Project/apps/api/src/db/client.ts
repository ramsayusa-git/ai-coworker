import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema.js";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

// Runs `fn` inside a transaction with the RLS GUC (app.current_org_id) set for its duration.
// Every route handler under /v1/orgs/:orgId/* must use this instead of the top-level `db`
// so a bug in a query's WHERE clause can never leak another org's rows — Postgres enforces
// it via the org_isolation policy regardless of what the query asks for.
export async function withOrgDb<T>(orgId: string, fn: (scopedDb: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx as unknown as typeof db);
  });
}
