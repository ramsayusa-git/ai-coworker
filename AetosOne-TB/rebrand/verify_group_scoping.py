#!/usr/bin/env python3
"""Prove GROUP-role scoping is exact, not approximate.

Builds, entirely through the REST API (no SQL), a user who can see only the devices in
one group:

    user  ->  "Scoped Users" (user group)  --grant-->  "Device Viewer" (GROUP role)
                                                       over "Subset Devices" (device group)

Then asserts the user sees exactly the devices in that group, that the reported total
matches, and that a page size smaller than the group returns a *full* page — the thing
post-query filtering gets wrong.
"""
import json
import subprocess
import time
import urllib.error
import urllib.request

API = "http://localhost:8080"
CACHE_TTL_SECONDS = 65
SCOPED_EMAIL = "scoped@thingsboard.test"
SCOPED_PASSWORD = "scoped12345"
IN_GROUP = 3          # devices placed in the group
PAGE_SIZE = 2         # deliberately smaller than IN_GROUP


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


def must(status, body, what):
    if status != 200:
        raise SystemExit(f"{what} failed: {status} {body}")
    return body


def psql(sql):
    result = subprocess.run(["sudo", "-u", "postgres", "psql", "-d", "thingsboard", "-tAc", sql],
                            capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"psql failed: {result.stderr[:300]}")
    return result.stdout.strip()


def cleanup():
    """Remove artefacts from earlier runs.

    Each run creates its own timestamped groups; without this the test user accumulates a
    grant per run and 'sees exactly N devices' counts every previous run's devices too.
    """
    psql("""
        DELETE FROM group_permission WHERE user_group_id IN
            (SELECT id FROM entity_group WHERE name LIKE 'Scoped Users %');
        DELETE FROM entity_group_entity WHERE entity_group_id IN
            (SELECT id FROM entity_group WHERE name LIKE 'Scoped Users %' OR name LIKE 'Subset Devices %' OR name LIKE 'Subset Assets %');
        DELETE FROM entity_group WHERE name LIKE 'Scoped Users %' OR name LIKE 'Subset Devices %' OR name LIKE 'Subset Assets %';
        DELETE FROM role WHERE name LIKE 'Device Viewer %' OR name LIKE 'Device Reader %';
    """)


