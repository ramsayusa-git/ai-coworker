"""Agent CRUD + prompt version history on top of the Redis store.

Keys:
    app:agents                          hash  id -> AgentConfig JSON
    app:agent_prompt_history:<id>       list  JSON {v, ts, prompt, source}

Every write also snapshots the full agent set to ``data/agents.json`` so the
system can be restored if Redis is lost (Redis stays the source of truth).
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from app.core.redis_store import RedisStore
from app.models.agent import AgentConfig, new_agent_id

AGENTS_KEY = "agents"
HISTORY_KEY = "agent_prompt_history"
HISTORY_MAX = 100


class AgentNotFound(Exception):
    pass


def _history_key(agent_id: str) -> str:
    return f"{HISTORY_KEY}:{agent_id}"


async def list_agents(store: RedisStore) -> list[AgentConfig]:
    raw = await store.hall_json(AGENTS_KEY)
    agents = [AgentConfig.model_validate(v) for v in raw.values()]
    return sorted(agents, key=lambda a: a.created_at)


async def get_agent(store: RedisStore, agent_id: str) -> AgentConfig:
    raw = await store.hget_json(AGENTS_KEY, agent_id)
    if raw is None:
        raise AgentNotFound(agent_id)
    return AgentConfig.model_validate(raw)


async def create_agent(store: RedisStore, data: dict[str, Any], snapshot_dir: Path | None = None) -> AgentConfig:
    data = dict(data)
    data.setdefault("id", new_agent_id(data.get("name", "agent")))
    agent = AgentConfig.model_validate(data)
    await store.hset_json(AGENTS_KEY, agent.id, agent.model_dump())
    await _append_history(store, agent, source="create")
    await snapshot_agents(store, snapshot_dir)
    return agent


async def update_agent(store: RedisStore, agent_id: str, data: dict[str, Any], snapshot_dir: Path | None = None) -> AgentConfig:
    current = await get_agent(store, agent_id)
    merged = current.model_dump()
    prompt_changed = "system_prompt" in data and data["system_prompt"] != current.system_prompt
    for key, value in data.items():
        if key in ("id", "created_at", "prompt_version"):
            continue
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value
    merged["updated_at"] = time.time()
    if prompt_changed:
        merged["prompt_version"] = current.prompt_version + 1
    agent = AgentConfig.model_validate(merged)
    await store.hset_json(AGENTS_KEY, agent.id, agent.model_dump())
    if prompt_changed:
        await _append_history(store, agent, source="edit")
    await snapshot_agents(store, snapshot_dir)
    return agent


async def delete_agent(store: RedisStore, agent_id: str, snapshot_dir: Path | None = None) -> None:
    await get_agent(store, agent_id)  # raise if missing
    await store.hdel(AGENTS_KEY, agent_id)
    await store.delete(_history_key(agent_id))
    await snapshot_agents(store, snapshot_dir)


# -- prompt version history -------------------------------------------
async def _append_history(store: RedisStore, agent: AgentConfig, source: str) -> None:
    entry = json.dumps(
        {"v": agent.prompt_version, "ts": time.time(), "prompt": agent.system_prompt, "source": source},
        separators=(",", ":"),
    )
    key = store.key(_history_key(agent.id))
    await store.client.rpush(key, entry)
    await store.client.ltrim(key, -HISTORY_MAX, -1)


async def prompt_history(store: RedisStore, agent_id: str) -> list[dict]:
    key = store.key(_history_key(agent_id))
    raw = await store.client.lrange(key, 0, -1)
    return [json.loads(item) for item in raw]


async def restore_prompt(store: RedisStore, agent_id: str, version: int, snapshot_dir: Path | None = None) -> AgentConfig:
    entries = await prompt_history(store, agent_id)
    match = next((e for e in entries if e["v"] == version), None)
    if match is None:
        raise AgentNotFound(f"{agent_id} prompt v{version}")
    return await update_agent(store, agent_id, {"system_prompt": match["prompt"]}, snapshot_dir)


# -- disk snapshot -----------------------------------------------------
async def snapshot_agents(store: RedisStore, snapshot_dir: Path | None = None) -> Path | None:
    if snapshot_dir is None:
        return None
    try:
        agents = await list_agents(store)
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        path = snapshot_dir / "agents.json"
        payload = {"saved_at": time.time(), "agents": [a.model_dump() for a in agents]}
        path.write_text(json.dumps(payload, indent=2))
        return path
    except Exception:
        # Snapshot is best-effort; Redis remains authoritative.
        return None
