-- Row-level security: run after `prisma migrate deploy`.
-- Binds every tenant-scoped table to the `app.current_org_id` session variable,
-- which the API sets per-request from the validated JWT's org claim (see
-- apps/api/src/tenancy/tenant.middleware.ts). This is a belt-and-braces backstop —
-- application code always filters by locationId/organizationId too.
--
-- Column names are quoted camelCase because Prisma creates columns matching the
-- schema.prisma field names verbatim (only table names are snake_case via @@map).

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_locations ON locations
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation_users ON users
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation_patients ON patients
  USING ("locationId" IN (
    SELECT id FROM locations WHERE "organizationId" = current_setting('app.current_org_id', true)
  ));

CREATE POLICY tenant_isolation_appointments ON appointments
  USING ("locationId" IN (
    SELECT id FROM locations WHERE "organizationId" = current_setting('app.current_org_id', true)
  ));

CREATE POLICY tenant_isolation_encounters ON encounters
  USING ("locationId" IN (
    SELECT id FROM locations WHERE "organizationId" = current_setting('app.current_org_id', true)
  ));

CREATE POLICY tenant_isolation_invoices ON invoices
  USING ("locationId" IN (
    SELECT id FROM locations WHERE "organizationId" = current_setting('app.current_org_id', true)
  ));

CREATE POLICY tenant_isolation_addons ON addon_installations
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation_audit ON audit_log
  USING ("organizationId" = current_setting('app.current_org_id', true));

-- Branding needs an extra "public read by domain" allowance because the login
-- page must resolve a clinic's theme *before* the visitor has a session/JWT —
-- covers lookups by both customDomain (reseller white-label) and subdomain
-- (the free "<slug>.aetosone.clinics" every clinic gets by default).
CREATE POLICY tenant_isolation_branding ON branding
  USING (
    "organizationId" = current_setting('app.current_org_id', true)
    OR current_setting('app.public_domain_lookup', true) = 'true'
  );

-- Visit templates: a clinic sees its own custom templates plus every
-- built-in template (organizationId IS NULL), same "global + org-owned"
-- shape as arogyam.ai's 1-click visit templates.
CREATE POLICY tenant_isolation_visit_templates ON visit_templates
  USING (
    "organizationId" = current_setting('app.current_org_id', true)
    OR "organizationId" IS NULL
  );