def main():
    sys_token = login("sysadmin@aetosiot.com", "sysadmin")
    cleanup()
    print("cleared artefacts from earlier runs")
    admin = login("tenant@aetosiot.com", "tenant")
    tenant_uuid = must(*call("GET", "/api/auth/user", admin), "whoami")["tenantId"]["id"]

    # --- devices: some in the group, some not ------------------------------
    devices = []
    for i in range(IN_GROUP + 2):
        status, device = call("POST", "/api/device", admin,
                              {"name": f"scoped-probe-{i}-{int(time.time())}", "type": "default"})
        devices.append(must(status, device, "create device"))
    in_group, out_group = devices[:IN_GROUP], devices[IN_GROUP:]

    # --- groups, role and grant, all via the API ---------------------------
    user_group = must(*call("POST", "/api/entityGroup", admin,
                            {"name": f"Scoped Users {int(time.time())}", "type": "USER"}), "user group")
    device_group = must(*call("POST", "/api/entityGroup", admin,
                              {"name": f"Subset Devices {int(time.time())}", "type": "DEVICE"}), "device group")
    role = must(*call("POST", "/api/role", admin,
                      {"name": f"Device Viewer {int(time.time())}", "type": "GROUP",
                       "permissions": ["READ"]}), "role")

    for device in in_group:
        must(*call("POST", f"/api/entityGroup/{device_group['id']['id']}/DEVICE/{device['id']['id']}", admin),
             "add device to group")

    # a user restricted to that device group
    status, users = call("GET", f"/api/tenant/{tenant_uuid}/users?pageSize=200&page=0", sys_token)
    user = next((u for u in users["data"] if u["email"] == SCOPED_EMAIL), None) if status == 200 else None
    if user is None:
        user = must(*call("POST", "/api/user?sendActivationMail=false", sys_token, {
            "tenantId": {"entityType": "TENANT", "id": tenant_uuid},
            "authority": "TENANT_ADMIN", "email": SCOPED_EMAIL,
            "firstName": "Scoped", "lastName": "User"}), "create user")
    if call("POST", "/api/auth/login", body={"username": SCOPED_EMAIL, "password": SCOPED_PASSWORD})[0] != 200:
        _, link = call("GET", f"/api/user/{user['id']['id']}/activationLink", sys_token)
        call("POST", "/api/noauth/activate?sendActivationMail=false",
             body={"activateToken": link.rsplit("=", 1)[-1].strip(), "password": SCOPED_PASSWORD})

    must(*call("POST", f"/api/entityGroup/{user_group['id']['id']}/USER/{user['id']['id']}", admin),
         "add user to user group")
    # GROUP role needs DEVICE:READ as well, or the resource gate denies the list outright
    read_devices = must(*call("POST", "/api/role", admin,
                              {"name": f"Device Reader {int(time.time())}", "type": "GENERIC",
                               "permissions": {"DEVICE": ["READ"]}}), "generic role")
    must(*call("POST", "/api/groupPermission", admin,
               {"userGroupId": {"entityType": "ENTITY_GROUP", "id": user_group["id"]["id"]},
                "roleId": {"entityType": "ROLE", "id": role["id"]["id"]},
                "entityGroupId": {"entityType": "ENTITY_GROUP", "id": device_group["id"]["id"]},
                "entityGroupType": "DEVICE"}), "group grant")

    print(f"waiting {CACHE_TTL_SECONDS}s for the permission cache...")
    time.sleep(CACHE_TTL_SECONDS)

    scoped = login(SCOPED_EMAIL, SCOPED_PASSWORD)
    status, page = call("GET", f"/api/tenant/devices?pageSize=100&page=0", scoped)
    status_small, small = call("GET", f"/api/tenant/devices?pageSize={PAGE_SIZE}&page=0", scoped)

    # No asset or dashboard grant at all -> denied at the resource gate, which is stricter
    # than returning an empty list.
    asset_status, _ = call("GET", "/api/tenant/assets?pageSize=100&page=0", scoped)
    dash_status, _ = call("GET", "/api/tenant/dashboards?pageSize=100&page=0", scoped)

    # Now the case row scoping actually exists for: the user IS granted one asset group,
    # so the asset list must show that group only — not every asset in the tenant.
    # Before scoping was extended beyond devices this returned all of them.
    scoped_assets = must(*call("POST", "/api/entityGroup", admin,
                               {"name": f"Subset Assets {int(time.time())}", "type": "ASSET"}), "asset group")
    assets_in, assets_out = [], []
    for i in range(4):
        status, asset = call("POST", "/api/asset", admin,
                             {"name": f"scoped-asset-{i}-{int(time.time())}", "type": "default"})
        asset = must(status, asset, "create asset")
        (assets_in if i < 2 else assets_out).append(asset)
    for asset in assets_in:
        must(*call("POST", f"/api/entityGroup/{scoped_assets['id']['id']}/ASSET/{asset['id']['id']}", admin),
             "add asset to group")
    must(*call("POST", "/api/groupPermission", admin,
               {"userGroupId": {"entityType": "ENTITY_GROUP", "id": user_group["id"]["id"]},
                "roleId": {"entityType": "ROLE", "id": role["id"]["id"]},
                "entityGroupId": {"entityType": "ENTITY_GROUP", "id": scoped_assets["id"]["id"]},
                "entityGroupType": "ASSET"}), "asset grant")

    print(f"waiting {CACHE_TTL_SECONDS}s for the asset grant to take effect...")
    time.sleep(CACHE_TTL_SECONDS)
    scoped = login(SCOPED_EMAIL, SCOPED_PASSWORD)
    granted_status, granted_assets = call("GET", "/api/tenant/assets?pageSize=100&page=0", scoped)
    visible_assets = {a["id"]["id"] for a in granted_assets["data"]} if granted_status == 200 else set()
    expected_assets = {a["id"]["id"] for a in assets_in}
    forbidden_assets = {a["id"]["id"] for a in assets_out}

    visible = {d["id"]["id"] for d in page["data"]} if status == 200 else set()
    expected = {d["id"]["id"] for d in in_group}
    forbidden = {d["id"]["id"] for d in out_group}

    checks = [
        ("scoped user can list devices", status, 200),
        ("sees exactly the group's devices", visible, expected),
        ("sees none of the ungrouped devices", visible & forbidden, set()),
        ("total matches group size", page.get("totalElements") if status == 200 else -1, IN_GROUP),
        # the assertion post-query filtering fails: a small page must still come back full
        ("small page is full, not short", len(small["data"]) if status_small == 200 else -1, PAGE_SIZE),
        # with no grant for those resources at all, denial is stricter than an empty list
        ("assets denied outright (no asset grant)", asset_status, 403),
        ("dashboards denied outright (no dashboard grant)", dash_status, 403),
        # once an asset group IS granted, the list narrows to it
        ("asset list allowed after grant", granted_status, 200),
        ("sees exactly the granted asset group", visible_assets, expected_assets),
        ("sees none of the ungrouped assets", visible_assets & forbidden_assets, set()),
    ]

    failed = 0
    for label, actual, expected_value in checks:
        ok = actual == expected_value
        failed += not ok
        shown = actual if not isinstance(actual, set) else f"{len(actual)} device(s)"
        exp = expected_value if not isinstance(expected_value, set) else f"{len(expected_value)} device(s)"
        print(f"{'PASS' if ok else 'FAIL'}  {label}: {shown}" + ("" if ok else f" (expected {exp})"))

    print()
    print("group scoping is exact" if not failed else f"{failed} check(s) failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
