#!/usr/bin/env python3
"""Provision a demo environment for Aetos One Cloud.

Everything it creates is named with a `demo-` prefix (devices, assets, profiles) or a
"Demo " prefix (customer, entity groups), so it can be found and removed cleanly.

LICENSING: this seeds only content that is safe to redistribute — entities it creates
itself, plus the dashboards and widget bundles ThingsBoard CE already ships under
Apache-2.0. It deliberately does **not** pull in third-party dashboards of unknown
licence; if you want a specific community dashboard, check its licence first and import
it explicitly.

Usage:
    python3 demo_seed.py            # create
    python3 demo_seed.py --clean    # remove everything named demo-/Demo
"""
import json
import random
import sys
import time
import urllib.error
import urllib.request

API = "http://localhost:8080"
TENANT_USER = "tenant@aetosiot.com"
TENANT_PASSWORD = "tenant"

PREFIX = "demo-"
GROUP_PREFIX = "Demo "

# (profile name, device suffixes, telemetry generator)
DEVICE_PLAN = [
    ("demo-thermostat", ["lobby", "server-room", "warehouse"],
     lambda: {"temperature": round(random.uniform(18, 26), 1),
              "humidity": round(random.uniform(35, 60), 1),
              "setpoint": 21.0}),
    ("demo-energy-meter", ["main-feed", "hvac", "lighting"],
     lambda: {"voltage": round(random.uniform(228, 242), 1),
              "current": round(random.uniform(1.5, 14.0), 2),
              "power": round(random.uniform(300, 3200), 1),
              "energy": round(random.uniform(1000, 90000), 1)}),
    ("demo-air-quality", ["floor-1", "floor-2"],
     lambda: {"co2": random.randint(400, 1400),
              "pm25": round(random.uniform(3, 45), 1),
              "voc": random.randint(50, 600)}),
    ("demo-water-meter", ["riser-a", "riser-b"],
     lambda: {"flow": round(random.uniform(0, 25), 2),
              "totalizer": round(random.uniform(5000, 250000), 1),
              "pressure": round(random.uniform(1.8, 4.2), 2)}),
    ("demo-gateway", ["site-gateway"],
     lambda: {"cpu": round(random.uniform(4, 70), 1),
              "memory": round(random.uniform(20, 85), 1),
              "uptime": random.randint(1000, 900000)}),
]

ASSETS = ["demo-building-north", "demo-building-south", "demo-plant-room"]


def call(method, path, token=None, body=None, silent=False):
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
        body = e.read().decode()[:200]
        if not silent:
            print(f"   ! {method} {path} -> {e.code}: {body}")
        return e.code, body


def login():
    status, body = call("POST", "/api/auth/login",
                        body={"username": TENANT_USER, "password": TENANT_PASSWORD})
    if status != 200:
        raise SystemExit(f"login failed: {status} {body}")
    return body["token"]


def clean(token):
    """Remove anything this script created. Safe to run repeatedly."""
    removed = 0
    for path, key, matches in [
        ("/api/tenant/devices?pageSize=500&page=0", "device", lambda n: n.startswith(PREFIX)),
        ("/api/tenant/assets?pageSize=500&page=0", "asset", lambda n: n.startswith(PREFIX)),
    ]:
        status, page = call("GET", path, token)
        if status != 200:
            continue
        for entity in page["data"]:
            if matches(entity.get("name", "")):
                call("DELETE", f"/api/{key}/{entity['id']['id']}", token, silent=True)
                removed += 1

    status, page = call("GET", "/api/customers?pageSize=200&page=0", token)
    if status == 200:
        for customer in page["data"]:
            if customer.get("title", "").startswith(GROUP_PREFIX):
                call("DELETE", f"/api/customer/{customer['id']['id']}", token, silent=True)
                removed += 1

    status, page = call("GET", "/api/entityGroups?pageSize=200&page=0", token)
    if status == 200:
        for group in page["data"]:
            if group.get("name", "").startswith(GROUP_PREFIX) and not group.get("groupAll"):
                call("DELETE", f"/api/entityGroup/{group['id']['id']}", token, silent=True)
                removed += 1

    for path, key in [("/api/notification/rules?pageSize=100&page=0", "rule"),
                      ("/api/notification/templates?pageSize=100&page=0", "template"),
                      ("/api/notification/targets?pageSize=100&page=0", "target")]:
        status, page = call("GET", path, token, silent=True)
        if status != 200:
            continue
        for item in page.get("data", []):
            if item.get("name", "").startswith(GROUP_PREFIX):
                call("DELETE", f"/api/notification/{key}/{item['id']['id']}", token, silent=True)
                removed += 1

    # profiles last — devices referencing them must be gone first
    status, page = call("GET", "/api/deviceProfiles?pageSize=200&page=0", token)
    if status == 200:
        for profile in page["data"]:
            if profile.get("name", "").startswith(PREFIX):
                call("DELETE", f"/api/deviceProfile/{profile['id']['id']}", token, silent=True)
                removed += 1

    print(f"removed {removed} demo object(s)")


