-- Tenant isolation tiers.
--
-- Until now every org shared one schema in one database and was separated by Postgres RLS
-- alone (row isolation). Enterprise and on-prem buyers routinely require stronger physical
-- separation, so an org now records which tier it runs at and how to reach its data.
--
-- The tiers are cumulative, not alternatives: schema/database/app all still run RLS
-- underneath, so a routing misconfiguration degrades to row isolation rather than to none.
--
--   row      shared schema, shared database (the existing behaviour, and the default)
--   schema   shared database, own Postgres schema
--   database own database, own connection pool
--   app      own database AND own API/web process
--
-- db_secret_ref names a secret in the deployment's secret store. A connection string is
-- deliberately NOT stored here: reading this table (or a leaked backup of it) must not
-- yield credentials for every other tenant.

ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "isolation" text NOT NULL DEFAULT 'row';
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "db_schema_name" text;
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "db_secret_ref" text;

-- Only the four known tiers are storable; an unrecognised value would silently route a
-- tenant somewhere unintended.
ALTER TABLE "orgs" DROP CONSTRAINT IF EXISTS "orgs_isolation_check";
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_isolation_check"
  CHECK ("isolation" IN ('row', 'schema', 'database', 'app'));

-- A tenant on schema isolation without a schema name, or on database isolation without a
-- secret reference, is a provisioning bug. The database refuses the half-configured state
-- rather than letting the application discover it at request time.
ALTER TABLE "orgs" DROP CONSTRAINT IF EXISTS "orgs_isolation_target_check";
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_isolation_target_check" CHECK (
  ("isolation" = 'row')
  OR ("isolation" = 'schema'   AND "db_schema_name" IS NOT NULL)
  OR ("isolation" IN ('database', 'app') AND "db_secret_ref" IS NOT NULL)
);

-- on_prem joins hosted | self_hosted | dedicated as a deployment target.
COMMENT ON COLUMN "orgs"."deployment" IS 'hosted | on_prem | self_hosted | dedicated';
COMMENT ON COLUMN "orgs"."isolation" IS 'row | schema | database | app — see 0003_tenant_isolation.sql';
