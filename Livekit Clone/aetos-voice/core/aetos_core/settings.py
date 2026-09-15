import os, pathlib
STATE_DIR = pathlib.Path(os.environ.get("AETOS_STATE", os.path.expanduser("~/.aetos")))
STATE_DIR.mkdir(parents=True, exist_ok=True)
DB_URL      = os.environ.get("AETOS_DB", f"sqlite:///{STATE_DIR/'core.db'}")
REDIS_URL   = os.environ.get("AETOS_REDIS", "redis://127.0.0.1:6379/0")
AETOSD_URL  = os.environ.get("AETOSD_URL", "http://127.0.0.1:8110")
FRONTEND    = os.environ.get("AETOS_FRONTEND", "")            # path to built SPA; empty = API only (Caddy serves it)
TZ          = os.environ.get("AETOS_TZ", "Australia/Sydney")
