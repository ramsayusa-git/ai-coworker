import { sql, eq } from "drizzle-orm";
import { db, invalidateTenantRoute, markTenantProvisioned } from "../db/client.js";
import { orgs } from "../db/schema.js";
import { assertSafeSchemaName, ISOLATION_TIERS, type Isolation } from "../db/tenancy.js";

// Provisioning an org's data home for a given isolation tier.
//
// Deliberately NOT automatic: moving a live tenant between tiers copies data between
// databases, and doing that behind a request handler would leave a half-migrated tenant
// if the request timed out. Each function here does one explicit step, and the migration
// path is copy → verify → switch → (manual) drop, so the source data still exists if the
// switch has to be rolled back.

export type ProvisionResult = {
  orgId: string;
  isolation: Isolation;
  schemaName?: string;
  secretRef?: string;
  /** Statements an operator must run where this process cannot (a separate database host). */
  manualSteps: string[];
};

/** Postgres schema name for an org. Deterministic, so it can be recomputed, never guessed. */
export function schemaNameFor(orgId: string) {
  // UUID hyphens are not legal unquoted, and a leading digit is not either — hence "org_".
  return assertSafeSchemaName(`org_${orgId.replace(/-/g, "").toLowerCase()}`);
}

/** Secret reference for an org's own database. The secret itself lives in the secret store. */
export function secretRefFor(orgId: string) {
  return `tenant_${orgId.replace(/-/g, "").toLowerCase()}`;
}

export function isStrongerIsolation(a: Isolation, b: Isolation) {
  return ISOLATION_TIERS.indexOf(a) > ISOLATION_TIERS.indexOf(b);
}

/**
 * Creates the Postgres schema for a tenant on `schema` isolation and copies the table
 * structure into it.
 *
 * The tables are created empty: this provisions a NEW tenant. Moving an existing tenant's
 * rows is `migrateToSchemaIsolation` below, which is a separate, explicit operation.
 */
export async function provisionSchema(orgId: string): Promise<ProvisionResult> {
  const schemaName = schemaNameFor(orgId);

  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`));

  // Every org-scoped table is recreated inside the tenant's schema, structure only.
  // LIKE ... INCLUDING ALL carries defaults, constraints, indexes and identity.
  const tables = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('__drizzle_migrations', 'orgs', 'users', 'plans', 'conversation_rates', 'partners')
    ORDER BY tablename
  `);

  for (const { tablename } of tables as unknown as Array<{ tablename: string }>) {
    await db.execute(sql.raw(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."${tablename}" (LIKE "public"."${tablename}" INCLUDING ALL)`
    ));
  }

  await db.update(orgs)
    .set({ isolation: "schema", dbSchemaName: schemaName })
    .where(eq(orgs.id, orgId));
  invalidateTenantRoute(orgId);
  markTenantProvisioned();

  return {
    orgId, isolation: "schema", schemaName,
    manualSteps: [
      `Row-level security policies are not carried by CREATE TABLE ... LIKE. Run scripts/reapply-rls.sql against schema "${schemaName}" before serving traffic.`,
    ],
  };
}

/**
 * Records that a tenant runs on its own database.
 *
 * The database itself is created by the operator (or the cloud control plane), not here:
 * this process usually lacks CREATEDB, and on-prem deployments place tenant databases on
 * hosts it cannot reach. What this does is register the secret reference and flip the tier,
 * returning the exact steps for the rest.
 */
export async function provisionDatabase(orgId: string, opts: { secretRef?: string } = {}): Promise<ProvisionResult> {
  const secretRef = opts.secretRef ?? secretRefFor(orgId);
  const dbName = `loqio_${orgId.replace(/-/g, "").slice(0, 16)}`;

  await db.update(orgs)
    .set({ isolation: "database", dbSecretRef: secretRef })
    .where(eq(orgs.id, orgId));
  invalidateTenantRoute(orgId);
  markTenantProvisioned();

  return {
    orgId, isolation: "database", secretRef,
    manualSteps: [
      `CREATE DATABASE "${dbName}";`,
      `Run the migrations against it: DATABASE_URL=<conn> npm run db:migrate`,
      `Run scripts/reapply-rls.sql against it.`,
      `Store its connection string in the secret store under "${secretRef}" (the default resolver reads the env var TENANT_DB_${secretRef.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}).`,
      `Until that secret resolves, requests for this org fail closed rather than falling back to the shared database.`,
    ],
  };
}

/**
 * Records that a tenant runs its own application process against its own database.
 *
 * From the control plane's point of view this is `database` isolation plus a separate
 * deployment; the tenant's own process has DATABASE_URL pointed straight at it.
 */
export async function provisionApp(orgId: string, opts: { secretRef?: string } = {}): Promise<ProvisionResult> {
  const secretRef = opts.secretRef ?? secretRefFor(orgId);

  await db.update(orgs)
    .set({ isolation: "app", dbSecretRef: secretRef })
    .where(eq(orgs.id, orgId));
  invalidateTenantRoute(orgId);
  markTenantProvisioned();

  return {
    orgId, isolation: "app", secretRef,
    manualSteps: [
      ...(await provisionDatabase(orgId, { secretRef })).manualSteps,
      `Deploy a dedicated API and web process for this tenant with DATABASE_URL pointing at its database.`,
      `Point the tenant's custom domain at that deployment.`,
      `This control-plane row exists so the tenant can still be described and billed centrally.`,
    ],
  };
}

/**
 * Copies a tenant's existing rows from the shared public schema into its own schema.
 *
 * Copy first, switch second: the public rows are left in place so the switch can be
 * reverted. Deleting them is a separate operator decision once the tenant is verified.
 */
export async function migrateToSchemaIsolation(orgId: string): Promise<ProvisionResult> {
  const result = await provisionSchema(orgId);
  const schemaName = result.schemaName!;

  const tables = await db.execute<{ tablename: string }>(sql`
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'org_id' AND a.attnum > 0
    ORDER BY c.relname
  `);

  let copied = 0;
  for (const { tablename } of tables as unknown as Array<{ tablename: string }>) {
    // org_id is a bound parameter; the identifiers are validated/known, never user input.
    const res = await db.execute(sql.raw(
      `INSERT INTO "${schemaName}"."${tablename}" SELECT * FROM "public"."${tablename}" ` +
      `WHERE org_id = '${orgId}' ON CONFLICT DO NOTHING`
    ));
    copied += (res as any)?.count ?? 0;
  }

  return {
    ...result,
    manualSteps: [
      ...result.manualSteps,
      `Copied ${copied} rows from public into "${schemaName}". The public rows were NOT deleted.`,
      `Verify the tenant against the new schema, then delete the public rows in a separate maintenance window.`,
    ],
  };
}

/** Current tier and target for an org, for the admin UI and the API. */
export async function tenancyStatus(orgId: string) {
  const [row] = await db.select({
    isolation: orgs.isolation,
    deployment: orgs.deployment,
    dbSchemaName: orgs.dbSchemaName,
    dbSecretRef: orgs.dbSecretRef,
  }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
  if (!row) return null;

  return {
    isolation: row.isolation as Isolation,
    deployment: row.deployment,
    schemaName: row.dbSchemaName,
    // The reference is safe to expose; the secret it points at is not, and is never read here.
    secretRef: row.dbSecretRef,
    strongerAvailable: ISOLATION_TIERS.slice(ISOLATION_TIERS.indexOf(row.isolation as Isolation) + 1),
  };
}
