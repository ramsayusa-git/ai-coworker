"""Call history + transcripts (Phase 2, local-first).

Keys:
    app:call:<call_id>                     JSON call record
    app:call_transcript:<call_id>          list of JSON turn entries
    app:calls:by_date:<YYYY-MM-DD>         zset  call_id -> started_at
    app:calls:by_agent:<agent_id>          zset  call_id -> started_at
    app:calls:by_direction:<direction>     zset  call_id -> started_at
    app:calls:all                          zset  call_id -> started_at

The call_id is the LiveKit room name. Records are written by the webhook
receiver (room lifecycle) and by the agent worker (agent identity +
transcript turns), whichever arrives first creates the record.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from app.core.redis_store import RedisStore

TRANSCRIPT_MAX = 2000
DIRECTIONS = ("web", "sip")


def _day(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


async def _index(store: RedisStore, call: dict) -> None:
    cid, ts = call["id"], call["started_at"]
    pipe = store.client.pipeline()
    pipe.zadd(store.key("calls:all"), {cid: ts})
    pipe.zadd(store.key(f"calls:by_date:{_day(ts)}"), {cid: ts})
    pipe.zadd(store.key(f"calls:by_direction:{call.get('direction', 'web')}"), {cid: ts})
    if call.get("agent_id"):
        pipe.zadd(store.key(f"calls:by_agent:{call['agent_id']}"), {cid: ts})
    await pipe.execute()


async def get_call(store: RedisStore, call_id: str) -> dict | None:
    return await store.get_json(f"call:{call_id}")


async def upsert_call(store: RedisStore, call_id: str, **fields) -> dict:
    """Create or merge a call record and (re)index it."""
    call = await get_call(store, call_id) or {
        "id": call_id,
        "started_at": time.time(),
        "direction": "sip" if call_id.startswith("sip-") else "web",
        "status": "active",
        "agent_id": None,
        "agent_name": None,
        "participants": [],
        "ended_at": None,
        "duration_seconds": None,
    }
    for key, value in fields.items():
        if value is not None or key in ("ended_at",):
            call[key] = value
    if call.get("ended_at") and not call.get("duration_seconds"):
        call["duration_seconds"] = max(0, int(call["ended_at"] - call["started_at"]))
        call["status"] = "ended"
    await store.set_json(f"call:{call_id}", call)
    await _index(store, call)
    return call


async def add_participant(store: RedisStore, call_id: str, identity: str) -> None:
    call = await get_call(store, call_id)
    if call is None:
        call = await upsert_call(store, call_id)
    if identity not in call["participants"]:
        call["participants"].append(identity)
        await store.set_json(f"call:{call_id}", call)


async def end_call(store: RedisStore, call_id: str) -> None:
    if await get_call(store, call_id) is not None:
        await upsert_call(store, call_id, ended_at=time.time())


# -- transcripts -------------------------------------------------------
async def append_transcript(store: RedisStore, call_id: str, role: str, text: str) -> None:
    entry = json.dumps({"ts": time.time(), "role": role, "text": text}, separators=(",", ":"))
    key = store.key(f"call_transcript:{call_id}")
    await store.client.rpush(key, entry)
    await store.client.ltrim(key, -TRANSCRIPT_MAX, -1)


async def get_transcript(store: RedisStore, call_id: str) -> list[dict]:
    raw = await store.client.lrange(store.key(f"call_transcript:{call_id}"), 0, -1)
    return [json.loads(item) for item in raw]


# -- queries -----------------------------------------------------------
async def list_calls(
    store: RedisStore,
    *,
    agent_id: str | None = None,
    date: str | None = None,
    direction: str | None = None,
    limit: int = 50,
) -> list[dict]:
    if agent_id:
        index = f"calls:by_agent:{agent_id}"
    elif date:
        index = f"calls:by_date:{date}"
    elif direction:
        index = f"calls:by_direction:{direction}"
    else:
        index = "calls:all"
    ids = await store.client.zrevrange(store.key(index), 0, limit - 1)
    calls = []
    for cid in ids:
        call = await get_call(store, cid)
        if call is not None:
            calls.append(call)
    return calls


async def call_stats_today(store: RedisStore) -> dict:
    today = _day(time.time())
    ids = await store.client.zrevrange(store.key(f"calls:by_date:{today}"), 0, -1)
    total = len(ids)
    active = 0
    duration_sum = 0
    for cid in ids:
        call = await get_call(store, cid)
        if not call:
            continue
        if call.get("status") == "active":
            active += 1
        duration_sum += call.get("duration_seconds") or 0
    return {"date": today, "total": total, "active": active, "total_minutes": duration_sum // 60}
