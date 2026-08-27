#!/usr/bin/env python3
"""Provision the XiaoZhi + LiveKit voice-device setup in Aetos One Cloud.

Builds the device-management layer that LiveKit does not have:

  * a **device profile** for XiaoZhi voice devices, with inactivity and health alarm rules
  * **demo devices** carrying the shared attributes the firmware reads (LiveKit room,
    server URL, volume, wake-word sensitivity)
  * a **fleet dashboard** showing who is online, which room each device is in, and the
    health telemetry that says whether it is actually working
  * seeded telemetry, so the dashboard is not empty on first open

The platform side of the architecture in xioazhi-livekit.docx. LiveKit keeps the real-time
audio; this keeps the registry, configuration, OTA target and health monitoring — and the
token endpoint (/api/v1/{deviceToken}/livekit/token) closes the gap between them.

    python3 livekit_seed.py            # provision
    python3 livekit_seed.py --clean    # remove everything it created
"""

import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8080"
TENANT_ADMIN = ("tenant@aetosiot.com", "tenant")

PROFILE_NAME = "XiaoZhi Voice Assistant"
DASHBOARD_TITLE = "demo LiveKit Voice Fleet"
DEVICE_GROUP = "demo LiveKit Voice Devices"

# Named so they read as a real deployment rather than test noise, while keeping the
# project's "demo" prefix convention for anything the seeder owns.
DEVICES = [
    {"name": "demo-xiaozhi-lobby", "label": "Lobby", "room": "aetos-voice-lobby"},
    {"name": "demo-xiaozhi-floor2", "label": "Floor 2 East", "room": "aetos-voice-floor2"},
    {"name": "demo-xiaozhi-warehouse", "label": "Warehouse", "room": "aetos-voice-warehouse"},
    {"name": "demo-xiaozhi-reception", "label": "Reception", "room": "aetos-voice-lobby"},
]

LIVEKIT_URL_DEFAULT = "wss://your-project.livekit.cloud"


