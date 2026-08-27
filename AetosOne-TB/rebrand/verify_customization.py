#!/usr/bin/env python3
"""Verify UI customization and RBAC-driven navigation end to end.

Covers three features added on top of CE:

  * ``GET /api/permissions/allowedResources`` — what the menu is filtered by
  * custom translation — per-locale key overrides, platform -> tenant inheritance
  * custom menu — rename/hide/reorder plus custom links, tenant replaces platform

Everything runs through the REST API against a live server, because the interesting
failures (inheritance, authority split) only appear once real requests are involved.

Run with the backend up:  python3 verify_customization.py
"""

import json
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8080"
SYS_ADMIN = ("sysadmin@aetosiot.com", "sysadmin")
TENANT_ADMIN = ("tenant@aetosiot.com", "tenant")

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


def call(method, path, token=None, body=None, expect=200):
    """Returns (status, parsed body). Never raises on an HTTP error status."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("X-Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, raw


def login(username, password):
    status, body = call("POST", "/api/auth/login",
                        body={"username": username, "password": password})
    if status != 200:
        print(f"Could not sign in as {username}: {status} {body}")
        sys.exit(1)
    return body["token"]


def main():
    print("Signing in...")
    sys_token = login(*SYS_ADMIN)
    tenant_token = login(*TENANT_ADMIN)

    # --- guided navigation -------------------------------------------------
    print("\nRBAC-driven navigation")
    status, body = call("GET", "/api/permissions/allowedResources", tenant_token)
    record("allowedResources responds", status == 200, f"status {status}")
    record("reports whether RBAC applies", isinstance(body, dict) and "rbacEnabled" in body,
           str(body)[:80])
    record("resources is a list", isinstance(body.get("resources"), list))
    if body.get("rbacEnabled"):
        record("granted resources include DEVICE", "DEVICE" in body["resources"],
               ", ".join(body["resources"][:6]))
    else:
        # a tenant admin with no grants must keep the full authority-based menu, otherwise
        # the feature would hide everything from everyone on day one
        record("no grants means no filtering", body["resources"] == [])

    # --- custom translation ------------------------------------------------
    print("\nCustom translation")
    call("POST", "/api/customTranslation/customTranslation", sys_token,
         {"translationMap": {"en_US": {"device.devices": "Platform Assets"}}})
    status, merged = call("GET", "/api/customTranslation/customTranslation", tenant_token)
    inherited = merged.get("translationMap", {}).get("en_US", {}).get("device.devices")
    record("tenant inherits the platform override", inherited == "Platform Assets", str(inherited))

    call("POST", "/api/customTranslation/customTranslation", tenant_token,
         {"translationMap": {"en_US": {"device.devices": "Meters"}}})
    status, merged = call("GET", "/api/customTranslation/customTranslation", tenant_token)
    value = merged.get("translationMap", {}).get("en_US", {}).get("device.devices")
    record("tenant override wins over platform", value == "Meters", str(value))

    # the platform's own view must not have been altered by the tenant's save
    status, system = call("GET", "/api/customTranslation/currentCustomTranslation", sys_token)
    system_value = system.get("translationMap", {}).get("en_US", {}).get("device.devices")
    record("tenant save leaves the platform record alone", system_value == "Platform Assets",
           str(system_value))

    # a key the tenant did not touch still comes through from the platform
    call("POST", "/api/customTranslation/customTranslation", sys_token,
         {"translationMap": {"en_US": {"device.devices": "Platform Assets",
                                       "asset.assets": "Platform Things"}}})
    status, merged = call("GET", "/api/customTranslation/customTranslation", tenant_token)
    untouched = merged.get("translationMap", {}).get("en_US", {}).get("asset.assets")
    record("untouched keys fall through to the platform", untouched == "Platform Things",
           str(untouched))

    # --- custom menu -------------------------------------------------------
    print("\nCustom menu")
    call("POST", "/api/customMenu/customMenu", sys_token,
         {"menuItems": [{"id": "devices", "name": "Fleet"}], "disabledDefaultItems": False})
    status, merged = call("GET", "/api/customMenu/customMenu", tenant_token)
    names = [item.get("name") for item in merged.get("menuItems", [])]
    record("tenant inherits the platform menu", names == ["Fleet"], str(names))

    call("POST", "/api/customMenu/customMenu", tenant_token,
         {"menuItems": [
             {"id": "devices", "name": "Meters", "icon": "speed"},
             {"id": "audit_log", "visible": False},
             {"name": "Support", "url": "https://example.invalid/support", "openInNewTab": True}
         ], "disabledDefaultItems": False})
    status, merged = call("GET", "/api/customMenu/customMenu", tenant_token)
    items = merged.get("menuItems", [])
    record("tenant menu replaces the platform menu", len(items) == 3, f"{len(items)} items")
    record("rename survives the round trip",
           items and items[0].get("name") == "Meters", str(items[:1])[:80])
    record("hidden entry keeps visible=false",
           len(items) > 1 and items[1].get("visible") is False, str(items[1:2])[:80])
    record("custom link keeps its url",
           len(items) > 2 and items[2].get("url", "").startswith("https://"), str(items[2:3])[:80])

    # --- cleanup -----------------------------------------------------------
    # leaving overrides behind would rename menu entries for anyone using this instance
    call("POST", "/api/customTranslation/customTranslation", tenant_token, {"translationMap": {}})
    call("POST", "/api/customTranslation/customTranslation", sys_token, {"translationMap": {}})
    call("POST", "/api/customMenu/customMenu", tenant_token, {"menuItems": []})
    call("POST", "/api/customMenu/customMenu", sys_token, {"menuItems": []})

    status, merged = call("GET", "/api/customMenu/customMenu", tenant_token)
    record("cleanup restores the stock menu", not merged.get("menuItems"), str(merged)[:60])

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
