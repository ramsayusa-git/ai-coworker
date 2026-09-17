-- Row-level security, as a migration.
--
-- Until now RLS lived only in scripts/reapply-rls.sql, run by hand. Nothing in the
-- migration chain switched it on, so a fresh install — including every self-hosted and
-- on-prem deployment — came up with row isolation silently OFF until somebody remembered
-- to run that script. The `row` isolation tier depends entirely on these policies, so
-- they belong in the migrations where they cannot be skipped.
--
-- Two changes beyond lifting the script verbatim:
--
-- 1. `licenses` is org-scoped (it has org_id) but was missing from the list, so licence
--    rows were readable across orgs. Added.
--
-- 2. The old policy read:
--        org_id::text = current_setting('app.current_org_id', true)
--        OR coalesce(current_setting('app.current_org_id', true), '') = ''
--    That second clause makes RLS a no-op whenever the GUC is unset — so ANY query that
--    forgets withOrgDb silently gets unrestricted access to every org's rows. The escape
--    hatch is still needed (seeds, migrations and platform-admin routes legitimately read
--    across orgs), but "nobody set the variable" is the wrong trigger for it: that is
--    exactly the shape of the bug it should be catching. It is now an explicit opt-in,
--    app.bypass_rls, which unscoped code must set deliberately.

CREATE OR REPLACE FUNCTION app_current_org() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.current_org_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_rls_bypassed() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on'
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bots','campaign_recipients','campaign_steps','campaigns','canned_responses',
    'channels','contacts','conversation_notes','conversations','invites','messages',
    -- org_members is deliberately NOT here. It is the authentication lookup table: login
    -- resolves a user's membership BEFORE any org context exists, so a policy requiring
    -- app.current_org_id would be circular and would 401 every sign-in. It sits with
    -- users/refresh_tokens as a platform table, and its queries are scoped by user_id.
    'saved_views','team_members','teams','templates',
    'automation_rules','ad_campaigns','social_posts',
    'companies','tasks','pipelines','pipeline_stages','deals',
    'flows','flow_responses','wallet_transactions','conversation_charges',
    -- api_keys is excluded for the same reason as org_members and licenses: the public API
    -- authenticates by key hash and derives the org FROM that row, so the lookup happens
    -- before any org context exists. All three are credential-lookup tables, and RLS
    -- cannot guard the very query that establishes which org is current.
    'webhook_endpoints','webhook_deliveries','dashboard_layouts',
    'tickets','ticket_events','ticket_rules','lead_scoring_rules','distribution_rules',
    'quotes','quote_items','appointments','surveys','survey_responses'
    -- `licenses` is deliberately NOT here either, for the same class of reason as
    -- org_members. A licence is verified and activated with NO session — an offline
    -- self-hosted or on-prem instance authenticates by presenting the key itself, which is
    -- looked up by key hash. There is no app.current_org_id to scope that query by, so an
    -- org policy here would break the offline-activation flow those editions depend on.
    -- The key hash is the credential; RLS is the wrong control for it.
  ]
  LOOP
    -- Skip tables that do not exist yet in this database rather than failing the whole
    -- migration: a partially-built database should still get policies on what it has.
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'skipping %, table not present', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE so the policy applies to the table owner too — without it the application's
    -- own role, which usually owns these tables, is exempt and RLS protects nothing.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id::text = app_current_org() OR app_rls_bypassed())',
      t
    );
  END LOOP;
END $$;

-- Credential-lookup tables. Existing databases may have these under the old permissive
-- policy; now that the policy is strict, leaving them enabled would 401 every login and
-- break offline licence activation, so they are explicitly reverted to platform tables
-- rather than merely omitted from the list above.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_members', 'api_keys', 'licenses', 'license_activations']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
      EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION app_current_org() IS
  'The org scoping the current transaction, or NULL. Set by withOrgDb via app.current_org_id.';
COMMENT ON FUNCTION app_rls_bypassed() IS
  'True only when app.bypass_rls is explicitly set to ''on'' — seeds, migrations and platform-admin paths. An unset GUC does NOT bypass RLS.';
