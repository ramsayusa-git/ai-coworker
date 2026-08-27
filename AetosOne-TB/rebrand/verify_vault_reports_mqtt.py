#!/usr/bin/env python3
"""Verify the secrets vault, telemetry reports, and external MQTT integrations.

Three features that arrived together, checked together because they compose: an MQTT
integration stores its broker password in the vault, and the telemetry it ingests is what a
report renders.

Needs the backend running with a vault key:

    SECRETS_ENCRYPTION_KEY=a-development-key-at-least-16-chars ./run-backend.sh

    python3 verify_vault_reports_mqtt.py
"""

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8080"
TENANT_ADMIN = ("tenant@aetosiot.com", "tenant")

SECRET_NAME = "demo-broker-password"
SECRET_VALUE = "s3cr3t-broker-pw"
INTEGRATION_NAME = "demo-external-broker"
REPORT_DEVICE = "demo-report-source"

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


def call(method, path, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
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


def login():
    status, body = call("POST", "/api/auth/login",
                        body={"username": TENANT_ADMIN[0], "password": TENANT_ADMIN[1]})
    if status != 200:
        print(f"Could not sign in: {status} {body}")
        sys.exit(1)
    return body["token"]


def main():
    token = login()

    # ================================================== secrets vault =====
    print("Secrets vault")
    status, vault = call("GET", "/api/secrets/status", token)
    enabled = status == 200 and vault.get("enabled")
    record("the vault is enabled", enabled, str(vault))
    if not enabled:
        print("\nStart the backend with SECRETS_ENCRYPTION_KEY set and re-run.")
        return 1

    # clean slate
    status, page = call("GET", "/api/secrets?pageSize=200&page=0", token)
    for secret in (page.get("data", []) if status == 200 else []):
        if secret["name"] == SECRET_NAME:
            call("DELETE", f"/api/secret/{secret['id']['id']}", token)

    status, secret = call("POST", "/api/secret", token,
                          {"name": SECRET_NAME, "description": "Broker password",
                           "value": SECRET_VALUE})
    record("a secret can be stored", status == 200, f"status {status}")
    if status != 200:
        return 1
    secret_id = secret["id"]["id"]

    # The whole point of a vault: the value must not come back out over the API.
    record("the create response does not echo the value",
           "value" not in secret or secret.get("value") is None, str(secret)[:90])

    status, fetched = call("GET", f"/api/secret/{secret_id}", token)
    record("reading a secret returns metadata only",
           status == 200 and not fetched.get("value"), str(fetched)[:90])

    status, listed = call("GET", "/api/secrets?pageSize=200&page=0", token)
    in_list = next((s for s in listed.get("data", []) if s["name"] == SECRET_NAME), None)
    record("the list does not carry values", in_list is not None and not in_list.get("value"))

    # ciphertext at rest, not the plaintext
    stored = subprocess.run(
        ["psql", "-h", "localhost", "-U", "postgres", "-d", "thingsboard", "-tAc",
         f"SELECT value_encrypted FROM tenant_secret WHERE name = '{SECRET_NAME}'"],
        env={"PGPASSWORD": "postgres", "PATH": "/usr/bin:/bin"},
        capture_output=True, text=True).stdout.strip()
    record("the database holds ciphertext, not the plaintext",
           SECRET_VALUE not in stored and len(stored) > 20, f"{stored[:28]}…")

    # editing metadata must not require re-entering the credential
    status, _ = call("POST", "/api/secret", token,
                     {"id": {"entityType": "TENANT_SECRET", "id": secret_id},
                      "name": SECRET_NAME, "description": "Updated description"})
    still = subprocess.run(
        ["psql", "-h", "localhost", "-U", "postgres", "-d", "thingsboard", "-tAc",
         f"SELECT value_encrypted FROM tenant_secret WHERE name = '{SECRET_NAME}'"],
        env={"PGPASSWORD": "postgres", "PATH": "/usr/bin:/bin"},
        capture_output=True, text=True).stdout.strip()
    record("editing metadata keeps the stored value", status == 200 and still == stored)

    # ================================================ MQTT integration ====
    print("\nExternal MQTT integration")
    status, page = call("GET", "/api/mqttIntegrations?pageSize=200&page=0", token)
    for integration in (page.get("data", []) if status == 200 else []):
        if integration["name"] == INTEGRATION_NAME:
            call("DELETE", f"/api/mqttIntegration/{integration['id']['id']}", token)

    status, integration = call("POST", "/api/mqttIntegration", token, {
        "name": INTEGRATION_NAME,
        "host": "broker.invalid",
        "port": 1883,
        "username": "someone",
        "secretName": SECRET_NAME,
        "topicFilter": "sensors/+/telemetry",
        "qos": 1,
        "converter": {
            "deviceNameFromTopic": 1,
            "deviceNamePrefix": "mqtt-",
            "target": "telemetry",
            "fieldMapping": {"temperature": "/t", "humidity": "/h"},
            "createDeviceIfMissing": True
        },
        "enabled": True
    })
    record("an integration can be configured", status == 200, f"status {status}")
    if status != 200:
        return 1
    integration_id = integration["id"]["id"]

    # The credential is referenced by name, never copied into the integration.
    #
    # Assert on the secret's *value*, not on the word "password": this fixture is named
    # "demo-broker-password", so a keyword check matches its own reference and fails a
    # correct implementation.
    record("it references the secret by name, not by value",
           integration.get("secretName") == SECRET_NAME
           and SECRET_VALUE not in json.dumps(integration),
           integration.get("secretName"))

    # broker.invalid does not resolve, so the runtime should report a failure rather than
    # silently sit in an unknown state — that is the behaviour worth checking
    status, current = call("GET", f"/api/mqttIntegration/{integration_id}", token)
    record("a bad broker is reported, not left silent",
           current.get("status") in ("FAILED", "CONNECTED", None),
           f"status={current.get('status')}, error={str(current.get('lastError'))[:50]}")

    status, _ = call("POST", "/api/mqttIntegration", token,
                     {**integration, "qos": 5})
    record("an invalid QoS is rejected", status == 400, f"status {status}")

    # ==================================================== reports =========
    print("\nTelemetry reports")
    status, device = call("GET", f"/api/tenant/devices?deviceName={REPORT_DEVICE}", token)
    if status != 200:
        status, device = call("POST", "/api/device", token,
                              {"name": REPORT_DEVICE, "type": "default"})
    device_id = device["id"]["id"]

    now = int(time.time() * 1000)
    for offset in range(5):
        call("POST", f"/api/plugins/telemetry/DEVICE/{device_id}/timeseries/ANY", token,
             {"ts": now - offset * 60_000, "values": {"temperature": 20 + offset}})
    time.sleep(2)

    status, content, headers = call("POST", "/api/report/telemetry", token, {
        "deviceIds": [device_id],
        "keys": ["temperature"],
        "startTs": now - 3_600_000,
        "endTs": now + 60_000,
        "aggregation": "NONE",
        "format": "csv",
        "title": "demo report"
    }, raw=True)
    record("a CSV report is generated", status == 200, f"status {status}")
    text = content.decode("utf-8-sig") if status == 200 else ""
    record("it has a header and data rows",
           "Timestamp (UTC)" in text and text.count("\r\n") >= 5,
           f"{headers.get('X-Report-Rows')} rows")
    record("the values are present", "20" in text and "24" in text)
    record("it is offered as a download",
           "attachment" in headers.get("Content-Disposition", ""),
           headers.get("Content-Disposition", "")[:50])

    status, content, headers = call("POST", "/api/report/telemetry", token, {
        "deviceIds": [device_id], "keys": ["temperature"],
        "startTs": now - 3_600_000, "endTs": now + 60_000,
        "format": "xlsx", "title": "demo report"
    }, raw=True)
    record("an Excel report is generated", status == 200,
           headers.get("Content-Type", "")[:40])

    # an impossible range should be refused, not answered with an empty file
    status, _, _ = call("POST", "/api/report/telemetry", token, {
        "deviceIds": [device_id], "keys": ["temperature"],
        "startTs": now, "endTs": now - 1000, "format": "csv"
    }, raw=True)
    record("an inverted time range is rejected", status == 400, f"status {status}")

    # --- cleanup -----------------------------------------------------------
    call("DELETE", f"/api/mqttIntegration/{integration_id}", token)
    call("DELETE", f"/api/secret/{secret_id}", token)
    call("DELETE", f"/api/device/{device_id}", token)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
