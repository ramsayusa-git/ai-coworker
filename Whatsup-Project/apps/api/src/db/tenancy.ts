import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// Tenant isolation tiers, weakest to strongest. Each is a superset of the one above:
// schema/database/app all still run RLS underneath, so a misconfiguration degrades to
// row-level isolation rather than to none.
export type Isolation = "row" | "schema" | "database" | "app";

export const ISOLATION_TIERS: Isolation[] = ["row", "schema", "database", "app"];

export type TenantRoute = {
  orgId: string;
  isolation: Isolation;
  /** Postgres schema to put on search_path. Only for isolation = "schema". */
  schemaName?: string | null;
  /** Name of a secret holding this tenant's connection string. Never the string itself. */
  secretRef?: string | null;
};

type Pool = { client: postgres.Sql; db: ReturnType<typeof drizzle> };

// One pool per distinct connection string. A tenant on `database` isolation gets its own
// pool; every `row`/`schema` tenant shares the control-plane pool, because they are all
// in the same database and opening a pool per org would exhaust Postgres connections.
const pools = new Map<string, Pool>();

function poolFor(connectionString: string): Pool {
  const existing = pools.get(connectionString);
  if (existing) return existing;
  // max is deliberately small: with database-per-tenant the process may hold pools for
  // many tenants at once, and Postgres caps total connections server-wide.
  const client = postgres(connectionString, { max: Number(process.env.TENANT_POOL_MAX ?? 4) });
  const pool = { client, db: drizzle(client, { schema }) };
  pools.set(connectionString, pool);
  return pool;
}

/**
 * Resolves a tenant's connection string from its secret reference.
 *
 * Connection strings are NEVER stored in the orgs table — that table holds only a
 * reference, so a database read (or a leaked backup) cannot yield credentials for every
 * other tenant. The default resolver reads an environment variable, which is what a
 * self-hosted or on-prem operator injects from their own secret manager (Docker secrets,
 * Kubernetes secrets, Vault). Hosted deployments override this with a real client.
 */
export type SecretResolver = (secretRef: string) => Promise<string | undefined>;

let resolveSecret: SecretResolver = async (ref) => {
  // Reference "tenant_acme" reads TENANT_DB_ACME. Uppercased, non-alphanumerics to "_",
  // so a reference can never be coerced into reading an unrelated variable.
  const key = `TENANT_DB_${ref.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
  return process.env[key];
};

export function setSecretResolver(fn: SecretResolver) {
  resolveSecret = fn;
}

/** A Postgres identifier we are willing to interpolate into SET search_path. */
const SAFE_IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

export function assertSafeSchemaName(name: string): string {
  // search_path cannot be parameterised, so the value is interpolated — it must therefore
  // be validated against a strict allowlist rather than escaped.
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`Unsafe schema name for tenant routing: ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * Returns the Drizzle handle a tenant's queries should run against, plus the schema to
 * pin on search_path for the transaction.
 *
 * - row      → the shared control-plane db, RLS only
 * - schema   → the shared db, with search_path pinned to the tenant's schema
 * - database → the tenant's own pool
 * - app      → the tenant runs its own process against its own database; when this
 *              process IS that app, its DATABASE_URL already points at the tenant, so it
 *              behaves as `database` with no separate secret needed
 */
export async function resolveTenant(
  route: TenantRoute,
  controlPlane: ReturnType<typeof drizzle>
): Promise<{ db: ReturnType<typeof drizzle>; searchPath?: string }> {
  if (route.isolation === "row") return { db: controlPlane };

  if (route.isolation === "schema") {
    if (!route.schemaName) {
      // Failing closed here would take the tenant offline; RLS still isolates them, so
      // this degrades to row-level and is loud in the logs instead.
      console.warn(`[tenancy] org ${route.orgId} is on schema isolation with no schemaName; using row isolation`);
      return { db: controlPlane };
    }
    return { db: controlPlane, searchPath: assertSafeSchemaName(route.schemaName) };
  }

  // database | app
  if (!route.secretRef) {
    if (route.isolation === "app") return { db: controlPlane };
    console.warn(`[tenancy] org ${route.orgId} is on database isolation with no secretRef; using row isolation`);
    return { db: controlPlane };
  }

  const conn = await resolveSecret(route.secretRef);
  if (!conn) {
    throw new Error(
      `Tenant ${route.orgId} is on "${route.isolation}" isolation but secret "${route.secretRef}" could not be resolved. ` +
      `Refusing to fall back to the shared database.`
    );
  }
  return { db: poolFor(conn).db };
}

/** Closes every tenant pool. For tests and graceful shutdown. */
export async function closeTenantPools() {
  await Promise.all([...pools.values()].map((p) => p.client.end({ timeout: 5 })));
  pools.clear();
}

export function tenantPoolCount() {
  return pools.size;
}