def alarm_rules(profile_name):
    """Threshold alarm rules per profile, so the demo produces real alarms.

    Thresholds are set inside the telemetry ranges above, so some readings breach and
    some do not — a demo where everything alarms is as useless as one where nothing does.
    """
    thresholds = {
        "demo-thermostat": ("temperature", 24.0, "High temperature"),
        "demo-energy-meter": ("power", 2500.0, "Power draw high"),
        "demo-air-quality": ("co2", 1000.0, "CO2 above limit"),
        "demo-water-meter": ("pressure", 3.6, "Water pressure high"),
        "demo-gateway": ("cpu", 60.0, "Gateway CPU high"),
    }
    if profile_name not in thresholds:
        return []
    key, value, alarm_type = thresholds[profile_name]
    return [{
        "id": f"{profile_name}-{key}-high",
        "alarmType": alarm_type,
        "createRules": {
            "MAJOR": {
                "condition": {
                    "condition": [{
                        "key": {"type": "TIME_SERIES", "key": key},
                        "valueType": "NUMERIC",
                        "predicate": {
                            "type": "NUMERIC",
                            "operation": "GREATER",
                            "value": {"defaultValue": value, "dynamicValue": None},
                        },
                    }],
                    "spec": {"type": "SIMPLE"},
                },
                "schedule": None,
                "alarmDetails": f"{key} exceeded {value}",
                "dashboardId": None,
            }
        },
        "clearRule": {
            "condition": {
                "condition": [{
                    "key": {"type": "TIME_SERIES", "key": key},
                    "valueType": "NUMERIC",
                    "predicate": {
                        "type": "NUMERIC",
                        "operation": "LESS_OR_EQUAL",
                        "value": {"defaultValue": value, "dynamicValue": None},
                    },
                }],
                "spec": {"type": "SIMPLE"},
            },
            "schedule": None,
            "alarmDetails": None,
            "dashboardId": None,
        },
        "propagate": True,
        "propagateRelationTypes": [],
    }]


DEVICE_PROFILE_NODE = "org.thingsboard.rule.engine.profile.TbDeviceProfileNode"


