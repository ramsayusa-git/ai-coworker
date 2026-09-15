"""Offline licence verification.

Ed25519-signed, verified locally. There is no network call in any code path —
that is a product promise on the marketing site, not just an implementation
detail, so it must stay true.

Licence file shape:
    {"payload": {...}, "signature": "<base64 ed25519 over canonical payload>"}

The canonical form is json.dumps(payload, sort_keys=True, separators=(",", ":"))
so signing and verifying agree byte for byte.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os

from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

# Public half of the Aetos signing key. The private half never ships.
# Overridable for development so a dev build can use a throwaway key.
LICENCE_PUBKEY_B64 = os.environ.get(
    "LATTICE_LICENCE_PUBKEY",
    "3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29",
)

UNLICENSED_LIMITS = {
    "licensee": "Unlicensed",
    "tier": "unlicensed",
    "tenants_max": 1,
    "concurrent_sessions_max": 2,
    "features": [],
    "expires_at": None,
    "grace_days": 0,
}


def canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def verify_licence(blob: str) -> tuple[bool, dict, str]:
    """Return (ok, payload, error)."""
    try:
        doc = json.loads(blob)
    except json.JSONDecodeError as e:
        return False, {}, f"not valid JSON: {e}"

    payload = doc.get("payload")
    sig = doc.get("signature")
    if not isinstance(payload, dict) or not sig:
        return False, {}, "missing payload or signature"

    try:
        key = VerifyKey(bytes.fromhex(LICENCE_PUBKEY_B64))
    except Exception:
        try:
            key = VerifyKey(base64.b64decode(LICENCE_PUBKEY_B64))
        except Exception as e:
            return False, {}, f"bad public key configured: {e}"

    try:
        key.verify(canonical(payload), base64.b64decode(sig))
    except (BadSignatureError, ValueError) as e:
        return False, {}, f"signature does not verify: {e}"

    return True, payload, ""


def _parse(ts: str | None) -> dt.datetime | None:
    if not ts:
        return None
    try:
        return dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def licence_state(payload: dict) -> dict:
    """Classify a verified licence: valid | grace | expired."""
    now = dt.datetime.now(dt.timezone.utc)
    expires = _parse(payload.get("expires_at"))
    grace_days = int(payload.get("grace_days", 0) or 0)

    if expires is None:
        status, days_left = "valid", None
    elif now <= expires:
        status = "valid"
        days_left = (expires - now).days
    elif now <= expires + dt.timedelta(days=grace_days):
        status = "grace"
        days_left = (expires + dt.timedelta(days=grace_days) - now).days
    else:
        status, days_left = "expired", 0

    return {
        "status": status,
        "days_left": days_left,
        "licensee": payload.get("licensee", ""),
        "tier": payload.get("tier", ""),
        "tenants_max": payload.get("tenants_max"),
        "concurrent_sessions_max": payload.get("concurrent_sessions_max"),
        "features": payload.get("features", []),
        "expires_at": payload.get("expires_at"),
    }


def current(s) -> dict:
    """Load and classify the installed licence, or the unlicensed defaults."""
    from .db import Licence
    row = s.get(Licence, 1)
    if not row or not row.blob:
        state = licence_state(UNLICENSED_LIMITS)
        state["status"] = "unlicensed"
        return state
    ok, payload, err = verify_licence(row.blob)
    if not ok:
        state = licence_state(UNLICENSED_LIMITS)
        state["status"] = "invalid"
        state["error"] = err
        return state
    return licence_state(payload)


def has_feature(state: dict, name: str) -> bool:
    if state["status"] in ("expired", "invalid", "unlicensed"):
        return False
    return name in (state.get("features") or [])


def enforce_readonly(state: dict) -> None:
    """Block writes once a licence is past its grace period."""
    from fastapi import HTTPException
    if state["status"] in ("expired", "invalid"):
        raise HTTPException(
            402,
            "Licence expired — the system is read-only. Existing calls continue; "
            "install a current licence to resume changes.",
        )
