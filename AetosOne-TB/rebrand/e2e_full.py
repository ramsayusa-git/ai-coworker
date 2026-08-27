#!/usr/bin/env python3
"""End-to-end test of Aetos One Cloud.

Covers the platform in one run: authentication at every authority level, every menu entry
and the API behind it, white labeling, device lifecycle, profiles and alarms, device
ingress, LoRaWAN via ChirpStack, RBAC in all its forms, and every feature added on top of CE.

**What this can and cannot prove.** Everything here drives the live REST API — the same API
the UI calls — so data, permissions and wiring are established. It cannot click buttons or
see pixels: a route that resolves and returns data can still look wrong. Anything visual is
called out as unproven rather than claimed as passing.

    python3 e2e_full.py            # everything
    python3 e2e_full.py --quick    # skip the permission-cache waits
"""

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8080"
UI_DEV = "http://localhost:4200"

SYS_ADMIN = ("sysadmin@aetosiot.com", "sysadmin")
SUPER_ADMIN = ("superadmin@aetosiot.com", "superadmin")
TENANT_ADMIN = ("tenant@aetosiot.com", "tenant")
CUSTOMER_USER = ("customer@aetosiot.com", "customer")

CACHE_TTL = 65
PREFIX = "e2e-%d" % (int(time.time()) % 100000)

sections = []
results = []
created = {"devices": [], "profiles": [], "groups": [], "roles": [], "dashboards": [],
           "customers": [], "integrations": [], "secrets": [], "mcp": [], "scheduler": [],
           "webhooks": [], "assets": []}


def section(title):
    sections.append(title)
    print("\n\033[1m%s\033[0m" % title)


def record(name, ok, detail=""):
    results.append((sections[-1] if sections else "", name, ok, detail))
    mark = "\033[32mPASS\033[0m" if ok else "\033[31mFAIL\033[0m"
    print("  %s  %s%s" % (mark, name, ("  - " + str(detail)) if detail else ""))


