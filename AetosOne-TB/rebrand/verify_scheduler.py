#!/usr/bin/env python3
"""Verify the scheduler end to end.

The interesting behaviour is not "does the row save" — it is whether the next fire time is
computed correctly, whether the executor actually runs a due event, and whether a repeating
event advances rather than firing forever. Those are what this checks.

Because the executor polls, the timing test waits for a real tick. That makes this script
slower than the others; the wait is bounded and reported.

Run with the backend up:  python3 verify_scheduler.py
"""

import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8080"
TENANT_ADMIN = ("tenant@aetosiot.com", "tenant")

# must exceed the executor's poll interval (scheduler.poll_interval_ms, default 30s)
EXECUTION_WAIT_SECONDS = 75

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


def cleanup(token, names):
    status, page = call("GET", "/api/schedulerEvents?pageSize=200&page=0", token)
    if status != 200:
        return
    for event in page.get("data", []):
        if event["name"] in names:
            call("DELETE", f"/api/schedulerEvent/{event['id']['id']}", token)


def main():
    token = login(*TENANT_ADMIN)

    names = {"verify-once", "verify-interval", "verify-past", "verify-executes"}
    cleanup(token, names)

    # a device to act on
    status, devices = call("GET", "/api/tenant/deviceInfos?pageSize=1&page=0", token)
    if status != 200 or not devices.get("data"):
        print("No device available to target; create one first.")
        return 1
    device = devices["data"][0]
    device_id = {"entityType": "DEVICE", "id": device["id"]["id"]}
    print(f"Targeting device: {device['name']}\n")

    now = int(time.time() * 1000)

    # --- one-shot -----------------------------------------------------------
    print("Schedule calculation")
    status, once = call("POST", "/api/schedulerEvent", token, {
        "name": "verify-once",
        "type": "updateAttributes",
        "originatorId": device_id,
        "enabled": True,
        "schedule": {"startTime": now + 3_600_000},
        "configuration": {"scope": "SERVER_SCOPE", "attributes": {"verify": 1}}
    })
    record("one-shot event saves", status == 200, f"status {status}")
    record("one-shot next run equals its start time",
           status == 200 and once.get("nextFireTime") == now + 3_600_000,
           str(once.get("nextFireTime") if status == 200 else once)[:80])

    # --- interval -----------------------------------------------------------
    status, interval = call("POST", "/api/schedulerEvent", token, {
        "name": "verify-interval",
        "type": "postTelemetry",
        "originatorId": device_id,
        "enabled": True,
        "schedule": {"startTime": now - 3_600_000,
                     "repeat": {"type": "INTERVAL", "intervalMs": 3_600_000}},
        "configuration": {"telemetry": {"verify": 1}}
    })
    # started an hour ago repeating hourly, so the next slot is roughly now, not an hour ago
    next_fire = interval.get("nextFireTime") if status == 200 else None
    record("interval event advances past a start time in the past",
           next_fire is not None and next_fire >= now,
           f"next in {round((next_fire - now) / 1000)}s" if next_fire else str(interval)[:80])

    # --- a schedule that can never run --------------------------------------
    status, expired = call("POST", "/api/schedulerEvent", token, {
        "name": "verify-past",
        "type": "updateAttributes",
        "originatorId": device_id,
        "enabled": True,
        "schedule": {"startTime": now - 86_400_000},
        "configuration": {"scope": "SERVER_SCOPE", "attributes": {"verify": 1}}
    })
    # a one-shot whose time has passed will never fire; saving it silently would be a trap
    record("a schedule with no future occurrence is rejected", status == 400,
           f"status {status}")

    # --- the executor actually runs it --------------------------------------
    print("\nExecution")
    fire_at = int(time.time() * 1000) + 5_000
    status, executes = call("POST", "/api/schedulerEvent", token, {
        "name": "verify-executes",
        "type": "postTelemetry",
        "originatorId": device_id,
        "enabled": True,
        "schedule": {"startTime": fire_at,
                     "repeat": {"type": "INTERVAL", "intervalMs": 3_600_000}},
        "configuration": {"telemetry": {"schedulerVerify": 42}}
    })
    if status != 200:
        record("event scheduled for execution", False, str(executes)[:120])
    else:
        event_id = executes["id"]["id"]
        print(f"  waiting up to {EXECUTION_WAIT_SECONDS}s for the executor to poll...")
        ran = None
        deadline = time.time() + EXECUTION_WAIT_SECONDS
        while time.time() < deadline:
            time.sleep(5)
            _, current = call("GET", f"/api/schedulerEvent/{event_id}", token)
            if current.get("lastFireTime"):
                ran = current
                break

        record("the executor ran the event", ran is not None,
               "no run within the wait window" if ran is None else ran.get("lastResult", ""))
        if ran:
            record("the run succeeded", str(ran.get("lastResult", "")).startswith("OK"),
                   ran.get("lastResult"))
            # a repeating event must move on, or it re-fires every single tick
            record("a repeating event advances to its next slot",
                   ran.get("nextFireTime") and ran["nextFireTime"] > ran["lastFireTime"],
                   f"+{round((ran['nextFireTime'] - ran['lastFireTime']) / 1000)}s"
                   if ran.get("nextFireTime") else "no next run")

            # and the telemetry it posted should be readable back
            _, values = call(
                "GET",
                f"/api/plugins/telemetry/DEVICE/{device['id']['id']}/values/timeseries?keys=schedulerVerify",
                token)
            posted = values.get("schedulerVerify") if isinstance(values, dict) else None
            record("the telemetry it posted is readable", bool(posted), str(posted)[:80])

    cleanup(token, names)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
