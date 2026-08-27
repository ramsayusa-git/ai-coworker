#!/usr/bin/env python3
"""Create the SUPER_ADMIN user on an existing database and prove it outranks SYS_ADMIN.

The installer only seeds a super admin on a fresh install, so on an existing DB we
create one here. The key property under test: a SUPER_ADMIN is granted the SYS_ADMIN
authority as well, so every endpoint guarded by hasAuthority('SYS_ADMIN') admits it
without any annotation being changed.
"""
import json
import urllib.request
import urllib.error

API = "http://localhost:8080"
SUPER_EMAIL = "superadmin@aetosiot.com"
SUPER_PASSWORD = "superadmin"


def call(method, path, token=None, body=None, raw_ok=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read()
            if not payload:
                return None
            try:
                return json.loads(payload)
            except json.JSONDecodeError:
                return payload.decode()
    except urllib.error.HTTPError as e:
        if raw_ok:
            return {"__status": e.code, "__body": e.read().decode()[:200]}
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")


def login(user, pw, raw_ok=False):
    r = call("POST", "/api/auth/login", body={"username": user, "password": pw}, raw_ok=raw_ok)
    return r["token"] if isinstance(r, dict) and "token" in r else None


def main():
    sys_token = login("sysadmin@aetosiot.com", "sysadmin")

    # Create the super admin if this database predates the installer change.
    #
    # /api/users pages the *tenant's* users, so it never lists a system-level account —
    # asking it whether the super admin exists always answers "no". Attempt the create and
    # let the uniqueness error be the answer instead; that also makes re-runs idempotent.
    existing = call("POST", "/api/user?sendActivationMail=false", sys_token, {
        "authority": "SUPER_ADMIN",
        "email": SUPER_EMAIL,
        "firstName": "Super",
        "lastName": "Admin",
    }, raw_ok=True)

    if isinstance(existing, dict) and existing.get("__status"):
        if "already present" not in str(existing.get("__body", "")):
            raise SystemExit(f"could not create super admin: {existing}")
        print(f"{SUPER_EMAIL} already exists")
        # already activated on the first run, so the password is the one we set then
        if login(SUPER_EMAIL, SUPER_PASSWORD, raw_ok=True) is None:
            raise SystemExit(
                f"{SUPER_EMAIL} exists but the recorded password no longer works; "
                "delete the user and re-run")
        existing = None
    else:
        print(f"created {SUPER_EMAIL}")

    if existing is not None and login(SUPER_EMAIL, SUPER_PASSWORD, raw_ok=True) is None:
        link = call("GET", f"/api/user/{existing['id']['id']}/activationLink", sys_token)
        call("POST", "/api/noauth/activate?sendActivationMail=false",
             body={"activateToken": link.rsplit("=", 1)[-1].strip(), "password": SUPER_PASSWORD})
        print("activated super admin")

    token = login(SUPER_EMAIL, SUPER_PASSWORD)

    me = call("GET", "/api/auth/user", token)
    tenants = call("GET", "/api/tenants?pageSize=1&page=0", token, raw_ok=True)
    platform_wl = call("GET", "/api/whiteLabel/currentWhiteLabelParams", token, raw_ok=True)

    checks = [
        ("authority is SUPER_ADMIN", me.get("authority"), "SUPER_ADMIN"),
        ("can list tenants (a SYS_ADMIN endpoint)",
         "data" in tenants if isinstance(tenants, dict) else False, True),
        ("edits platform branding, not a tenant's",
         isinstance(platform_wl, dict) and platform_wl.get("appTitle") == "Aetos One Cloud", True),
    ]

    failed = 0
    for label, actual, expected in checks:
        ok = actual == expected
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {label}: {actual}"
              + ("" if ok else f" (expected {expected})"))

    print()
    print("all checks passed" if not failed else f"{failed} check(s) failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
