"""events v1 publisher. Redis Streams; if Redis is down the console keeps working — events are best-effort here,
the agent worker has its own durable path."""
import json, time, logging
from .settings import REDIS_URL
log = logging.getLogger("aetos.events")
STREAM = "aetos:events:v1"
_r = None
def _redis():
    global _r
    if _r is None:
        import redis; _r = redis.Redis.from_url(REDIS_URL, socket_connect_timeout=0.3, socket_timeout=0.3)
    return _r
def publish(type_: str, **data) -> bool:
    try:
        _redis().xadd(STREAM, {"type": type_, "ts": int(time.time()*1000), "v": 1, "data": json.dumps(data)}, maxlen=100_000, approximate=True)
        return True
    except Exception as e:
        log.debug("event dropped (%s): %s", type_, e); return False
def tail(n=50):
    try: return [{"id": i.decode(), **{k.decode(): v.decode() for k, v in f.items()}} for i, f in _redis().xrevrange(STREAM, count=n)]
    except Exception: return []
