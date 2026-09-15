import os, pathlib, secrets, sys

STATE_DIR = pathlib.Path(os.environ.get("AETOS_STATE", os.path.expanduser("~/.aetos")))
STATE_DIR.mkdir(parents=True, exist_ok=True)
DB_URL      = os.environ.get("AETOS_DB", f"sqlite:///{STATE_DIR/'core.db'}")
REDIS_URL   = os.environ.get("AETOS_REDIS", "redis://127.0.0.1:6379/0")
AETOSD_URL  = os.environ.get("AETOSD_URL", "http://127.0.0.1:8110")
FRONTEND    = os.environ.get("AETOS_FRONTEND", "")            # path to built SPA; empty = API only (Caddy serves it)
TZ          = os.environ.get("AETOS_TZ", "Australia/Sydney")

# ------------------------------------------------------------------ auth ---

ACCESS_TTL_MIN   = int(os.environ.get("LATTICE_ACCESS_TTL_MIN", "15"))
REFRESH_TTL_DAYS = int(os.environ.get("LATTICE_REFRESH_TTL_DAYS", "30"))
JWT_ALG          = "HS256"

_SECRET_FILE = STATE_DIR / "jwt.secret"


def _load_jwt_secret() -> str:
    """Resolve the signing secret.

    Order: LATTICE_JWT_SECRET env var, then a generated file in the state dir.
    Never falls back to a hardcoded default — a predictable signing key means
    anyone can mint a token for any tenant. A secret shorter than 32 chars is
    refused outright rather than accepted with a warning nobody reads.
    """
    env = os.environ.get("LATTICE_JWT_SECRET", "").strip()
    if env:
        if len(env) < 32:
            sys.exit("LATTICE_JWT_SECRET must be at least 32 characters. Refusing to start.")
        return env

    if _SECRET_FILE.exists():
        val = _SECRET_FILE.read_text().strip()
        if len(val) >= 32:
            return val

    val = secrets.token_urlsafe(48)
    _SECRET_FILE.write_text(val)
    try:
        _SECRET_FILE.chmod(0o600)
    except OSError:
        pass
    return val


JWT_SECRET = _load_jwt_secret()
