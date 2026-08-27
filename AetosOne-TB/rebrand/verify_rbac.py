#!/usr/bin/env python3
"""Prove RBAC Phase 2 enforcement, and that it stays opt-in.

There is no REST API for groups/roles yet (Phase 4), so the group, role and grant are
seeded directly with SQL. The user under test gets a GENERIC role granting only
DEVICE:READ, and we assert:

  1. an ungranted user is completely unaffected (the opt-in property)
  2. the granted user can read devices
  3. the granted user is denied a resource the role does not mention
  4. the granted user is denied an operation the role does not mention
"""
import json
import subprocess
import time
import urllib.error
import urllib.request

API = "http://localhost:8080"
# must exceed UserPermissionsService.CACHE_TTL_MS
CACHE_TTL_SECONDS = 65
LIMITED_EMAIL = "limited@thingsboard.test"
LIMITED_PASSWORD = "limited12345"


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read()
            if not payload:
                return 200, None
            try:
                return 200, json.loads(payload)
            except json.JSONDecodeError:
                return 200, payload.decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


def login(user, pw):
    status, body = call("POST", "/api/auth/login", body={"username": user, "password": pw})
    if status != 200:
        raise SystemExit(f"login {user} failed: {status} {body}")
    return body["token"]


def psql(sql):
    result = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-d", "thingsboard", "-tAc", sql],
        capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"psql failed: {result.stderr[:300]}")
    return result.stdout.strip()