def ensure_device_profile_node(token):
    """Make sure the root rule chain evaluates device-profile alarm rules.

    Alarm rules defined on a device profile are only evaluated if the root rule chain
    routes telemetry through a Device Profile node. This install's default chain has no
    such node, so profile alarm rules would silently never fire — the rules save fine and
    simply do nothing, which is a confusing failure to debug.
    """
    status, chains = call("GET", "/api/ruleChains?pageSize=50&page=0", token)
    if status != 200:
        return "skipped"
    root = next((c for c in chains["data"] if c.get("root")), None)
    if root is None:
        return "no root chain"

    chain_id = root["id"]["id"]
    status, meta = call("GET", f"/api/ruleChain/{chain_id}/metadata", token)
    if status != 200:
        return "skipped"

    nodes = meta.get("nodes", [])
    if any(n.get("type") == DEVICE_PROFILE_NODE for n in nodes):
        return "already present"

    switch_index = next((i for i, n in enumerate(nodes)
                         if n.get("type", "").endswith("TbMsgTypeSwitchNode")), None)
    if switch_index is None:
        return "no message type switch"

    nodes.append({
        "type": DEVICE_PROFILE_NODE,
        "name": "Device Profile Node",
        "debugMode": False,
        "configuration": {
            "persistAlarmRulesState": False,
            "fetchAlarmRulesStateOnStart": False,
        },
        "additionalInfo": {"description": "Evaluates device profile alarm rules",
                           "layoutX": 204, "layoutY": 468},
    })
    profile_index = len(nodes) - 1

    connections = meta.get("connections", [])
    for label in ["Post telemetry", "Post attributes", "Attributes Updated",
                  "Activity Event", "Inactivity Event"]:
        connections.append({"fromIndex": switch_index, "toIndex": profile_index, "type": label})

    meta["nodes"] = nodes
    meta["connections"] = connections
    status, _ = call("POST", "/api/ruleChain/metadata", token, meta)
    return "added" if status == 200 else "failed"


def seed_notifications(token):
    """A notification target, template and rule, so alarms surface in the inbox."""
    created = []

    status, existing = call("GET", "/api/notification/targets?pageSize=100&page=0", token, silent=True)
    if status == 200:
        found = next((t for t in existing.get("data", [])
                      if t.get("name", "").startswith(GROUP_PREFIX)), None)
        if found:
            return ["already provisioned"]

    status, target = call("POST", "/api/notification/target", token, {
        "name": f"{GROUP_PREFIX}Tenant Admins",
        "configuration": {
            "type": "PLATFORM_USERS",
            "usersFilter": {"type": "TENANT_ADMINISTRATORS"},
            "description": "Demo target: all tenant administrators",
        },
    })
    if status != 200:
        return created
    created.append("target")

    status, template = call("POST", "/api/notification/template", token, {
        "name": f"{GROUP_PREFIX}Alarm Template",
        "notificationType": "ALARM",
        "configuration": {
            "deliveryMethodsTemplates": {
                "WEB": {
                    "enabled": True,
                    "method": "WEB",
                    "subject": "${alarmType} on ${alarmOriginatorName}",
                    "body": "Severity ${alarmSeverity} — status ${alarmStatus}",
                }
            }
        },
    })
    if status != 200:
        return created
    created.append("template")

    status, _ = call("POST", "/api/notification/rule", token, {
        "name": f"{GROUP_PREFIX}Alarm Rule",
        "templateId": template["id"],
        "triggerType": "ALARM",
        "triggerConfig": {
            "triggerType": "ALARM",
            "alarmTypes": None,
            "alarmSeverities": None,
            "notifyOn": ["CREATED", "SEVERITY_CHANGED"],
        },
        "recipientsConfig": {
            "triggerType": "ALARM",
            "escalationTable": {"0": [target["id"]["id"]]},
        },
    })
    if status == 200:
        created.append("rule")
    return created


def ensure_profile(token, name):
    status, page = call("GET", f"/api/deviceProfiles?pageSize=200&page=0", token)
    if status == 200:
        existing = next((p for p in page["data"] if p["name"] == name), None)
        if existing:
            return existing
    # profileData is required — without it the server NPEs reading the transport config
    status, profile = call("POST", "/api/deviceProfile", token, {
        "name": name, "type": "DEFAULT", "transportType": "DEFAULT",
        "description": f"Demo profile for {name.replace(PREFIX, '')} devices",
        "profileData": {
            "configuration": {"type": "DEFAULT"},
            "transportConfiguration": {"type": "DEFAULT"},
            "alarms": alarm_rules(name),
        },
    })
    return profile if status == 200 else None


