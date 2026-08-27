#!/usr/bin/env python3
"""Verify inbound webhooks end to end.

The behaviour that matters: a third-party payload in an arbitrary shape arrives at an
unauthenticated URL, is mapped onto the right device, and shows up as telemetry — while an
unknown token reveals nothing.

Run with the backend up:  python3 verify_webhooks.py
"""

import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8080"
TENANT_ADMIN = ("tenant@aetosiot.com", "tenant")
WEBHOOK_NAME = "verify-webhook"
DEVICE_NAME = "demo-webhook-target"

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
    token = login(*TENANT_ADMIN)
    call("DELETE", f"/api/webhook/{WEBHOOK_NAME}", token)

    print("Definition")
    status, webhook = call("POST", "/api/webhook", token, {
        "name": WEBHOOK_NAME,
        "deviceNamePointer": "/meta/device",
        "target": "telemetry",
        "fieldMapping": {
            "temperature": "/readings/temp_c",
            "battery": "/readings/battery_pct",
            "status": "/state"
        },
        "createDeviceIfMissing": True,
        "enabled": True
    })
    record("webhook saves", status == 200, f"status {status}")
    record("the server issues a token, not the caller",
           status == 200 and len(webhook.get("token", "")) >= 24,
           f"{len(webhook.get('token', '')) if status == 200 else 0} chars")

    if status != 200:
        return 1
    hook_token = webhook["token"]

    # editing must not invalidate the URL the third party already has
    status, again = call("POST", "/api/webhook", token, {
        **webhook, "target": "telemetry", "enabled": True
    })
    record("editing keeps the same token", status == 200 and again["token"] == hook_token)

    print("\nDelivery")
    # a payload in the sender's shape, not ours — the point of the mapping
    status, receipt = call("POST", f"/api/noauth/webhook/{hook_token}", None, {
        "meta": {"device": DEVICE_NAME, "firmware": "1.4.2"},
        "readings": {"temp_c": 22.5, "battery_pct": 87},
        "state": "nominal",
        "ignored": "this key is not mapped"
    })
    record("an unauthenticated delivery is accepted", status == 200, f"status {status}")
    record("it resolved the device from the payload",
           status == 200 and receipt.get("device") == DEVICE_NAME, str(receipt)[:80])

    time.sleep(2)
    status, devices = call(
        "GET", f"/api/tenant/devices?deviceName={DEVICE_NAME}", token)
    device_id = devices.get("id", {}).get("id") if status == 200 else None
    record("the device was created on first delivery", bool(device_id), str(device_id))

    if device_id:
        status, values = call(
            "GET",
            f"/api/plugins/telemetry/DEVICE/{device_id}/values/timeseries"
            "?keys=temperature,battery,status,ignored", token)
        record("mapped fields arrived as telemetry",
               "temperature" in values and "battery" in values, ", ".join(values.keys()))
        record("a numeric field kept its value",
               values.get("temperature", [{}])[0].get("value") == "22.5",
               str(values.get("temperature"))[:60])
        # A mapping is an allow-list; unmapped keys must not leak through.
        #
        # Asserting on presence would be wrong: the platform answers a query for an unknown
        # key with a placeholder entry whose value is null. Absence of a *value* is the real
        # test, and confirmed separately against /keys/timeseries, which lists only what was
        # actually written.
        stored = call("GET", f"/api/plugins/telemetry/DEVICE/{device_id}/keys/timeseries", token)[1]
        record("unmapped keys are not stored", "ignored" not in (stored or []),
               f"stored keys: {stored}")

    print("\nSecurity")
    status, _ = call("POST", "/api/noauth/webhook/definitely-not-a-real-token", None, {"a": 1})
    record("an unknown token gets a flat 404", status == 404, f"status {status}")

    status, _ = call("GET", "/api/webhooks", None)
    record("managing webhooks requires authentication", status in (401, 403), f"status {status}")

    # --- cleanup -----------------------------------------------------------
    call("DELETE", f"/api/webhook/{WEBHOOK_NAME}", token)
    status, _ = call("POST", f"/api/noauth/webhook/{hook_token}", None, {"meta": {"device": DEVICE_NAME}})
    record("a deleted webhook stops accepting deliveries", status == 404, f"status {status}")
    if device_id:
        call("DELETE", f"/api/device/{device_id}", token)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
