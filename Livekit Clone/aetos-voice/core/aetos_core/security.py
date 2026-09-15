"""Password hashing, JWT issuing/verifying, refresh-token handling.

Kept free of FastAPI imports so it can be unit-tested and reused by the CLI.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import secrets

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from .settings import ACCESS_TTL_MIN, JWT_ALG, JWT_SECRET, REFRESH_TTL_DAYS

_ph = PasswordHasher()


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


# ------------------------------------------------------------- passwords ---

def hash_password(raw: str) -> str:
    return _ph.hash(raw)


def verify_password(hashed: str, raw: str) -> bool:
    try:
        _ph.verify(hashed, raw)
        return True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    try:
        return _ph.check_needs_rehash(hashed)
    except Exception:
        return False


def password_problem(raw: str) -> str | None:
    """Return a human-readable reason the password is unacceptable, or None."""
    if len(raw) < 12:
        return "Password must be at least 12 characters."
    if raw.lower() in {"password1234", "administrator", "changemenow12"}:
        return "That password is too common."
    return None


def generate_password(n: int = 20) -> str:
    return secrets.token_urlsafe(n)


# ------------------------------------------------------------------ JWT ---

def issue_access(user_id: str, tenant_id: str, role: str) -> tuple[str, int]:
    """Return (token, expires_in_seconds)."""
    iat = now()
    exp = iat + dt.timedelta(minutes=ACCESS_TTL_MIN)
    payload = {
        "sub": user_id,
        "tid": tenant_id,
        "role": role,
        "jti": secrets.token_urlsafe(8),
        "iat": int(iat.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG), ACCESS_TTL_MIN * 60


def decode_access(token: str) -> dict | None:
    """Return the claims, or None if the token is invalid/expired/tampered."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


# -------------------------------------------------------- refresh tokens ---

def new_refresh() -> tuple[str, str]:
    """Return (raw_token, sha256_hash). The raw value is never stored."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_refresh(raw)


def hash_refresh(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def refresh_expiry() -> dt.datetime:
    return now() + dt.timedelta(days=REFRESH_TTL_DAYS)


# ------------------------------------------------------------- API keys ---

API_KEY_PREFIX = "ltn_"


def new_api_key() -> tuple[str, str, str]:
    """Return (full_secret, prefix, hash). Secret is shown to the user once."""
    body = secrets.token_urlsafe(32)
    full = f"{API_KEY_PREFIX}{body}"
    return full, full[:12], _ph.hash(full)


def verify_api_key(hashed: str, raw: str) -> bool:
    return verify_password(hashed, raw)
