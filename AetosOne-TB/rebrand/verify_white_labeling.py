#!/usr/bin/env python3
"""End-to-end check that white labeling is genuinely per-tenant.

Creates a second tenant, gives the two tenants different branding, and asserts
that each one sees only its own, that unset fields fall through to the platform
defaults, and that the platform record itself is untouched.
"""
import json
import urllib.request
import urllib.error

API = "http://localhost:8080"


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            if not raw:
                return None
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return raw.decode()  # e.g. /activationLink returns plain text
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()[:400]}")


def login(user, pw):
    return call("POST", "/api/auth/login", body={"username": user, "password": pw})["token"]


def ensure_second_tenant(sys_token):
    """Creates 'Acme Corp' and an activated admin for it, or reuses an existing one."""
    tenants = call("GET", "/api/tenants?pageSize=100&page=0", sys_token)
    tenant = next((t for t in tenants["data"] if t["title"] == "Acme Corp"), None)
    if tenant is None:
        tenant = call("POST", "/api/tenant", sys_token, {"title": "Acme Corp"})
        print("created tenant Acme Corp")

    users = call("GET", f"/api/tenant/{tenant['id']['id']}/users?pageSize=100&page=0", sys_token)
    user = next((u for u in users["data"] if u["email"] == "admin@acme.test"), None)
    if user is None:
        user = call("POST", "/api/user?sendActivationMail=false", sys_token, {
            "tenantId": tenant["id"],
            "authority": "TENANT_ADMIN",
            "email": "admin@acme.test",
            "firstName": "Acme",
            "lastName": "Admin",
        })
        print("created tenant admin admin@acme.test")

    # activate separately from creation, so a half-finished earlier run still recovers
    try:
        login("admin@acme.test", "acme12345")
    except SystemExit:
        link = call("GET", f"/api/user/{user['id']['id']}/activationLink", sys_token)
        token = link.rsplit("=", 1)[-1].strip()
        call("POST", "/api/noauth/activate?sendActivationMail=false",
             body={"activateToken": token, "password": "acme12345"})
        print("activated admin@acme.test")
    return tenant


def main():
    sys_token = login("sysadmin@aetosiot.com", "sysadmin")
    ensure_second_tenant(sys_token)

    tb = login("tenant@aetosiot.com", "tenant")
    acme = login("admin@acme.test", "acme12345")

    # tenant A overrides everything; tenant B overrides only the primary colour,
    # so its app title must still fall through to the platform default
    call("POST", "/api/whiteLabel/whiteLabelParams", tb, {
        "appTitle": "Contoso IoT",
        "paletteSettings": {
            "primaryPalette": {"colorHex": "#0B6E4F"},
            "accentPalette": {"colorHex": "#F2B705"},
        },
    })
    call("POST", "/api/whiteLabel/whiteLabelParams", acme, {
        "paletteSettings": {"primaryPalette": {"colorHex": "#8B1E3F"}},
    })

    a = call("GET", "/api/whiteLabel/whiteLabelParams", tb)
    b = call("GET", "/api/whiteLabel/whiteLabelParams", acme)
    platform = call("GET", "/api/whiteLabel/currentWhiteLabelParams", sys_token)

    def primary(p):
        return p["paletteSettings"]["primaryPalette"]["colorHex"]

    def accent(p):
        return p["paletteSettings"]["accentPalette"]["colorHex"]

    checks = [
        ("tenant A keeps its own title", a["appTitle"], "Contoso IoT"),
        ("tenant A keeps its own primary", primary(a), "#0B6E4F"),
        ("tenant A keeps its own accent", accent(a), "#F2B705"),
        ("tenant B is unaffected by A's title", b["appTitle"], "Aetos One Cloud"),
        ("tenant B keeps its own primary", primary(b), "#8B1E3F"),
        ("tenant B inherits the platform accent", accent(b), "#E6701C"),
        ("platform title untouched", platform["appTitle"], "Aetos One Cloud"),
        ("platform primary untouched", primary(platform), "#273A80"),
    ]

    failed = 0
    for label, actual, expected in checks:
        ok = actual == expected
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {label}: {actual}" + ("" if ok else f" (expected {expected})"))

    print()
    print("all checks passed" if not failed else f"{failed} check(s) failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
