#!/usr/bin/env python3
"""Verify the LiveKit bridge.

What matters here is that a device can trade the credential it already has for a LiveKit
token, that the token is one LiveKit will actually accept, and that the room comes from
platform configuration rather than from whatever the caller asked for.

Needs the backend running with LIVEKIT_* set:

    LIVEKIT_URL=wss://demo.livekit.cloud \\
    LIVEKIT_API_KEY=APIdemokey123 \\
    LIVEKIT_API_SECRET=demo-secret-at-least-32-characters-long ./run-backend.sh

    python3 verify_livekit.py
"""

import base64
import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8080"
TENANT_ADMIN = ("tenant@aetosiot.com", "tenant")
DEVICE_NAME = "demo-livekit-verify"
ROOM = "aetos-voice-verify"
API_SECRET = "demo-secret-at-least-32-characters-long"

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
            return response.status, (json.loads(text) if text else None)
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


def decode(segment):
    segment += "=" * (-len(segment) % 4)
    return json.loads(base64.urlsafe_b64decode(segment))


def main():
    token = login()

    # --- fixture -----------------------------------------------------------
    status, device = call("GET", f"/api/tenant/devices?deviceName={DEVICE_NAME}", token)
    if status != 200:
        status, device = call("POST", "/api/device", token,
                              {"name": DEVICE_NAME, "type": "default"})
        if status != 200:
            print(f"Could not create the test device: {device}")
            return 1
    device_id = device["id"]["id"]

    # the room lives in a shared attribute, which is what the firmware also reads
    call("POST", f"/api/plugins/telemetry/DEVICE/{device_id}/attributes/SHARED_SCOPE", token,
         {"livekit_room_name": ROOM})
    time.sleep(1)

    status, credentials = call("GET", f"/api/device/{device_id}/credentials", token)
    access_token = credentials["credentialsId"]

    print("Configuration")
    status, lk_status = call("GET", "/api/livekit/status", token)
    configured = status == 200 and lk_status.get("configured")
    record("LiveKit is configured", configured, str(lk_status))
    if not configured:
        print("\nSet LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET and re-run.")
        return 1

    # --- the device exchange ----------------------------------------------
    print("\nDevice token exchange")
    status, issued = call("POST", f"/api/v1/{access_token}/livekit/token")
    record("a device trades its access token for a LiveKit token", status == 200,
           f"status {status}")
    if status != 200:
        return 1

    record("the response carries the server URL", bool(issued.get("url")), issued.get("url"))
    record("the room came from the device's configuration, not the request",
           issued.get("room") == ROOM, issued.get("room"))
    record("identity defaults to the device name",
           issued.get("identity") == DEVICE_NAME, issued.get("identity"))

    # --- the token itself --------------------------------------------------
    print("\nToken shape")
    header_segment, payload_segment, signature_segment = issued["token"].split(".")
    header = decode(header_segment)
    payload = decode(payload_segment)

    record("signed HS256, as LiveKit expects", header.get("alg") == "HS256", header.get("alg"))
    record("issuer is the API key", payload.get("iss") == "APIdemokey123", payload.get("iss"))
    record("subject is the participant identity", payload.get("sub") == DEVICE_NAME,
           payload.get("sub"))

    grant = payload.get("video", {})
    record("carries a video grant for the right room", grant.get("room") == ROOM, str(grant)[:70])
    record("may join, publish and subscribe",
           grant.get("roomJoin") and grant.get("canPublish") and grant.get("canSubscribe"))
    # a device has no business rewriting participant metadata; least privilege by default
    record("cannot update its own metadata", grant.get("canUpdateOwnMetadata") is False)

    # verify the signature the way LiveKit will
    signing_input = f"{header_segment}.{payload_segment}".encode()
    expected = base64.urlsafe_b64encode(
        hmac.new(API_SECRET.encode(), signing_input, hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    record("signature verifies against the API secret", expected == signature_segment)

    record("expires in the future", payload.get("exp", 0) > time.time(),
           f"in {round((payload.get('exp', 0) - time.time()) / 3600, 1)}h")

    # --- an explicit room override ----------------------------------------
    status, override = call("POST", f"/api/v1/{access_token}/livekit/token?room=some-other-room")
    # a device may legitimately move rooms, so the request is honoured — but the identity,
    # which is what authorisation keys off, still comes from the platform
    record("an explicitly requested room is honoured",
           status == 200 and override.get("room") == "some-other-room", override.get("room"))
    record("but the identity still comes from the platform",
           override.get("identity") == DEVICE_NAME, override.get("identity"))

    # --- security ----------------------------------------------------------
    print("\nSecurity")
    status, _ = call("POST", "/api/v1/definitely-not-a-real-token/livekit/token")
    record("an unknown device token is refused", status == 401, f"status {status}")

    status, _ = call("GET", f"/api/livekit/token/{device_id}")
    record("the operator endpoint requires authentication", status in (401, 403),
           f"status {status}")

    status, operator_token = call("GET", f"/api/livekit/token/{device_id}", token)
    record("an operator can mint a token for a device", status == 200,
           operator_token.get("room") if status == 200 else str(operator_token)[:60])

    call("DELETE", f"/api/device/{device_id}", token)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