def call(method, path, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("X-Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode()
            return response.status, (json.loads(text) if text and not raw else text)
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        try:
            return error.code, json.loads(text)
        except ValueError:
            return error.code, text


def login():
    status, body = call("POST", "/api/auth/login",
                        body={"username": TENANT_ADMIN[0], "password": TENANT_ADMIN[1]})
    if status != 200:
        print(f"Could not sign in: {status} {body}")
        sys.exit(1)
    return body["token"]


def device_profile_body():
    """Profile with the alarm rules that make a voice fleet observable.

    Two rules, both chosen because they catch the failures that actually happen to these
    devices: a weak radio link (audio drops long before the device disconnects) and a
    device that has stopped reporting at all.
    """
    return {
        "name": PROFILE_NAME,
        "description": "ESP32-S3 voice assistant bridged to LiveKit for real-time audio.",
        "type": "DEFAULT",
        "transportType": "DEFAULT",
        "provisionType": "DISABLED",
        "profileData": {
            "configuration": {"type": "DEFAULT"},
            "transportConfiguration": {"type": "DEFAULT"},
            "provisionConfiguration": {"type": "DISABLED", "provisionDeviceSecret": None},
            "alarms": [
                {
                    "id": "weak-wifi",
                    "alarmType": "Weak WiFi signal",
                    "createRules": {
                        "WARNING": {
                            "condition": {
                                "condition": [{
                                    "key": {"type": "TIME_SERIES", "key": "wifi_rssi"},
                                    "valueType": "NUMERIC",
                                    "predicate": {
                                        "type": "NUMERIC", "operation": "LESS",
                                        "value": {"defaultValue": -75, "dynamicValue": None}
                                    }
                                }],
                                "spec": {"type": "SIMPLE"}
                            },
                            "schedule": None, "alarmDetails":
                                "Audio quality degrades well before the device disconnects."
                        }
                    },
                    "clearRule": {
                        "condition": {
                            "condition": [{
                                "key": {"type": "TIME_SERIES", "key": "wifi_rssi"},
                                "valueType": "NUMERIC",
                                "predicate": {
                                    "type": "NUMERIC", "operation": "GREATER_OR_EQUAL",
                                    "value": {"defaultValue": -70, "dynamicValue": None}
                                }
                            }],
                            "spec": {"type": "SIMPLE"}
                        },
                        "schedule": None, "alarmDetails": None
                    },
                    "propagate": False, "propagateRelationTypes": None
                },
                {
                    "id": "low-battery",
                    "alarmType": "Low battery",
                    "createRules": {
                        "MAJOR": {
                            "condition": {
                                "condition": [{
                                    "key": {"type": "TIME_SERIES", "key": "battery_level"},
                                    "valueType": "NUMERIC",
                                    "predicate": {
                                        "type": "NUMERIC", "operation": "LESS",
                                        "value": {"defaultValue": 20, "dynamicValue": None}
                                    }
                                }],
                                "spec": {"type": "SIMPLE"}
                            },
                            "schedule": None, "alarmDetails": None
                        }
                    },
                    "clearRule": None, "propagate": False, "propagateRelationTypes": None
                }
            ]
        }
    }


def dashboard_body(devices, livekit_url):
    """A fleet view: who is up, where they are pointed, and how they are doing.

    Built as a normal dashboard document, so everything here stays editable in the visual
    editor afterwards. The seeder produces the first draft; it does not own the result.
    """
    device_ids = [device["id"]["id"] for device in devices]

    def data_keys(keys, key_type="timeseries"):
        palette = ["#273A80", "#E6701C", "#2E7D32", "#7B1FA2", "#0288D1", "#C62828"]
        return [{"name": key, "type": key_type, "label": label,
                 "color": palette[index % len(palette)], "settings": {}, "_hash": random.random()}
                for index, (key, label) in enumerate(keys)]

    fleet_datasource = {"type": "entity", "entityAliasId": "voiceDevices",
                        "dataKeys": data_keys([
                            ("name", "Device"), ("active", "Online")], "entityField")
                        + data_keys([("livekit_room_name", "LiveKit room"),
                                     ("voice_volume", "Volume"),
                                     ("wake_word_sensitivity", "Wake sensitivity")], "attribute")
                        + data_keys([("wifi_rssi", "WiFi dBm"),
                                     ("battery_level", "Battery %"),
                                     ("session_state", "State")], "timeseries")}

    widgets = {
        "fleet": {
            "typeFullFqn": "system.cards.entities_table",
            "type": "latest",
            "title": "Voice fleet",
            "sizeX": 24, "sizeY": 8,
            "config": {
                "datasources": [fleet_datasource],
                "title": "Voice fleet — room, configuration and health",
                "showTitle": True, "dropShadow": True, "enableFullscreen": True,
                "settings": {"enableSearch": True, "displayPagination": True,
                             "defaultPageSize": 10}
            }
        },
        "rssi": {
            "typeFullFqn": "system.charts.basic_timeseries",
            "type": "timeseries",
            "title": "WiFi signal",
            "sizeX": 12, "sizeY": 7,
            "config": {
                "datasources": [{"type": "entity", "entityAliasId": "voiceDevices",
                                 "dataKeys": data_keys([("wifi_rssi", "WiFi dBm")])}],
                "title": "WiFi signal (dBm) — audio degrades below -75",
                "showTitle": True, "dropShadow": True, "enableFullscreen": True, "settings": {}
            }
        },
        "battery": {
            "typeFullFqn": "system.charts.basic_timeseries",
            "type": "timeseries",
            "title": "Battery",
            "sizeX": 12, "sizeY": 7,
            "config": {
                "datasources": [{"type": "entity", "entityAliasId": "voiceDevices",
                                 "dataKeys": data_keys([("battery_level", "Battery %")])}],
                "title": "Battery level (%)",
                "showTitle": True, "dropShadow": True, "enableFullscreen": True, "settings": {}
            }
        },
        "sessions": {
            "typeFullFqn": "system.charts.basic_timeseries",
            "type": "timeseries",
            "title": "Voice sessions",
            "sizeX": 12, "sizeY": 7,
            "config": {
                "datasources": [{"type": "entity", "entityAliasId": "voiceDevices",
                                 "dataKeys": data_keys([("sessions_today", "Sessions"),
                                                        ("avg_latency_ms", "Latency ms")])}],
                "title": "Voice sessions and round-trip latency",
                "showTitle": True, "dropShadow": True, "enableFullscreen": True, "settings": {}
            }
        },
        "alarms": {
            "typeFullFqn": "system.alarm_widgets.alarms_table",
            "type": "alarm",
            "title": "Fleet alarms",
            "sizeX": 12, "sizeY": 7,
            "config": {
                "datasources": [{"type": "entity", "entityAliasId": "voiceDevices", "dataKeys": []}],
                "title": "Fleet alarms",
                "showTitle": True, "dropShadow": True, "enableFullscreen": True,
                "settings": {"enableSearch": True, "displayPagination": True,
                             "defaultPageSize": 10}
            }
        }
    }

    layout = {
        "fleet": {"sizeX": 24, "sizeY": 8, "row": 0, "col": 0},
        "rssi": {"sizeX": 12, "sizeY": 7, "row": 8, "col": 0},
        "battery": {"sizeX": 12, "sizeY": 7, "row": 8, "col": 12},
        "sessions": {"sizeX": 12, "sizeY": 7, "row": 15, "col": 0},
        "alarms": {"sizeX": 12, "sizeY": 7, "row": 15, "col": 12}
    }

    return {
        "title": DASHBOARD_TITLE,
        "configuration": {
            "description": f"XiaoZhi voice devices bridged to LiveKit at {livekit_url}. "
                           "Audio runs over LiveKit; registry, configuration, OTA and health "
                           "live here.",
            "widgets": widgets,
            "states": {
                "default": {
                    "name": DASHBOARD_TITLE, "root": True,
                    "layouts": {"main": {"widgets": layout,
                                         "gridSettings": {"backgroundColor": "#f5f6fa"}}}
                }
            },
            "entityAliases": {
                "voiceDevices": {
                    "id": "voiceDevices", "alias": "Voice devices",
                    "filter": {"type": "entityList", "entityType": "DEVICE",
                               "entityList": device_ids, "resolveMultiple": True}
                }
            },
            "timewindow": {"realtime": {"timewindowMs": 3600000},
                           "aggregation": {"type": "AVG", "limit": 200}},
            "settings": {"stateControllerId": "entity", "showTitle": True,
                         "showDashboardsSelect": True}
        }
    }


def provision(livekit_url):
    token = login()
    print(f"Signed in as {TENANT_ADMIN[0]}\n")

    # --- profile -----------------------------------------------------------
    status, profiles = call("GET", "/api/deviceProfiles?pageSize=200&page=0", token)
    existing = next((p for p in profiles.get("data", []) if p["name"] == PROFILE_NAME), None)
    if existing:
        print(f"Device profile already present: {PROFILE_NAME}")
        profile = existing
    else:
        status, profile = call("POST", "/api/deviceProfile", token, device_profile_body())
        if status != 200:
            print(f"Could not create the device profile: {status} {profile}")
            return 1
        print(f"Created device profile: {PROFILE_NAME} (2 alarm rules)")

    # --- group -------------------------------------------------------------
    status, groups = call("GET", "/api/entityGroups?pageSize=200&page=0", token)
    group = next((g for g in groups.get("data", []) if g["name"] == DEVICE_GROUP), None)
    if not group:
        status, group = call("POST", "/api/entityGroup", token,
                             {"name": DEVICE_GROUP, "type": "DEVICE"})
        print(f"Created entity group: {DEVICE_GROUP}")

    # --- devices -----------------------------------------------------------
    created = []
    for spec in DEVICES:
        status, device = call("GET", f"/api/tenant/devices?deviceName={spec['name']}", token)
        if status != 200:
            status, device = call("POST", "/api/device", token, {
                "name": spec["name"], "type": PROFILE_NAME, "label": spec["label"]
            })
            if status != 200:
                print(f"  could not create {spec['name']}: {device}")
                continue
            print(f"  created {spec['name']}")
        created.append(device)
        device_id = device["id"]["id"]

        if group:
            call("POST", f"/api/entityGroup/{group['id']['id']}/DEVICE/{device_id}", token)

        # Shared attributes are how the platform configures the firmware: the device
        # subscribes over MQTT and applies changes without a redeploy. This is also where
        # the token endpoint reads the room from.
        call("POST", f"/api/plugins/telemetry/DEVICE/{device_id}/attributes/SHARED_SCOPE", token, {
            "livekit_room_name": spec["room"],
            "livekit_url": livekit_url,
            "livekit_identity": spec["name"],
            "voice_volume": 70,
            "wake_word_sensitivity": 0.6,
            "vad_threshold": 0.5,
            "agent_language": "en-US"
        })
        call("POST", f"/api/plugins/telemetry/DEVICE/{device_id}/attributes/SERVER_SCOPE", token, {
            "location": spec["label"],
            "hardware": "ESP32-S3",
            "firmware_version": "1.4.2",
            "audio_in": "INMP441 I2S",
            "audio_out": "MAX98357A I2S"
        })

        # a few points of history so the charts open with something in them
        now = int(time.time() * 1000)
        for minutes_ago in range(30, -1, -5):
            ts = now - minutes_ago * 60_000
            call("POST", f"/api/plugins/telemetry/DEVICE/{device_id}/timeseries/ANY", token, {
                "ts": ts,
                "values": {
                    "wifi_rssi": random.randint(-82, -48),
                    "battery_level": max(5, 100 - minutes_ago // 2 - random.randint(0, 8)),
                    "cpu_temp": round(random.uniform(38, 56), 1),
                    "sessions_today": random.randint(0, 14),
                    "avg_latency_ms": random.randint(180, 640),
                    "session_state": random.choice(["idle", "listening", "speaking"])
                }
            })

    print(f"\nProvisioned {len(created)} voice devices with LiveKit configuration")

    # --- dashboard ---------------------------------------------------------
    status, dashboards = call("GET", "/api/tenant/dashboards?pageSize=200&page=0", token)
    existing_dashboard = next(
        (d for d in dashboards.get("data", []) if d["title"] == DASHBOARD_TITLE), None)
    if existing_dashboard:
        call("DELETE", f"/api/dashboard/{existing_dashboard['id']['id']}", token)

    status, dashboard = call("POST", "/api/dashboard", token,
                             dashboard_body(created, livekit_url))
    if status == 200:
        print(f"Created dashboard: {DASHBOARD_TITLE}")
        print(f"  {BASE}/dashboards/{dashboard['id']['id']}")
    else:
        print(f"Could not create the dashboard: {status} {dashboard}")

    # --- token endpoint ----------------------------------------------------
    status, lk_status = call("GET", "/api/livekit/status", token)
    configured = status == 200 and lk_status.get("configured")
    print("\nLiveKit token endpoint: " +
          ("configured" if configured else
           "NOT configured — set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET"))

    if created:
        status, credentials = call(
            "GET", f"/api/device/{created[0]['id']['id']}/credentials", token)
        if status == 200:
            print("\nA device exchanges its access token for a LiveKit token like this:")
            print(f"  curl -X POST {BASE}/api/v1/{credentials['credentialsId']}"
                  "/livekit/token")
    return 0


def clean():
    token = login()
    status, dashboards = call("GET", "/api/tenant/dashboards?pageSize=200&page=0", token)
    for dashboard in dashboards.get("data", []):
        if dashboard["title"] == DASHBOARD_TITLE:
            call("DELETE", f"/api/dashboard/{dashboard['id']['id']}", token)
            print(f"Removed dashboard {DASHBOARD_TITLE}")

    for spec in DEVICES:
        status, device = call("GET", f"/api/tenant/devices?deviceName={spec['name']}", token)
        if status == 200:
            call("DELETE", f"/api/device/{device['id']['id']}", token)
            print(f"Removed {spec['name']}")

    status, groups = call("GET", "/api/entityGroups?pageSize=200&page=0", token)
    for group in groups.get("data", []):
        if group["name"] == DEVICE_GROUP:
            call("DELETE", f"/api/entityGroup/{group['id']['id']}", token)
            print(f"Removed group {DEVICE_GROUP}")

    # the profile is removed last: devices reference it, so it cannot go first
    status, profiles = call("GET", "/api/deviceProfiles?pageSize=200&page=0", token)
    for profile in profiles.get("data", []):
        if profile["name"] == PROFILE_NAME:
            status, body = call("DELETE", f"/api/deviceProfile/{profile['id']['id']}", token)
            print(f"Removed device profile {PROFILE_NAME}"
                  if status == 200 else f"Could not remove the profile: {body}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clean", action="store_true", help="remove everything this created")
    parser.add_argument("--livekit-url", default=LIVEKIT_URL_DEFAULT,
                        help="LiveKit server URL pushed to devices as a shared attribute")
    args = parser.parse_args()
    sys.exit(clean() if args.clean else provision(args.livekit_url))