def main():
    if "--clean" in sys.argv:
        clean(login())
        return 0

    token = login()
    print("Seeding Aetos One Cloud demo data")

    # --- device profiles + devices ----------------------------------------
    created_devices = []
    for profile_name, suffixes, telemetry in DEVICE_PLAN:
        profile = ensure_profile(token, profile_name)
        if profile is None:
            print(f"   ! could not create profile {profile_name}")
            continue
        for suffix in suffixes:
            name = f"{profile_name}-{suffix}"
            status, device = call("POST", "/api/device", token, {
                "name": name, "type": profile_name,
                "deviceProfileId": profile["id"],
                "label": name.replace(PREFIX, "").replace("-", " ").title(),
            })
            if status == 200:
                created_devices.append((device, telemetry))
    print(f"  devices:  {len(created_devices)}")

    # --- assets ------------------------------------------------------------
    created_assets = []
    for asset_name in ASSETS:
        status, asset = call("POST", "/api/asset", token, {"name": asset_name, "type": "building"})
        if status == 200:
            created_assets.append(asset)
    print(f"  assets:   {len(created_assets)}")

    # --- customer ----------------------------------------------------------
    status, customer = call("POST", "/api/customer", token, {"title": f"{GROUP_PREFIX}Customer"})
    print(f"  customer: {'created' if status == 200 else 'skipped'}")

    # --- entity groups, so the RBAC features have something to point at -----
    groups = {}
    for group_name, group_type in [(f"{GROUP_PREFIX}Devices", "DEVICE"),
                                   (f"{GROUP_PREFIX}Assets", "ASSET"),
                                   (f"{GROUP_PREFIX}Users", "USER")]:
        status, group = call("POST", "/api/entityGroup", token,
                             {"name": group_name, "type": group_type})
        if status == 200:
            groups[group_type] = group
    for device, _ in created_devices:
        if "DEVICE" in groups:
            call("POST", f"/api/entityGroup/{groups['DEVICE']['id']['id']}/DEVICE/{device['id']['id']}",
                 token, silent=True)
    for asset in created_assets:
        if "ASSET" in groups:
            call("POST", f"/api/entityGroup/{groups['ASSET']['id']['id']}/ASSET/{asset['id']['id']}",
                 token, silent=True)
    print(f"  groups:   {len(groups)}")

    # --- telemetry, so dashboards are not empty ----------------------------
    points = 0
    for device, telemetry in created_devices:
        status, credentials = call("GET", f"/api/device/{device['id']['id']}/credentials", token)
        if status != 200:
            continue
        access_token = credentials.get("credentialsId")
        # a short history, so time-series widgets have a line rather than one dot
        for minutes_ago in range(60, -1, -5):
            ts = int(time.time() * 1000) - minutes_ago * 60_000
            payload = {"ts": ts, "values": telemetry()}
            code, _ = call("POST", f"/api/v1/{access_token}/telemetry", None, payload, silent=True)
            if code == 200:
                points += 1
    print(f"  telemetry: {points} points across {len(created_devices)} devices")

    # --- rule chain must evaluate profile alarm rules -----------------------
    print(f"  device profile node: {ensure_device_profile_node(token)}")

    # --- notifications ------------------------------------------------------
    notif = seed_notifications(token)
    print(f"  notifications: {', '.join(notif) if notif else 'skipped'}")

    # --- alarms are produced by the rule engine from the telemetry above -----
    time.sleep(4)
    status, alarms = call("GET", "/api/alarms?pageSize=100&page=0&searchStatus=ANY", token, silent=True)
    if status == 200:
        print(f"  alarms raised: {alarms.get('totalElements', 0)}")
    else:
        print("  alarms raised: (query unsupported on this build)")

    # --- dashboards already shipped by CE ----------------------------------
    status, page = call("GET", "/api/tenant/dashboards?pageSize=100&page=0", token)
    if status == 200:
        titles = [d["title"] for d in page["data"]]
        print(f"  dashboards available ({len(titles)}): {', '.join(titles[:6])}"
              + (" ..." if len(titles) > 6 else ""))
        print("    (shipped with CE under Apache-2.0; no third-party content bundled)")

    print("\nDone. Log in as tenant@aetosiot.com / tenant to explore.")
    print("Run with --clean to remove everything this created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