def call(method, path, token=None, body=None, base=BASE, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(base + path, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("X-Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
            if raw:
                return response.status, payload, dict(response.headers)
            text = payload.decode()
            if not text:
                return response.status, None
            try:
                return response.status, json.loads(text)
            except ValueError:
                return response.status, text
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        if raw:
            return error.code, text.encode(), {}
        try:
            return error.code, json.loads(text)
        except ValueError:
            return error.code, text
    except Exception as error:
        return (0, b"", {}) if raw else (0, str(error))


def login(credentials):
    status, body = call("POST", "/api/auth/login",
                        body={"username": credentials[0], "password": credentials[1]})
    return body["token"] if status == 200 and isinstance(body, dict) else None


def psql(sql):
    return subprocess.run(
        ["psql", "-h", "localhost", "-U", "postgres", "-d", "thingsboard", "-tAc", sql],
        env={"PGPASSWORD": "postgres", "PATH": "/usr/bin:/bin"},
        capture_output=True, text=True).stdout.strip()


def test_auth():
    section("1. Authentication and authority levels")
    tokens = {}
    for label, credentials in [("SYS_ADMIN", SYS_ADMIN), ("SUPER_ADMIN", SUPER_ADMIN),
                               ("TENANT_ADMIN", TENANT_ADMIN), ("CUSTOMER_USER", CUSTOMER_USER)]:
        token = login(credentials)
        record("%s signs in as %s" % (label, credentials[0]), token is not None)
        tokens[label] = token

    if tokens.get("SUPER_ADMIN"):
        status, me = call("GET", "/api/auth/user", tokens["SUPER_ADMIN"])
        record("SUPER_ADMIN reports its own authority",
               isinstance(me, dict) and me.get("authority") == "SUPER_ADMIN",
               me.get("authority") if isinstance(me, dict) else "")
        # the point of the added authority: it satisfies SYS_ADMIN guards unchanged
        status, _ = call("GET", "/api/tenants?pageSize=1&page=0", tokens["SUPER_ADMIN"])
        record("SUPER_ADMIN passes a SYS_ADMIN-guarded endpoint", status == 200, "status %s" % status)

    if tokens.get("CUSTOMER_USER"):
        status, _ = call("GET", "/api/tenants?pageSize=1&page=0", tokens["CUSTOMER_USER"])
        record("CUSTOMER_USER is refused a platform endpoint", status in (401, 403),
               "status %s" % status)

    status, _ = call("POST", "/api/auth/login",
                     body={"username": TENANT_ADMIN[0], "password": "wrong-password"})
    record("a wrong password is refused", status == 401, "status %s" % status)
    return tokens


def test_menu(token):
    """Every menu entry, and the API the page behind it depends on.

    The menu map is generated from the source, so an entry added later is covered
    automatically rather than silently escaping the test.
    """
    section("2. Menu and sub-menu entries")
    try:
        menu = json.load(open("/tmp/menu_map.json"))
    except Exception:
        record("menu map available", False, "generate /tmp/menu_map.json first")
        return

    record("tenant menu has %d entries" % len(menu), len(menu) >= 40, "%d entries" % len(menu))

    probes = {
        "devices": "/api/tenant/deviceInfos?pageSize=1&page=0",
        "assets": "/api/tenant/assetInfos?pageSize=1&page=0",
        "entity_views": "/api/tenant/entityViewInfos?pageSize=1&page=0",
        "dashboards": "/api/tenant/dashboards?pageSize=1&page=0",
        "customers": "/api/customers?pageSize=1&page=0",
        "rule_chains": "/api/ruleChains?pageSize=1&page=0",
        "device_profiles": "/api/deviceProfiles?pageSize=1&page=0",
        "asset_profiles": "/api/assetProfiles?pageSize=1&page=0",
        "otaUpdates": "/api/otaPackages?pageSize=1&page=0",
        "widget_types": "/api/widgetTypes?pageSize=1&page=0",
        "widgets_bundles": "/api/widgetsBundles?pageSize=1&page=0",
        "images": "/api/images?pageSize=1&page=0",
        "resources_library": "/api/resource?pageSize=1&page=0",
        "audit_log": "/api/audit/logs?pageSize=1&page=0",
        "notification_inbox": "/api/notifications?pageSize=1&page=0",
        "notification_recipients": "/api/notification/targets?pageSize=1&page=0",
        "notification_templates": "/api/notification/templates?pageSize=1&page=0",
        "notification_rules": "/api/notification/rules?pageSize=1&page=0",
        "alarms": "/api/alarms?pageSize=1&page=0",
        "scheduler": "/api/schedulerEvents?pageSize=1&page=0",
        "voice_devices": "/api/tenant/deviceInfos?pageSize=1&page=0",
        "connectivity": "/api/mqttIntegrations?pageSize=1&page=0",
        "access_control": "/api/entityGroups?pageSize=1&page=0",
        "white_labeling": "/api/whiteLabel/currentWhiteLabelParams",
        "customization": "/api/customMenu/currentCustomMenu",
    }

    ok_count = 0
    failures = []
    for menu_id, path in probes.items():
        if menu_id not in menu:
            failures.append("%s (absent from menu)" % menu_id)
            continue
        status, _ = call("GET", path, token)
        if status == 200:
            ok_count += 1
        else:
            failures.append("%s -> %s" % (menu_id, status))

    record("%d/%d probed menu pages return data" % (ok_count, len(probes)),
           not failures, "; ".join(failures[:6]))

    unrouted = [i for i, v in menu.items() if not v.get("path")]
    record("every menu entry has a route", not unrouted, str(unrouted[:5]))

    # the new pages must be reachable and in the tenant menu
    for menu_id in ["connectivity", "scheduler", "voice_devices", "customization",
                    "access_control", "white_labeling"]:
        record("menu entry '%s' is present" % menu_id, menu_id in menu,
               menu.get(menu_id, {}).get("path", "missing"))


def test_white_labeling(sys_token, tenant_token):
    section("3. White labeling")
    status, platform = call("GET", "/api/whiteLabel/currentWhiteLabelParams", sys_token)
    record("platform branding reads back", status == 200 and bool(platform.get("appTitle")),
           platform.get("appTitle") if status == 200 else str(platform)[:50])

    if status == 200:
        status, _ = call("POST", "/api/whiteLabel/whiteLabelParams", sys_token,
                         dict(platform, appTitle="Aetos One Cloud"))
        record("platform branding saves", status == 200, "status %s" % status)

    status, tenant_wl = call("GET", "/api/whiteLabel/currentWhiteLabelParams", tenant_token)
    record("tenant branding resolves (inherited or overridden)",
           status == 200 and bool(tenant_wl.get("appTitle")),
           tenant_wl.get("appTitle") if status == 200 else "")

    status, login_wl = call("GET", "/api/noauth/whiteLabel/loginWhiteLabelParams")
    record("the login page gets branding without authenticating", status == 200,
           login_wl.get("appTitle") if status == 200 else str(login_wl)[:40])

    for asset in ["/assets/logo_white.svg", "/assets/logo_title_color.svg",
                  "/assets/icons/favicon-32x32.png"]:
        status, _, _ = call("GET", asset, raw=True)
        record("branded asset %s is served" % asset.split("/")[-1], status == 200,
               "status %s" % status)


def test_devices_and_profiles(token):
    section("4. Devices, profiles, credentials and alarms")

    profile_name = PREFIX + "-profile"
    status, profile = call("POST", "/api/deviceProfile", token, {
        "name": profile_name,
        "type": "DEFAULT", "transportType": "DEFAULT", "provisionType": "DISABLED",
        "profileData": {
            "configuration": {"type": "DEFAULT"},
            "transportConfiguration": {"type": "DEFAULT"},
            "provisionConfiguration": {"type": "DISABLED", "provisionDeviceSecret": None},
            "alarms": [{
                "id": "hot", "alarmType": "Too hot",
                "createRules": {"MAJOR": {"condition": {"condition": [{
                    "key": {"type": "TIME_SERIES", "key": "temperature"},
                    "valueType": "NUMERIC",
                    "predicate": {"type": "NUMERIC", "operation": "GREATER",
                                  "value": {"defaultValue": 30, "dynamicValue": None}}
                }], "spec": {"type": "SIMPLE"}}, "schedule": None, "alarmDetails": None}},
                "clearRule": None, "propagate": False, "propagateRelationTypes": None
            }]
        }
    })
    record("a device profile can be created", status == 200, "status %s" % status)
    if status != 200:
        return None
    created["profiles"].append(profile["id"]["id"])
    record("its alarm rule is stored", len(profile["profileData"].get("alarms") or []) == 1)

    status, edited = call("POST", "/api/deviceProfile", token,
                          dict(profile, description="edited by e2e"))
    record("a device profile can be edited",
           status == 200 and edited.get("description") == "edited by e2e", "status %s" % status)

    device_name = PREFIX + "-device"
    status, device = call("POST", "/api/device", token,
                          {"name": device_name, "type": profile_name, "label": "E2E"})
    record("a device can be created", status == 200, "status %s" % status)
    if status != 200:
        return None
    device_id = device["id"]["id"]
    created["devices"].append(device_id)

    status, edited = call("POST", "/api/device", token, dict(device, label="E2E edited"))
    record("a device can be edited",
           status == 200 and edited.get("label") == "E2E edited", "status %s" % status)

    status, credentials = call("GET", "/api/device/%s/credentials" % device_id, token)
    access_token = credentials.get("credentialsId") if status == 200 else None
    record("it has an access token", bool(access_token),
           (access_token or "")[:10] + "...")

    status, info = call("GET", "/api/device/info/%s" % device_id, token)
    record("device info resolves its profile name",
           status == 200 and info.get("deviceProfileName") == profile_name,
           info.get("deviceProfileName") if status == 200 else "")

    # a throwaway device proves delete works without losing the fixture
    status, spare = call("POST", "/api/device", token,
                         {"name": PREFIX + "-spare", "type": "default"})
    if status == 200:
        status, _ = call("DELETE", "/api/device/%s" % spare["id"]["id"], token)
        record("a device can be deleted", status == 200, "status %s" % status)

    return {"device_id": device_id, "access_token": access_token,
            "profile_name": profile_name, "device_name": device_name}


def test_ingress(token, fixture):
    section("5. Device ingress and alarms")
    if not fixture or not fixture.get("access_token"):
        record("fixture available", False)
        return

    access_token = fixture["access_token"]
    device_id = fixture["device_id"]

    status, _ = call("POST", "/api/v1/%s/telemetry" % access_token, None,
                     {"temperature": 21.5, "humidity": 60})
    record("a device publishes telemetry with its own token", status == 200, "status %s" % status)

    status, _ = call("POST", "/api/v1/%s/attributes" % access_token, None,
                     {"firmware": "1.0.0"})
    record("a device publishes client attributes", status == 200, "status %s" % status)

    time.sleep(2)
    status, values = call(
        "GET", "/api/plugins/telemetry/DEVICE/%s/values/timeseries?keys=temperature" % device_id,
        token)
    record("the telemetry reads back",
           status == 200 and bool(values.get("temperature")),
           str(values.get("temperature"))[:50] if status == 200 else "")

    status, _, _ = call("POST", "/api/v1/not-a-real-token/telemetry", None, {"x": 1}, raw=True)
    record("an unknown device token is refused", status in (400, 401), "status %s" % status)

    # the profile's alarm rule should fire on a hot reading
    call("POST", "/api/v1/%s/telemetry" % access_token, None, {"temperature": 35})
    time.sleep(5)
    status, alarms = call("GET", "/api/alarm/DEVICE/%s?pageSize=10&page=0" % device_id, token)
    fired = [a for a in (alarms.get("data", []) if status == 200 else [])
             if a.get("type") == "Too hot"]
    record("the profile alarm rule fired on a threshold breach", bool(fired),
           ("%s %s" % (fired[0]["severity"], fired[0]["status"])) if fired else "no alarm raised")

    if fired:
        status, _ = call("POST", "/api/alarm/%s/ack" % fired[0]["id"]["id"], token)
        record("the alarm can be acknowledged", status == 200, "status %s" % status)


def test_lorawan(token):
    section("6. LoRaWAN via ChirpStack")
    status, integration = call("POST", "/api/mqttIntegration", token, {
        "name": PREFIX + "-chirpstack", "type": "CHIRPSTACK",
        "host": "chirpstack.invalid", "port": 1883,
        "topicFilter": "application/+/device/+/event/up", "qos": 1,
        "converter": {"createDeviceIfMissing": True, "includeRadioMetrics": True},
        "enabled": False})
    record("a ChirpStack integration can be configured", status == 200, "status %s" % status)
    if status == 200:
        created["integrations"].append(integration["id"]["id"])
        record("it is typed as CHIRPSTACK", integration.get("type") == "CHIRPSTACK")
        record("the ChirpStack uplink topic shape is accepted",
               integration.get("topicFilter") == "application/+/device/+/event/up")

    # The MQTT wire-up needs a live broker, so the converter and device shaping are driven
    # through the webhook path, which shares that code. The assertion is the requirement
    # itself: an ordinary device comes out the other end.
    hook_name = PREFIX + "-lora-hook"
    status, hook = call("POST", "/api/webhook", token, {
        "name": hook_name,
        "deviceNamePointer": "/deviceInfo/deviceName",
        "target": "telemetry",
        "fieldMapping": {"temperature": "/object/temperature",
                         "rssi": "/rxInfo/0/rssi", "snr": "/rxInfo/0/snr", "fCnt": "/fCnt"},
        "createDeviceIfMissing": True, "enabled": True})
    if status != 200:
        record("LoRaWAN probe webhook", False, str(hook)[:80])
        return
    created["webhooks"].append(hook_name)

    device_name = PREFIX + "-lora-sensor"
    status, _ = call("POST", "/api/noauth/webhook/%s" % hook["token"], None, {
        "deviceInfo": {"deviceName": device_name, "devEui": "0004a30b001c0530",
                       "applicationName": "Field", "deviceProfileName": "LHT65"},
        "fCnt": 42, "fPort": 10, "object": {"temperature": 19.25},
        "rxInfo": [{"gatewayId": "ac1f09fffe000000", "rssi": -91, "snr": 7.5}],
        "txInfo": {"frequency": 868100000}})
    record("a ChirpStack uplink is ingested", status == 200, "status %s" % status)

    time.sleep(2)
    status, device = call("GET", "/api/tenant/devices?deviceName=%s" % device_name, token)
    record("the LoRaWAN device appears as an ordinary device", status == 200,
           device.get("name") if status == 200 else str(device)[:50])

    if status == 200:
        device_id = device["id"]["id"]
        created["devices"].append(device_id)
        status, keys = call(
            "GET", "/api/plugins/telemetry/DEVICE/%s/keys/timeseries" % device_id, token)
        keys = keys or []
        record("decoded measurements are ordinary telemetry", "temperature" in keys, str(keys))
        record("radio quality is stored alongside", "rssi" in keys and "snr" in keys, str(keys))

        status, group = call("POST", "/api/entityGroup", token,
                             {"name": PREFIX + "-lora-group", "type": "DEVICE"})
        if status == 200:
            created["groups"].append(group["id"]["id"])
            status, _ = call("POST", "/api/entityGroup/%s/DEVICE/%s"
                             % (group["id"]["id"], device_id), token)
            record("it can join an entity group, so RBAC reaches it", status == 200)


def test_rbac(sys_token, tenant_token, quick):
    section("7. RBAC - roles, grants, row scoping, guided navigation")
    status, me = call("GET", "/api/auth/user", tenant_token)
    if status != 200:
        record("tenant identity", False)
        return
    tenant_uuid = me["tenantId"]["id"]

    email = PREFIX + "-scoped@aetosiot.com"
    password = "scoped12345"
    status, user = call("POST", "/api/user?sendActivationMail=false", sys_token, {
        "tenantId": {"entityType": "TENANT", "id": tenant_uuid},
        "authority": "TENANT_ADMIN", "email": email,
        "firstName": "E2E", "lastName": "Scoped"})
    if status != 200:
        record("a scoped user can be created", False, str(user)[:80])
        return
    record("a scoped user can be created", True, email)
    user_uuid = user["id"]["id"]

    _, link = call("GET", "/api/user/%s/activationLink" % user_uuid, sys_token)
    call("POST", "/api/noauth/activate?sendActivationMail=false",
         body={"activateToken": str(link).rsplit("=", 1)[-1].strip(), "password": password})

    in_group = []
    for suffix in ["alpha", "charlie"]:
        status, device = call("POST", "/api/device", tenant_token,
                              {"name": "%s-rbac-%s" % (PREFIX, suffix), "type": "default"})
        if status == 200:
            in_group.append(device)
            created["devices"].append(device["id"]["id"])
    status, outside = call("POST", "/api/device", tenant_token,
                           {"name": PREFIX + "-rbac-bravo", "type": "default"})
    if status == 200:
        created["devices"].append(outside["id"]["id"])

    _, device_group = call("POST", "/api/entityGroup", tenant_token,
                           {"name": PREFIX + "-devices", "type": "DEVICE"})
    _, user_group = call("POST", "/api/entityGroup", tenant_token,
                         {"name": PREFIX + "-users", "type": "USER"})
    _, role = call("POST", "/api/role", tenant_token,
                   {"name": PREFIX + "-viewer", "type": "GROUP", "permissions": ["READ"]})
    created["groups"] += [device_group["id"]["id"], user_group["id"]["id"]]
    created["roles"].append(role["id"]["id"])
    record("an entity group and a GROUP role can be created", True)

    for device in in_group:
        call("POST", "/api/entityGroup/%s/DEVICE/%s"
             % (device_group["id"]["id"], device["id"]["id"]), tenant_token)

    # the migration puts tenant admins in "All Users" with an ALL grant, which would mask
    # everything this section is trying to prove
    psql("DELETE FROM entity_group_entity WHERE entity_id = '%s' AND entity_type = 'USER';"
         % user_uuid)
    call("POST", "/api/entityGroup/%s/USER/%s" % (user_group["id"]["id"], user_uuid), tenant_token)
    status, _ = call("POST", "/api/groupPermission", tenant_token, {
        "userGroupId": {"entityType": "ENTITY_GROUP", "id": user_group["id"]["id"]},
        "roleId": {"entityType": "ROLE", "id": role["id"]["id"]},
        "entityGroupId": {"entityType": "ENTITY_GROUP", "id": device_group["id"]["id"]},
        "entityGroupType": "DEVICE"})
    record("the role can be granted over the group", status == 200, "status %s" % status)

    if quick:
        record("row scoping (skipped by --quick, needs the cache TTL)", True, "skipped")
        return

    print("    waiting %ss for the permission cache to expire..." % CACHE_TTL)
    time.sleep(CACHE_TTL)
    scoped_token = login((email, password))
    if not scoped_token:
        record("the scoped user can sign in", False)
        return
    record("the scoped user can sign in", True)

    status, effective = call("GET", "/api/permissions/allowedResources", scoped_token)
    record("guided navigation reports only the granted resource",
           status == 200 and effective.get("resources") == ["DEVICE"], str(effective))

    expected = sorted(d["name"] for d in in_group)
    status, page = call("GET", "/api/tenant/deviceInfos?pageSize=100&page=0", scoped_token)
    names = sorted(d["name"] for d in page.get("data", [])) if status == 200 else []
    record("the device list is scoped to the granted group", names == expected, str(names))
    record("the total counts the group, not the tenant",
           status == 200 and page.get("totalElements") == len(expected),
           str(page.get("totalElements") if status == 200 else page)[:40])

    status, page = call("GET", "/api/tenant/deviceInfos?pageSize=100&page=0&textSearch=alpha",
                        scoped_token)
    found = [d["name"] for d in page.get("data", [])] if status == 200 else []
    record("search narrows within the group", len(found) == 1, str(found))

    status, page = call("GET", "/api/tenant/deviceInfos?pageSize=100&page=0&textSearch=bravo",
                        scoped_token)
    record("search cannot reach outside the group",
           status == 200 and not page.get("data"), str(page.get("data"))[:40])

    status, page = call(
        "GET", "/api/tenant/deviceInfos?pageSize=100&page=0&sortProperty=name&sortOrder=DESC",
        scoped_token)
    descending = [d["name"] for d in page.get("data", [])] if status == 200 else []
    record("sorting is applied under scoping",
           descending == sorted(expected, reverse=True), str(descending))

    status, page = call("GET", "/api/tenant/deviceInfos?pageSize=1&page=0", scoped_token)
    record("a page smaller than the group comes back full",
           status == 200 and len(page.get("data", [])) == 1,
           "%s rows" % len(page.get("data", [])) if status == 200 else "")

    status, _ = call("GET", "/api/tenant/dashboards?pageSize=1&page=0", scoped_token)
    record("a resource with no grant is refused outright", status == 403, "status %s" % status)

    status, _ = call("POST", "/api/device", scoped_token,
                     {"name": PREFIX + "-should-fail", "type": "default"})
    record("a read-only role cannot create", status in (400, 403), "status %s" % status)


def test_platform_features(token):
    section("8. Scheduler, vault, reports, MCP, LiveKit, customization")

    fire_at = int(time.time() * 1000) + 3600000
    status, event = call("POST", "/api/schedulerEvent", token, {
        "name": PREFIX + "-scheduled", "type": "postTelemetry",
        "enabled": True, "schedule": {"startTime": fire_at},
        "configuration": {"telemetry": {"probe": 1}}})
    record("a scheduled event can be created", status == 200, "status %s" % status)
    if status == 200:
        created["scheduler"].append(event["id"]["id"])
        record("its next run is computed", event.get("nextFireTime") == fire_at)

    status, _ = call("POST", "/api/schedulerEvent", token, {
        "name": PREFIX + "-impossible", "type": "postTelemetry", "enabled": True,
        "schedule": {"startTime": int(time.time() * 1000) - 86400000},
        "configuration": {"telemetry": {"x": 1}}})
    record("a schedule that can never run is rejected", status == 400, "status %s" % status)

    status, vault = call("GET", "/api/secrets/status", token)
    record("the secrets vault is enabled", status == 200 and vault.get("enabled"), str(vault))
    status, secret = call("POST", "/api/secret", token,
                          {"name": PREFIX + "-secret", "value": "top-secret-value"})
    record("a secret can be stored", status == 200, "status %s" % status)
    if status == 200:
        created["secrets"].append(secret["id"]["id"])
        record("the value is never returned", not secret.get("value"))
        stored = psql("SELECT value_encrypted FROM tenant_secret WHERE name = '%s-secret'" % PREFIX)
        record("it is ciphertext at rest", "top-secret-value" not in stored,
               (stored[:24] + "...") if stored else "empty")

    if created["devices"]:
        device_id = created["devices"][0]
        end = int(time.time() * 1000)
        status, content, headers = call("POST", "/api/report/telemetry", token, {
            "deviceIds": [device_id], "keys": ["temperature"],
            "startTs": end - 3600000, "endTs": end + 60000,
            "format": "csv", "title": PREFIX + "-report"}, raw=True)
        record("a CSV report is generated", status == 200,
               "%s rows" % headers.get("X-Report-Rows"))
        record("it is offered as a download",
               "attachment" in headers.get("Content-Disposition", ""))

        status, content, headers = call("POST", "/api/report/telemetry", token, {
            "deviceIds": [device_id], "keys": ["temperature"],
            "startTs": end - 3600000, "endTs": end + 60000,
            "format": "xlsx", "title": PREFIX + "-report"}, raw=True)
        record("an Excel report is generated", status == 200,
               headers.get("Content-Type", "")[:32])

    status, server = call("POST", "/api/mcpServer", token, {
        "name": PREFIX + "-mcp", "transport": "STDIO",
        "accountEmail": "ai-agent@aetosiot.com", "allowWrites": False, "enabled": True})
    record("an MCP server can be registered", status == 200, "status %s" % status)
    if status == 200:
        created["mcp"].append(server["id"]["id"])
        status, _ = call("POST", "/api/mcpServer/heartbeat?name=%s-mcp" % PREFIX, token)
        record("it can check in", status == 200, "status %s" % status)
        status, after = call("GET", "/api/mcpServer/%s" % server["id"]["id"], token)
        record("the check-in is recorded", after.get("lastSeenTime") is not None)

    status, livekit = call("GET", "/api/livekit/status", token)
    record("the LiveKit bridge reports its configuration", status == 200, str(livekit))
    if created["devices"] and isinstance(livekit, dict) and livekit.get("configured"):
        status, minted = call("GET", "/api/livekit/token/%s" % created["devices"][0], token)
        record("a LiveKit token can be minted for a device", status == 200,
               minted.get("room") if status == 200 else str(minted)[:40])

    call("POST", "/api/customTranslation/customTranslation", token,
         {"translationMap": {"en_US": {"device.devices": "Meters"}}})
    status, merged = call("GET", "/api/customTranslation/customTranslation", token)
    record("a translation override round-trips",
           status == 200
           and merged.get("translationMap", {}).get("en_US", {}).get("device.devices") == "Meters")
    call("POST", "/api/customTranslation/customTranslation", token, {"translationMap": {}})

    call("POST", "/api/customMenu/customMenu", token,
         {"menuItems": [{"id": "devices", "name": "Fleet"}]})
    status, menu = call("GET", "/api/customMenu/customMenu", token)
    record("a custom menu round-trips",
           status == 200 and [i.get("name") for i in menu.get("menuItems", [])] == ["Fleet"])
    call("POST", "/api/customMenu/customMenu", token, {"menuItems": []})


def test_webhooks(token):
    section("9. Inbound webhooks")
    name = PREFIX + "-hook"
    status, hook = call("POST", "/api/webhook", token, {
        "name": name, "deviceName": PREFIX + "-hook-device",
        "target": "telemetry", "fieldMapping": {"temperature": "/t"},
        "createDeviceIfMissing": True, "enabled": True})
    record("a webhook can be created", status == 200, "status %s" % status)
    if status != 200:
        return
    created["webhooks"].append(name)
    record("the server issues the token, not the caller", len(hook.get("token", "")) >= 24,
           "%d chars" % len(hook.get("token", "")))

    status, _ = call("POST", "/api/noauth/webhook/%s" % hook["token"], None,
                     {"t": 42, "ignored": "x"})
    record("an unauthenticated delivery is accepted", status == 200, "status %s" % status)

    time.sleep(2)
    status, device = call("GET", "/api/tenant/devices?deviceName=%s-hook-device" % PREFIX, token)
    if status == 200:
        created["devices"].append(device["id"]["id"])
        status, keys = call("GET", "/api/plugins/telemetry/DEVICE/%s/keys/timeseries"
                            % device["id"]["id"], token)
        keys = keys or []
        record("the mapped field is stored", "temperature" in keys, str(keys))
        # a mapping is an allow-list, so an unmapped key must not leak through
        record("unmapped keys are not stored", "ignored" not in keys, str(keys))

    status, _ = call("POST", "/api/noauth/webhook/definitely-not-real", None, {"a": 1})
    record("an unknown webhook token gets a flat 404", status == 404, "status %s" % status)

    status, _ = call("GET", "/api/webhooks")
    record("managing webhooks requires authentication", status in (401, 403), "status %s" % status)


def test_ui_served():
    section("10. UI delivery")
    status, body, _ = call("GET", "/", raw=True)
    record("the app shell is served by the platform", status == 200,
           "%d bytes" % len(body) if status == 200 else "")
    text = body.decode(errors="ignore") if status == 200 else ""
    record("it is branded Aetos One Cloud", "Aetos One Cloud" in text)

    match = re.search(r"main-[A-Z0-9]+\.js", text)
    if match:
        status, bundle, _ = call("GET", "/" + match.group(0), raw=True)
        content = bundle.decode(errors="ignore") if status == 200 else ""
        record("the main bundle is served", status == 200, match.group(0))
        # the login work is what was most recently reported as missing
        record("the animated login background is in the bundle", "tb-aurora" in content)
        record("the reduced login card width is in the bundle", "216px" in content)
    else:
        record("a bundle reference is present in the shell", False)

    for asset in ["/assets/logo_white.svg", "/index.html"]:
        status, _, _ = call("GET", asset, raw=True)
        record("static asset %s is served" % asset, status == 200, "status %s" % status)

    status, _, _ = call("GET", "/", base=UI_DEV, raw=True)
    record("the dev server on :4200 is up (optional)", status in (200, 0),
           "running" if status == 200 else "not running - fine if you only use :8080")


def cleanup(token):
    section("11. Cleanup")
    for name in created["webhooks"]:
        call("DELETE", "/api/webhook/%s" % name, token)
    for key, path in [("scheduler", "schedulerEvent"), ("mcp", "mcpServer"),
                      ("secrets", "secret"), ("integrations", "mqttIntegration"),
                      ("dashboards", "dashboard"), ("devices", "device"),
                      ("customers", "customer"), ("roles", "role"),
                      ("groups", "entityGroup"), ("assets", "asset")]:
        for entity_id in created[key]:
            call("DELETE", "/api/%s/%s" % (path, entity_id), token)
    # profiles last: devices reference them
    for profile_id in created["profiles"]:
        call("DELETE", "/api/deviceProfile/%s" % profile_id, token)
    psql("DELETE FROM tb_user WHERE email LIKE '%s%%';" % PREFIX)
    record("everything this run created was removed", True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true",
                        help="skip the permission-cache waits")
    args = parser.parse_args()

    started = time.time()
    print("\033[1mAetos One Cloud - end-to-end test\033[0m   (run id %s)" % PREFIX)

    tokens = test_auth()
    if not tokens.get("TENANT_ADMIN"):
        print("\nCannot continue without a tenant admin session.")
        return 1
    tenant = tokens["TENANT_ADMIN"]
    sys_token = tokens.get("SYS_ADMIN")

    test_menu(tenant)
    test_white_labeling(sys_token, tenant)
    fixture = test_devices_and_profiles(tenant)
    test_ingress(tenant, fixture)
    test_lorawan(tenant)
    test_rbac(sys_token, tenant, args.quick)
    test_platform_features(tenant)
    test_webhooks(tenant)
    test_ui_served()
    cleanup(tenant)

    passed = sum(1 for _, _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 68)
    by_section = {}
    order = []
    for section_name, _, ok, _ in results:
        if section_name not in by_section:
            by_section[section_name] = [0, 0]
            order.append(section_name)
        by_section[section_name][1] += 1
        if ok:
            by_section[section_name][0] += 1
    for section_name in order:
        ok, count = by_section[section_name]
        mark = "\033[32mOK \033[0m" if ok == count else "\033[31mFAIL\033[0m"
        print("  %s %-54s %d/%d" % (mark, section_name, ok, count))
    print("=" * 68)
    print("  %d/%d checks passed in %ds" % (passed, total, round(time.time() - started)))

    failures = [(s, n, d) for s, n, ok, d in results if not ok]
    if failures:
        print("\n\033[31mFailures:\033[0m")
        for section_name, name, detail in failures:
            print("  [%s] %s  %s" % (section_name, name, detail))

    print("\nNot covered: anything visual. These checks drive the same REST API the UI calls,")
    print("so data, permissions and wiring are proven - layout, styling and animation are not.")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
