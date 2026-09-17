import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema.js";
import { orgs } from "./schema.js";
import { resolveTenant, assertSafeSchemaName, type Isolation, type TenantRoute } from "./tenancy.js";

// RLS bypass, for the paths that legitimately read across orgs: seed scripts, migration
// helpers and offline tooling. It is a connection-level setting rather than something
// sprinkled through call sites, so request-serving code cannot reach for it by accident —
// the API server never sets RLS_BYPASS, and a process that does is not serving requests.
//
// Without this, the org_isolation policy (migration 0004) correctly matches zero rows for
// any query that has not gone through withOrgDb.
const bypassRls = process.env.RLS_BYPASS === "on";

const client = postgres(process.env.DATABASE_URL!, {
  connection: bypassRls ? { "app.bypass_rls": "on" } : {},
});
export const db = drizzle(client, { schema });

// Where an org's isolation settings are looked up. Cached because it is read on every
// org-scoped request and changes only when an org is provisioned or migrated between
// tiers. `invalidateTenantRoute` is called by the provisioning code on both.
const routeCache = new Map<string, TenantRoute>();

export function invalidateTenantRoute(orgId: string) {
  routeCache.delete(orgId);
}

// True once any org in this deployment is on a tier above `row`. Until then every
// withOrgDb call would otherwise pay for a routing lookup on a SEPARATE connection before
// its own transaction even opens — a latency tax on every org-scoped request, and under
// load a second connection held per in-flight request, which is its own failure mode.
// Most deployments never leave `row`, so the lookup is skipped until it can matter.
let anyTenantProvisioned: boolean | null = null;

export function markTenantProvisioned() {
  anyTenantProvisioned = true;
}

async function anyNonRowTenant(): Promise<boolean> {
  if (anyTenantProvisioned !== null) return anyTenantProvisioned;
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(orgs).where(sql`${orgs.isolation} <> 'row'`);
  anyTenantProvisioned = Number(row?.n ?? 0) > 0;
  return anyTenantProvisioned;
}

async function tenantRoute(orgId: string): Promise<TenantRoute> {
  const cached = routeCache.get(orgId);
  if (cached) return cached;

  const [row] = await db.select({
    isolation: orgs.isolation,
    dbSchemaName: orgs.dbSchemaName,
    dbSecretRef: orgs.dbSecretRef,
  }).from(orgs).where(eq(orgs.id, orgId)).limit(1);

  // An unknown org gets row isolation: RLS then matches zero rows, which is the correct
  // answer for an org that does not exist.
  const route: TenantRoute = {
    orgId,
    isolation: (row?.isolation as Isolation) ?? "row",
    schemaName: row?.dbSchemaName,
    secretRef: row?.dbSecretRef,
  };
  routeCache.set(orgId, route);
  return route;
}

// Runs `fn` inside a transaction scoped to one org.
//
// Every route handler under /v1/orgs/:orgId/* must use this instead of the top-level `db`.
// Two things happen here, and both matter:
//
//  1. The RLS GUC (app.current_org_id) is set for the transaction, so a bug in a query's
//     WHERE clause can never leak another org's rows — Postgres enforces it via the
//     org_isolation policy regardless of what the query asks for.
//  2. The org's isolation tier decides WHICH database and schema the transaction runs
//     against: shared (row), own schema, or own database. RLS is applied in every tier,
//     so stronger isolation is defence in depth rather than a replacement for it.
export async function withOrgDb<T>(orgId: string, fn: (scopedDb: typeof db) => Promise<T>): Promise<T> {
  // Fast path: while every org in this deployment is on `row` isolation there is nothing
  // to route, so the transaction opens immediately on the shared pool.
  if (!(await anyNonRowTenant())) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      return fn(tx as unknown as typeof db);
    });
  }

  const route = await tenantRoute(orgId);
  const { db: target, searchPath } = await resolveTenant(route, db);

  return (target as typeof db).transaction(async (tx) => {
    if (searchPath) {
      // set_config's third argument (is_local) scopes this to the transaction, so a
      // pooled connection never carries one tenant's search_path into another's query.
      await tx.execute(sql`SELECT set_config('search_path', ${assertSafeSchemaName(searchPath) + ", public"}, true)`);
    }
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx as unknown as typeof db);
  });
}
