#!/usr/bin/env python3
"""Verify text search and sorting under RBAC group scoping.

Previously the group-scoped path paged the membership table alone, so a user restricted by a
GROUP role could neither search nor sort — the parameters were silently ignored, which is
worse than refusing them. This checks that both now work *and* that scoping is still exact:
search must narrow within the granted group only, never reach outside it.

Run with the backend up:  python3 verify_group_search_sort.py
"""

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8080"
SYS_ADMIN = ("sysadmin@aetosiot.com", "sysadmin")
TENANT_ADMIN = ("tenant@aetosiot.com", "tenant")

LIMITED_EMAIL = "search-scope@aetosiot.com"
LIMITED_PASSWORD = "scope12345"
GROUP_NAME = "Search Scope Devices"
USER_GROUP_NAME = "Search Scope Users"
ROLE_NAME = "Search Scope Viewer"

# must exceed the permission cache TTL
CACHE_TTL_SECONDS = 65

# Two devices land in the granted group, one deliberately does not. The names share a prefix
# so a search can distinguish them, and sort order is unambiguous.
IN_GROUP = ["demo-scope-alpha", "demo-scope-charlie"]
OUT_OF_GROUP = ["demo-scope-bravo"]

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("X-Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode()
            if not text:
                return response.status, None
            try:
                return response.status, json.loads(text)
            except ValueError:
                # /activationLink answers with a bare URL, not JSON
                return response.status, text
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        try:
            return error.code, json.loads(text)
        except ValueError:
            return error.code, text


def login(username, password):
    status, body = call("POST", "/api/auth/login",
                        body={"username": username, "password": password})
    if status != 200:
        print(f"Could not sign in as {username}: {status} {body}")
        sys.exit(1)
    return body["token"]


def psql(sql):
    subprocess.run(["psql", "-h", "localhost", "-U", "postgres", "-d", "thingsboard", "-c", sql],
                   env={"PGPASSWORD": "postgres", "PATH": "/usr/bin:/bin"},
                   check=True, capture_output=True)


def main():
    sys_token = login(*SYS_ADMIN)
    tenant_token = login(*TENANT_ADMIN)
    status, me = call("GET", "/api/auth/user", tenant_token)
    tenant_uuid = me["tenantId"]["id"]

    # --- fixture ------------------------------------------------------------
    status, users = call("GET", f"/api/tenant/{tenant_uuid}/users?pageSize=200&page=0", sys_token)
    user = next((u for u in users.get("data", []) if u["email"] == LIMITED_EMAIL), None)
    if user is None:
        status, user = call("POST", "/api/user?sendActivationMail=false", sys_token, {
            "tenantId": {"entityType": "TENANT", "id": tenant_uuid},
            "authority": "TENANT_ADMIN",
            "email": LIMITED_EMAIL, "firstName": "Search", "lastName": "Scope"
        })
        if status != 200:
            print(f"Could not create the test user: {user}")
            return 1
    user_uuid = user["id"]["id"]

    status, _ = call("POST", "/api/auth/login",
                     body={"username": LIMITED_EMAIL, "password": LIMITED_PASSWORD})
    if status != 200:
        _, link = call("GET", f"/api/user/{user_uuid}/activationLink", sys_token)
        call("POST", "/api/noauth/activate?sendActivationMail=false",
             body={"activateToken": link.rsplit("=", 1)[-1].strip(),
                   "password": LIMITED_PASSWORD})

    devices = {}
    for name in IN_GROUP + OUT_OF_GROUP:
        status, device = call("GET", f"/api/tenant/devices?deviceName={name}", tenant_token)
        if status != 200:
            status, device = call("POST", "/api/device", tenant_token,
                                  {"name": name, "type": "default"})
        devices[name] = device["id"]["id"]

    # Start from a clean slate, and detach the test user from every group: the migration puts
    # tenant admins in "All Users", which is granted ALL — that would mask the scoping.
    psql(f"""
        DELETE FROM group_permission WHERE user_group_id IN
            (SELECT id FROM entity_group WHERE name = '{USER_GROUP_NAME}');
        DELETE FROM entity_group_entity WHERE entity_group_id IN
            (SELECT id FROM entity_group WHERE name IN ('{USER_GROUP_NAME}', '{GROUP_NAME}'));
        DELETE FROM entity_group WHERE name IN ('{USER_GROUP_NAME}', '{GROUP_NAME}');
        DELETE FROM role WHERE name = '{ROLE_NAME}';
        DELETE FROM entity_group_entity WHERE entity_id = '{user_uuid}' AND entity_type = 'USER';
    """)

    def must(status, body, what):
        """Fixture calls are checked, because a silently failed one produces a user with no
        grants at all — who then sees everything, and every assertion below misreads that
        as a scoping bug rather than a broken fixture."""
        if status != 200:
            print(f"Fixture step failed ({what}): {status} {body}")
            sys.exit(1)
        return body

    device_group = must(*call("POST", "/api/entityGroup", tenant_token,
                              {"name": GROUP_NAME, "type": "DEVICE"}), "device group")
    user_group = must(*call("POST", "/api/entityGroup", tenant_token,
                            {"name": USER_GROUP_NAME, "type": "USER"}), "user group")
    role = must(*call("POST", "/api/role", tenant_token,
                      {"name": ROLE_NAME, "type": "GROUP", "permissions": ["READ"]}), "role")

    for name in IN_GROUP:
        must(*call("POST",
                   f"/api/entityGroup/{device_group['id']['id']}/DEVICE/{devices[name]}",
                   tenant_token), f"add {name} to group")
    must(*call("POST", f"/api/entityGroup/{user_group['id']['id']}/USER/{user_uuid}",
               tenant_token), "add user to user group")
    must(*call("POST", "/api/groupPermission", tenant_token, {
        "userGroupId": {"entityType": "ENTITY_GROUP", "id": user_group["id"]["id"]},
        "roleId": {"entityType": "ROLE", "id": role["id"]["id"]},
        "entityGroupId": {"entityType": "ENTITY_GROUP", "id": device_group["id"]["id"]},
        "entityGroupType": "DEVICE"
    }), "group grant")

    print(f"Fixture ready; waiting {CACHE_TTL_SECONDS}s for the permission cache to expire...")
    time.sleep(CACHE_TTL_SECONDS)
    limited_token = login(LIMITED_EMAIL, LIMITED_PASSWORD)

    # What the server thinks this user holds. If rbacEnabled is false the user has no grants
    # at all, and every "sees too much" result below is a broken fixture rather than a
    # scoping bug — worth distinguishing before reading the rest.
    status, effective = call("GET", "/api/permissions/allowedResources", limited_token)
    print(f"\nEffective permissions: {effective}")

    def names(page):
        return [device["name"] for device in page.get("data", [])]

    # --- scoping still exact ------------------------------------------------
    print("\nScoping")
    status, page = call("GET", "/api/tenant/deviceInfos?pageSize=100&page=0", limited_token)
    listed = names(page) if status == 200 else []
    record("sees exactly the granted group", sorted(listed) == sorted(IN_GROUP),
           f"{listed}")
    record("total matches the group size",
           status == 200 and page.get("totalElements") == len(IN_GROUP),
           str(page.get("totalElements") if status == 200 else page))

    # --- text search --------------------------------------------------------
    print("\nText search")
    status, page = call(
        "GET", "/api/tenant/deviceInfos?pageSize=100&page=0&textSearch=alpha", limited_token)
    listed = names(page) if status == 200 else []
    record("search narrows within the group", listed == ["demo-scope-alpha"], str(listed))
    record("search total is the narrowed count",
           status == 200 and page.get("totalElements") == 1,
           str(page.get("totalElements") if status == 200 else page))

    # the important one: search must not become a way out of the group
    status, page = call(
        "GET", "/api/tenant/deviceInfos?pageSize=100&page=0&textSearch=bravo", limited_token)
    listed = names(page) if status == 200 else []
    record("search cannot reach outside the group", listed == [], str(listed))

    # --- sorting ------------------------------------------------------------
    print("\nSorting")
    status, page = call(
        "GET", "/api/tenant/deviceInfos?pageSize=100&page=0&sortProperty=name&sortOrder=ASC",
        limited_token)
    ascending = names(page) if status == 200 else []
    record("ascending sort is applied", ascending == sorted(IN_GROUP), str(ascending))

    status, page = call(
        "GET", "/api/tenant/deviceInfos?pageSize=100&page=0&sortProperty=name&sortOrder=DESC",
        limited_token)
    descending = names(page) if status == 200 else []
    record("descending sort reverses it",
           descending == sorted(IN_GROUP, reverse=True), str(descending))

    # --- paging still exact under search -------------------------------------
    print("\nPaging")
    status, page = call("GET", "/api/tenant/deviceInfos?pageSize=1&page=0"
                               "&sortProperty=name&sortOrder=ASC", limited_token)
    first = names(page) if status == 200 else []
    # a page smaller than the group must come back full — the assertion post-query
    # filtering cannot satisfy
    record("a page smaller than the group is full", len(first) == 1, str(first))
    record("hasNext is set", status == 200 and page.get("hasNext") is True,
           str(page.get("hasNext") if status == 200 else page))

    status, page = call("GET", "/api/tenant/deviceInfos?pageSize=1&page=1"
                               "&sortProperty=name&sortOrder=ASC", limited_token)
    second = names(page) if status == 200 else []
    record("the second page is the next device in sort order",
           first + second == sorted(IN_GROUP), f"{first} then {second}")

    # --- cleanup ------------------------------------------------------------
    psql(f"""
        DELETE FROM group_permission WHERE user_group_id IN
            (SELECT id FROM entity_group WHERE name = '{USER_GROUP_NAME}');
        DELETE FROM entity_group_entity WHERE entity_group_id IN
            (SELECT id FROM entity_group WHERE name IN ('{USER_GROUP_NAME}', '{GROUP_NAME}'));
        DELETE FROM entity_group WHERE name IN ('{USER_GROUP_NAME}', '{GROUP_NAME}');
        DELETE FROM role WHERE name = '{ROLE_NAME}';
    """)
    for name in IN_GROUP + OUT_OF_GROUP:
        call("DELETE", f"/api/device/{devices[name]}", tenant_token)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
