-- Re-applies FORCE ROW LEVEL SECURITY + the org_isolation policy to every org-scoped table.
-- MUST be run after every `drizzle-kit push` — pushes have been observed repeatedly (not a
-- one-off) to reset relrowsecurity to false on ALL tables in the database, not just the ones
-- being altered. Run: PGPASSWORD=<pw> psql -U whatsup -h localhost -d whatsup -f this-file
-- Then verify: select relname, relrowsecurity, relforcerowsecurity from pg_class
--   where relnamespace='public'::regnamespace and relkind='r' order by relname;
-- Every org-scoped table below must show relrowsecurity=t; the platform-level tables
-- (orgs, partners, partner_members, partner_invites, users, refresh_tokens) intentionally
-- stay unscoped.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bots','campaign_recipients','campaign_steps','campaigns','canned_responses',
    'channels','contacts','conversation_notes','conversations','invites','messages',
    'org_members','saved_views','team_members','teams','templates',
    'automation_rules','ad_campaigns','social_posts',
    'companies','tasks','pipelines','pipeline_stages','deals',
    'flows','flow_responses','wallet_transactions','conversation_charges',
    'webhook_endpoints','webhook_deliveries','api_keys','dashboard_layouts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS org_isolation ON %I; CREATE POLICY org_isolation ON %I USING (org_id::text = current_setting(''app.current_org_id'', true) OR coalesce(current_setting(''app.current_org_id'', true), '''') = '''')',
      t, t
    );
  END LOOP;
END $$;
