"""Redis access layer.

Single place the rest of the app talks to Redis through. Every key is
namespaced under the configured prefix (``app:`` by default), mirroring the
reference architecture's ``livekit:*`` convention:

    app:agents                     hash  (Phase 1)
    app:call_history               list/hash indexes (Phase 2)
    app:cache:<name>               TTL JSON cache entries

Also provides a small TTL JSON cache helper for expensive computations
(analytics rollups etc.).
"""
from __future__ import annotations

import json
import time
from typing import Any, Awaitable, Callable

import redis.asyncio as aioredis


class RedisStore:
    def __init__(self, url: str, prefix: str = "app") -> None:
        self._url = url
        self.prefix = prefix.rstrip(":")
        self._client: aioredis.Redis | None = None

    # -- lifecycle -----------------------------------------------------
    @property
    def client(self) -> aioredis.Redis:
        if self._client is None:
            self._client = aioredis.from_url(
                self._url, decode_responses=True, socket_connect_timeout=2
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def ping(self) -> bool:
        try:
            return bool(await self.client.ping())
        except Exception:
            return False

    # -- keys ----------------------------------------------------------
    def key(self, *parts: str) -> str:
        return ":".join([self.prefix, *parts])

    async def key_count(self) -> int:
        """Number of keys under our namespace (SCAN, non-blocking)."""
        try:
            count = 0
            async for _ in self.client.scan_iter(match=f"{self.prefix}:*", count=500):
                count += 1
            return count
        except Exception:
            return -1

    # -- JSON documents ------------------------------------------------
    async def set_json(self, name: str, value: Any, ttl: int | None = None) -> None:
        data = json.dumps(value, separators=(",", ":"))
        await self.client.set(self.key(name), data, ex=ttl)

    async def get_json(self, name: str, default: Any = None) -> Any:
        raw = await self.client.get(self.key(name))
        if raw is None:
            return default
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return default

    async def delete(self, name: str) -> None:
        await self.client.delete(self.key(name))

    # -- hashes (entity collections, e.g. agents by id) ----------------
    async def hset_json(self, name: str, field: str, value: Any) -> None:
        await self.client.hset(self.key(name), field, json.dumps(value))

    async def hget_json(self, name: str, field: str, default: Any = None) -> Any:
        raw = await self.client.hget(self.key(name), field)
        return json.loads(raw) if raw is not None else default

    async def hall_json(self, name: str) -> dict[str, Any]:
        raw = await self.client.hgetall(self.key(name))
        return {k: json.loads(v) for k, v in raw.items()}

    async def hdel(self, name: str, field: str) -> None:
        await self.client.hdel(self.key(name), field)

    # -- TTL cache helper ----------------------------------------------
    async def cached(
        self,
        name: str,
        ttl: int,
        producer: Callable[[], Awaitable[Any]],
        *,
        refresh: bool = False,
    ) -> Any:
        """Return cached JSON value under ``app:cache:<name>``.

        Calls ``producer`` and stores its result for ``ttl`` seconds when the
        cache is empty (or ``refresh`` is True). Falls back to calling the
        producer directly if Redis is unreachable.
        """
        cache_key = f"cache:{name}"
        if not refresh:
            try:
                hit = await self.get_json(cache_key)
                if hit is not None:
                    return hit["v"]
            except Exception:
                return await producer()
        value = await producer()
        try:
            await self.set_json(cache_key, {"v": value, "t": int(time.time())}, ttl=ttl)
        except Exception:
            pass
        return value
