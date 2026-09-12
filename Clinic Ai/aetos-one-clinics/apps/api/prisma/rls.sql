-- Row-level security: run after `prisma migrate deploy`.
-- Binds every tenant-scoped table to the `app.current_org_id` session variable,
-- which the API sets per-request from the validated JWT's org claim (see
-- apps/api/src/tenancy/tenant.middleware.ts). This is a belt-and-braces backstop —
-- application code always filters by locationId/organizationId too.

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_locations ON locations
  USING (organization_id::text = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation_users ON users
  USING (organization_id::text = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation_patients ON patients
  USING (location_id IN (
    SELECT id FROM locations WHERE organization_id::text = current_setting('app.current_org_id', true)
  ));

CREATE POLICY tenant_isolation_appointments ON appointments
  USING (location_id IN (
    SELECT id FROM locations WHERE organization_id::text = current_setting('app.current_org_id', true)
  ));

CREATE POLICY tenant_isolation_encounters ON encounters
  USING (location_id IN (
    SELECT id FROM locations WHERE organization_id::text = current_setting('app.current_org_id', true)
  ));

CREATE POLICY tenant_isolation_invoices ON invoices
  USING (location_id IN (
    SELECT id FROM locations WHERE organization_id::text = current_setting('app.current_org_id', true)
  ));

CREATE POLICY tenant_isolation_addons ON addon_installations
  USING (organization_id::text = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation_audit ON audit_log
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- Branding needs an extra "public read by domain" allowance because the login
-- page must resolve a clinic's theme *before* the visitor has a session/JWT.
CREATE POLICY tenant_isolation_branding ON branding
  USING (
    organization_id::text = current_setting('app.current_org_id', true)
    OR current_setting('app.public_domain_lookup', true) = 'true'
  );
