"""Session authentication + CSRF.

- Passwords: PBKDF2-HMAC-SHA256 (no external crypto deps).
- Sessions: signed, timestamped cookie (itsdangerous URLSafeTimedSerializer).
- CSRF: per-session random token, required as a hidden form field on every
  POST; the login form itself uses a short-lived signed pre-session token.
- Login throttle: simple in-memory per-IP counter (5 failures / 5 minutes).
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time

from fastapi import HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import Settings

PBKDF2_ITERATIONS = 210_000
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SECONDS = 300


# -- passwords ---------------------------------------------------------
def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        _algo, iters, salt, digest = hashed.split("$")
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), int(iters)
        ).hex()
        return hmac.compare_digest(candidate, digest)
    except (ValueError, AttributeError):
        return False


# -- session manager ---------------------------------------------------
class SessionManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._serializer = URLSafeTimedSerializer(settings.secret_key, salt="av-session")
        self._login_serializer = URLSafeTimedSerializer(settings.secret_key, salt="av-login-csrf")
        # single-admin credential store (Phase 0); Redis-backed users come later
        self._admin_hash = hash_password(settings.admin_password)
        self._failures: dict[str, list[float]] = {}

    # sessions
    def create_session(self, username: str) -> str:
        return self._serializer.dumps({"u": username, "csrf": secrets.token_urlsafe(24)})

    def read_session(self, cookie: str | None) -> dict | None:
        if not cookie:
            return None
        try:
            return self._serializer.loads(cookie, max_age=self.settings.session_max_age)
        except (BadSignature, SignatureExpired):
            return None

    # credentials
    def check_credentials(self, username: str, password: str) -> bool:
        user_ok = hmac.compare_digest(username, self.settings.admin_username)
        pass_ok = verify_password(password, self._admin_hash)
        return user_ok and pass_ok

    # login throttle
    def throttled(self, ip: str) -> bool:
        now = time.monotonic()
        attempts = [t for t in self._failures.get(ip, []) if now - t < LOGIN_WINDOW_SECONDS]
        self._failures[ip] = attempts
        return len(attempts) >= LOGIN_MAX_FAILURES

    def record_failure(self, ip: str) -> None:
        self._failures.setdefault(ip, []).append(time.monotonic())

    def clear_failures(self, ip: str) -> None:
        self._failures.pop(ip, None)

    # login-form CSRF (pre-session)
    def login_csrf_token(self) -> str:
        return self._login_serializer.dumps({"n": secrets.token_urlsafe(8)})

    def check_login_csrf(self, token: str | None) -> bool:
        if not token:
            return False
        try:
            self._login_serializer.loads(token, max_age=3600)
            return True
        except (BadSignature, SignatureExpired):
            return False


# -- FastAPI dependencies ----------------------------------------------
def get_session_manager(request: Request) -> SessionManager:
    return request.app.state.sessions


def current_user(request: Request) -> dict:
    """Require a logged-in user; redirect page requests to /login."""
    manager: SessionManager = request.app.state.sessions
    session = manager.read_session(request.cookies.get(manager.settings.session_cookie))
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_303_SEE_OTHER, headers={"Location": "/login"}
        )
    return session


def require_csrf(request: Request, session: dict, form_token: str | None) -> None:
    """Validate the per-session CSRF token on state-changing requests."""
    if not form_token or not hmac.compare_digest(form_token, session.get("csrf", "")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token invalid")