def main():
    sys_token = login("sysadmin@aetosiot.com", "sysadmin")
    tenant_token = login("tenant@aetosiot.com", "tenant")

    # the tenant our test user will live in
    status, me = call("GET", "/api/auth/user", tenant_token)
    tenant_uuid = me["tenantId"]["id"]

    # a second user in that tenant, with no grants yet
    status, users = call("GET", f"/api/tenant/{tenant_uuid}/users?pageSize=200&page=0", sys_token)
    user = next((u for u in users["data"] if u["email"] == LIMITED_EMAIL), None) if status == 200 else None
    if user is None:
        status, user = call("POST", "/api/user?sendActivationMail=false", sys_token, {
            "tenantId": {"entityType": "TENANT", "id": tenant_uuid},
            "authority": "TENANT_ADMIN",
            "email": LIMITED_EMAIL,
            "firstName": "Limited",
            "lastName": "User",
        })
        if status != 200:
            raise SystemExit(f"could not create test user: {status} {user}")
        print(f"created {LIMITED_EMAIL}")

    user_uuid = user["id"]["id"]
    status, _ = call("POST", "/api/auth/login", body={"username": LIMITED_EMAIL, "password": LIMITED_PASSWORD})
    if status != 200:
        _, link = call("GET", f"/api/user/{user_uuid}/activationLink", sys_token)
        call("POST", "/api/noauth/activate?sendActivationMail=false",
             body={"activateToken": link.rsplit("=", 1)[-1].strip(), "password": LIMITED_PASSWORD})
        print("activated test user")

    # --- 0. clear any grant left by an earlier run --------------------------
    # Without this the "before grant" baseline below is measured on a user who is still
    # restricted from last time, and reports a false failure.
    psql(f"""
        DELETE FROM group_permission WHERE user_group_id IN
            (SELECT id FROM entity_group WHERE name = 'RBAC Test Users');
        DELETE FROM entity_group_entity WHERE entity_group_id IN
            (SELECT id FROM entity_group WHERE name = 'RBAC Test Users');
        DELETE FROM entity_group WHERE name = 'RBAC Test Users';
        DELETE FROM role WHERE name = 'RBAC Device Reader';

        -- The migration puts every existing tenant user into "All Users", which is granted
        -- Tenant Administrator (ALL on everything). If this test user is in there, it holds
        -- an admin grant and every "denied" assertion below trivially fails. Detach it: the
        -- whole point is a user whose only permission is the one this test grants.
        DELETE FROM entity_group_entity
        WHERE entity_id = '{user_uuid}' AND entity_type = 'USER';
    """)
    print(f"cleared previous grants; waiting {CACHE_TTL_SECONDS}s for the cache to expire...")
    time.sleep(CACHE_TTL_SECONDS)

    # --- 1. before any grant: behaviour must be unchanged -------------------
    limited_token = login(LIMITED_EMAIL, LIMITED_PASSWORD)
    before_devices, _ = call("GET", "/api/tenant/devices?pageSize=1&page=0", limited_token)
    before_dashboards, _ = call("GET", "/api/tenant/dashboards?pageSize=1&page=0", limited_token)

    # --- seed group, role and grant ----------------------------------------
    psql(f"""
        INSERT INTO entity_group (id, created_time, tenant_id, owner_type, owner_id, type, name, group_all)
        VALUES (gen_random_uuid(), 0, '{tenant_uuid}', 'TENANT', '{tenant_uuid}', 'USER', 'RBAC Test Users', false);

        INSERT INTO role (id, created_time, tenant_id, owner_type, owner_id, name, type, permissions)
        VALUES (gen_random_uuid(), 0, '{tenant_uuid}', 'TENANT', '{tenant_uuid}',
                'RBAC Device Reader', 'GENERIC', '{{"DEVICE":["READ"]}}');

        INSERT INTO entity_group_entity (entity_group_id, entity_id, entity_type, added_time)
        SELECT id, '{user_uuid}', 'USER', 0 FROM entity_group WHERE name = 'RBAC Test Users';

        INSERT INTO group_permission (id, created_time, tenant_id, user_group_id, role_id)
        SELECT gen_random_uuid(), 0, '{tenant_uuid}', g.id, r.id
        FROM entity_group g, role r
        WHERE g.name = 'RBAC Test Users' AND r.name = 'RBAC Device Reader';
    """)
    print("seeded group, role and grant")

    # The "before grant" calls above cached an empty permission set for this user, and a
    # fresh login does not clear it — the cache is keyed by user id, not session. Seeding
    # via SQL also bypasses the services that invalidate explicitly. Wait out the TTL,
    # which is exactly the safety net that case is there for.
    print(f"waiting {CACHE_TTL_SECONDS}s for the permission cache TTL to expire...")
    time.sleep(CACHE_TTL_SECONDS)
    limited_token = login(LIMITED_EMAIL, LIMITED_PASSWORD)

    after_devices, _ = call("GET", "/api/tenant/devices?pageSize=1&page=0", limited_token)
    after_create, _ = call("POST", "/api/device", limited_token, {"name": "rbac-should-fail", "type": "default"})

    # every list endpoint now gated by checkResourcePermission — a device-only role must
    # be denied all of these
    gated = {
        "dashboards": "/api/tenant/dashboards?pageSize=1&page=0",
        "assets": "/api/tenant/assets?pageSize=1&page=0",
        "customers": "/api/customers?pageSize=1&page=0",
        "entity views": "/api/tenant/entityViews?pageSize=1&page=0",
        "rule chains": "/api/ruleChains?pageSize=1&page=0",
        "edges": "/api/tenant/edges?pageSize=1&page=0",
    }
    denied = {name: call("GET", path, limited_token)[0] for name, path in gated.items()}

    # an unrelated user must be untouched by all of this — same endpoints, full access
    other_devices, _ = call("GET", "/api/tenant/devices?pageSize=1&page=0", tenant_token)
    unaffected = {name: call("GET", path, tenant_token)[0] for name, path in gated.items()}

    checks = [
        ("before grant: reads devices (unchanged behaviour)", before_devices, 200),
        ("before grant: reads dashboards (unchanged behaviour)", before_dashboards, 200),
        ("after grant: still reads devices", after_devices, 200),
        ("after grant: denied device create (operation not in role)", after_create, 403),
        ("ungranted user unaffected", other_devices, 200),
    ]
    # Phase 3b: list endpoints are gated on their own resource
    for name, status in denied.items():
        checks.append((f"after grant: denied {name} list", status, 403))
    for name, status in unaffected.items():
        checks.append((f"ungranted user still lists {name}", status, 200))

    failed = 0
    for label, actual, expected in checks:
        ok = actual == expected
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {label}: HTTP {actual}"
              + ("" if ok else f" (expected {expected})"))

    print()
    print("all checks passed" if not failed else f"{failed} check(s) failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
