#!/usr/bin/env python3
"""Assert the RBAC migration is behaviour-neutral.

After rbac_migrate.sql every tenant admin holds a built-in role granting ALL on every
resource. The whole point is that nothing changes: a check that passed before the
migration must still pass after it. If any of these fail, the migration has broken
existing installs, which is the one outcome that is not acceptable.
"""
import json
import time
import urllib.error
import urllib.request

API = "http://localhost:8080"
CACHE_TTL_SECONDS = 65


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read()
            return 200, (json.loads(payload) if payload else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:150]
    except json.JSONDecodeError:
        return 200, None


def login(user, pw):
    status, body = call("POST", "/api/auth/login", body={"username": user, "password": pw})
    if status != 200:
        raise SystemExit(f"login {user} failed: {status} {body}")
    return body["token"]


def main():
    print(f"waiting {CACHE_TTL_SECONDS}s so the migrated grants are picked up...")
    time.sleep(CACHE_TTL_SECONDS)

    token = login("tenant@aetosiot.com", "tenant")

    endpoints = {
        "devices": "/api/tenant/devices?pageSize=5&page=0",
        "dashboards": "/api/tenant/dashboards?pageSize=5&page=0",
        "assets": "/api/tenant/assets?pageSize=5&page=0",
        "customers": "/api/customers?pageSize=5&page=0",
        "entity views": "/api/tenant/entityViews?pageSize=5&page=0",
        "rule chains": "/api/ruleChains?pageSize=5&page=0",
        "edges": "/api/tenant/edges?pageSize=5&page=0",
    }

    checks = []
    for name, path in endpoints.items():
        status, body = call("GET", path, token)
        checks.append((f"migrated tenant admin can list {name}", status, 200))

    # device create must still work — the built-in role grants ALL
    status, _ = call("POST", "/api/device", token,
                     {"name": f"rbac-migration-probe-{int(time.time())}", "type": "default"})
    checks.append(("migrated tenant admin can create a device", status, 200))

    # the new group/role API is reachable
    status, _ = call("GET", "/api/roles?pageSize=10&page=0", token)
    checks.append(("role API reachable", status, 200))
    status, _ = call("GET", "/api/entityGroups?pageSize=10&page=0", token)
    checks.append(("entity group API reachable", status, 200))

    failed = 0
    for label, actual, expected in checks:
        ok = actual == expected
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {label}: HTTP {actual}"
              + ("" if ok else f" (expected {expected})"))

    print()
    print("migration is behaviour-neutral" if not failed else f"{failed} check(s) failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
