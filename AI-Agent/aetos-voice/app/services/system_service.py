"""Host + app health information for the dashboard and /healthz."""
from __future__ import annotations

import os
import shutil
import time

from app.config import APP_VERSION
from app.core.redis_store import RedisStore

_STARTED_AT = time.time()


def uptime_seconds() -> int:
    return int(time.time() - _STARTED_AT)


def _memory() -> dict:
    """Read MemTotal/MemAvailable from /proc (Linux); empty dict elsewhere."""
    try:
        info: dict[str, int] = {}
        with open("/proc/meminfo") as fh:
            for line in fh:
                key, _, rest = line.partition(":")
                if key in ("MemTotal", "MemAvailable"):
                    info[key] = int(rest.strip().split()[0]) * 1024
        total, avail = info.get("MemTotal", 0), info.get("MemAvailable", 0)
        return {
            "total_mb": total // 2**20,
            "used_mb": (total - avail) // 2**20,
            "percent": round((total - avail) / total * 100, 1) if total else 0,
        }
    except OSError:
        return {}


def _load_average() -> list[float]:
    try:
        return [round(x, 2) for x in os.getloadavg()]
    except OSError:
        return []


def _disk() -> dict:
    usage = shutil.disk_usage("/")
    return {
        "total_gb": round(usage.total / 2**30, 1),
        "used_gb": round(usage.used / 2**30, 1),
        "percent": round(usage.used / usage.total * 100, 1),
    }


async def health_snapshot(store: RedisStore) -> dict:
    redis_ok = await store.ping()
    return {
        "status": "ok" if redis_ok else "degraded",
        "version": APP_VERSION,
        "uptime_seconds": uptime_seconds(),
        "redis": {
            "connected": redis_ok,
            "namespaced_keys": (await store.key_count()) if redis_ok else 0,
            "prefix": store.prefix,
        },
        "host": {
            "load": _load_average(),
            "memory": _memory(),
            "disk": _disk(),
        },
    }
