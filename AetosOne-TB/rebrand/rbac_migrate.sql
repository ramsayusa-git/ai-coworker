-- Aetos One Cloud — RBAC migration (Phase 6)
--
-- Safe to run repeatedly. Seeds, for every existing tenant:
--   * an "All Users" user group containing that tenant's admins
--   * a built-in "Tenant Administrator" GENERIC role granting ALL on every resource
--   * a grant binding the two
--
-- The point is that after this runs, behaviour is IDENTICAL to before: every existing
-- tenant admin holds a role that permits everything, so no check that used to pass starts
-- failing. RBAC only becomes visible once an administrator narrows a role or creates a
-- group. That property is what makes the change reversible in practice.
--
-- NOTE ON THE "All" GROUP: this deliberately does NOT create implicit "All <type>" entity
-- groups. Those are created lazily by EntityGroupService.findOrCreateAllGroup and their
-- membership is implied by ownership, so materialising them here would create rows that
-- go stale the moment an entity changes owner.

BEGIN;

-- 1. one "All Users" group per tenant
INSERT INTO entity_group (id, created_time, tenant_id, owner_type, owner_id, type, name, group_all)
SELECT gen_random_uuid(),
       (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
       t.id, 'TENANT', t.id, 'USER', 'All Users', false
FROM tenant t
WHERE NOT EXISTS (
    SELECT 1 FROM entity_group g
    WHERE g.owner_type = 'TENANT' AND g.owner_id = t.id AND g.type = 'USER' AND g.name = 'All Users'
);

-- 2. built-in role granting everything, so existing behaviour is preserved exactly
INSERT INTO role (id, created_time, tenant_id, owner_type, owner_id, name, type, permissions)
SELECT gen_random_uuid(),
       (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
       t.id, 'TENANT', t.id, 'Tenant Administrator', 'GENERIC',
       (SELECT jsonb_object_agg(resource, '["ALL"]'::jsonb) FROM (VALUES
            ('ALARM'), ('ASSET'), ('CUSTOMER'), ('DASHBOARD'), ('DEVICE'), ('ENTITY_VIEW'),
            ('RULE_CHAIN'), ('USER'), ('EDGE'), ('WIDGETS_BUNDLE'), ('WIDGET_TYPE'),
            ('DEVICE_PROFILE'), ('ASSET_PROFILE'), ('OTA_PACKAGE'), ('TB_RESOURCE'),
            ('QUEUE'), ('API_USAGE_STATE'), ('NOTIFICATION')
       ) AS r(resource))
FROM tenant t
WHERE NOT EXISTS (
    SELECT 1 FROM role r2
    WHERE r2.owner_type = 'TENANT' AND r2.owner_id = t.id AND r2.name = 'Tenant Administrator'
);

-- 3. every existing tenant admin joins All Users
INSERT INTO entity_group_entity (entity_group_id, entity_id, entity_type, added_time)
SELECT g.id, u.id, 'USER', (EXTRACT(EPOCH FROM now()) * 1000)::bigint
FROM tb_user u
JOIN entity_group g
  ON g.owner_type = 'TENANT' AND g.owner_id = u.tenant_id
 AND g.type = 'USER' AND g.name = 'All Users'
WHERE u.authority = 'TENANT_ADMIN'
  AND NOT EXISTS (
      SELECT 1 FROM entity_group_entity m
      WHERE m.entity_group_id = g.id AND m.entity_id = u.id
  );

-- 4. bind the group to the role
INSERT INTO group_permission (id, created_time, tenant_id, user_group_id, role_id)
SELECT gen_random_uuid(),
       (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
       t.id, g.id, r.id
FROM tenant t
JOIN entity_group g
  ON g.owner_type = 'TENANT' AND g.owner_id = t.id AND g.type = 'USER' AND g.name = 'All Users'
JOIN role r
  ON r.owner_type = 'TENANT' AND r.owner_id = t.id AND r.name = 'Tenant Administrator'
WHERE NOT EXISTS (
    SELECT 1 FROM group_permission gp
    WHERE gp.user_group_id = g.id AND gp.role_id = r.id AND gp.entity_group_id IS NULL
);

COMMIT;

\echo 'RBAC migration complete. Seeded per tenant:'
SELECT (SELECT count(*) FROM entity_group WHERE name = 'All Users') AS all_users_groups,
       (SELECT count(*) FROM role WHERE name = 'Tenant Administrator') AS builtin_roles,
       (SELECT count(*) FROM group_permission) AS grants,
       (SELECT count(*) FROM entity_group_entity) AS memberships;
