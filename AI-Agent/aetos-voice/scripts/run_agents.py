"""Agent worker — joins LiveKit rooms and runs the configured voice agent.

Reads agent configs from Redis (``app:agents``). Dispatch: automatic — the
worker joins every new room; the agent config is picked from the room name
(``test-<agent_id>-<suffix>``), falling back to the first active agent.

Phase 1 implements the OpenAI stack (LLM + STT + TTS) plus Silero VAD.
Requires ``OPENAI_API_KEY`` in the environment (.env is loaded).

Run:  .venv/bin/python scripts/run_agents.py dev     (console logs)
      .venv/bin/python scripts/run_agents.py start   (production mode)
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

from livekit import agents  # noqa: E402
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions  # noqa: E402
from livekit.plugins import openai, silero  # noqa: E402

import redis as redis_sync  # noqa: E402

logger = logging.getLogger("aetos-worker")

REDIS_URL = os.environ.get("APP_REDIS_URL", "redis://127.0.0.1:6379/0")
REDIS_PREFIX = os.environ.get("APP_REDIS_PREFIX", "app")
ROOM_RE = re.compile(r"^test-(?P<agent_id>[a-z0-9-]+)-[0-9a-f]{6}$")


def load_agent_config(room_name: str) -> dict | None:
    """Pick the agent config for a room from Redis (sync — runs pre-session)."""
    client = redis_sync.Redis.from_url(REDIS_URL, decode_responses=True)
    try:
        agents_raw = client.hgetall(f"{REDIS_PREFIX}:agents")
        if not agents_raw:
            return None
        configs = {aid: json.loads(raw) for aid, raw in agents_raw.items()}
        match = ROOM_RE.match(room_name)
        if match and match.group("agent_id") in configs:
            return configs[match.group("agent_id")]
        active = [c for c in configs.values() if c.get("active")]
        return active[0] if active else None
    finally:
        client.close()


def build_session(config: dict) -> AgentSession:
    llm_conf = config.get("llm", {})
    stt_conf = config.get("stt", {})
    tts_conf = config.get("tts", {})
    turn_conf = config.get("turn", {})

    # Phase 1: the OpenAI stack end-to-end. Other saved providers fall back
    # to OpenAI with a warning so a mis-set dropdown never bricks the call.
    for section, conf in (("llm", llm_conf), ("stt", stt_conf), ("tts", tts_conf)):
        if conf.get("provider") not in (None, "openai"):
            logger.warning("%s provider %r not wired in Phase 1 — using openai", section, conf.get("provider"))

    vad = silero.VAD.load(
        min_silence_duration=float(turn_conf.get("vad_min_silence", 0.55)),
        activation_threshold=float(turn_conf.get("vad_activation_threshold", 0.5)),
    )
    return AgentSession(
        vad=vad,
        stt=openai.STT(model=stt_conf.get("model") or "gpt-4o-mini-transcribe",
                       language=stt_conf.get("language") or "en"),
        llm=openai.LLM(model=llm_conf.get("model") or "gpt-4o-mini",
                       temperature=float(llm_conf.get("temperature", 0.7))),
        tts=openai.TTS(model=tts_conf.get("model") or "gpt-4o-mini-tts",
                       voice=tts_conf.get("voice") or "alloy"),
        allow_interruptions=bool(turn_conf.get("allow_interruptions", True)),
    )


class CallRecorder:
    """Best-effort call record + transcript writer (sync Redis, called from event hooks)."""

    def __init__(self, room_name: str, config: dict) -> None:
        self.room = room_name
        self.config = config
        self.client = redis_sync.Redis.from_url(REDIS_URL, decode_responses=True)

    def _key(self, *parts: str) -> str:
        return ":".join([REDIS_PREFIX, *parts])

    def start(self) -> None:
        try:
            import time as _time
            key = self._key(f"call:{self.room}")
            raw = self.client.get(key)
            call = json.loads(raw) if raw else {
                "id": self.room, "started_at": _time.time(),
                "direction": "sip" if self.room.startswith("sip-") else "web",
                "status": "active", "participants": [],
                "ended_at": None, "duration_seconds": None,
            }
            call["agent_id"] = self.config.get("id")
            call["agent_name"] = self.config.get("name")
            self.client.set(key, json.dumps(call, separators=(",", ":")))
            ts = call["started_at"]
            from datetime import datetime, timezone
            day = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
            pipe = self.client.pipeline()
            pipe.zadd(self._key("calls:all"), {self.room: ts})
            pipe.zadd(self._key(f"calls:by_date:{day}"), {self.room: ts})
            pipe.zadd(self._key(f"calls:by_direction:{call['direction']}"), {self.room: ts})
            if call.get("agent_id"):
                pipe.zadd(self._key(f"calls:by_agent:{call['agent_id']}"), {self.room: ts})
            pipe.execute()
        except Exception:
            logger.exception("call record start failed")

    def turn(self, role: str, text: str) -> None:
        if not text:
            return
        try:
            import time as _time
            entry = json.dumps({"ts": _time.time(), "role": role, "text": text}, separators=(",", ":"))
            key = self._key(f"call_transcript:{self.room}")
            self.client.rpush(key, entry)
            self.client.ltrim(key, -2000, -1)
        except Exception:
            logger.exception("transcript write failed")

    def end(self) -> None:
        try:
            import time as _time
            key = self._key(f"call:{self.room}")
            raw = self.client.get(key)
            if not raw:
                return
            call = json.loads(raw)
            if not call.get("ended_at"):
                call["ended_at"] = _time.time()
                call["duration_seconds"] = max(0, int(call["ended_at"] - call["started_at"]))
                call["status"] = "ended"
                self.client.set(key, json.dumps(call, separators=(",", ":")))
        except Exception:
            logger.exception("call record end failed")
        finally:
            self.client.close()


async def entrypoint(ctx: JobContext) -> None:
    config = load_agent_config(ctx.room.name)
    if config is None:
        logger.warning("no agent configured — leaving room %s", ctx.room.name)
        return
    logger.info("room %s -> agent %r (prompt v%s)", ctx.room.name, config.get("name"), config.get("prompt_version"))

    recorder = CallRecorder(ctx.room.name, config)
    recorder.start()
    ctx.add_shutdown_callback(lambda: _finish(recorder))

    session = build_session(config)

    @session.on("conversation_item_added")
    def _on_item(event) -> None:
        item = getattr(event, "item", None)
        role = getattr(item, "role", None)
        text = getattr(item, "text_content", None) or ""
        if role in ("user", "assistant"):
            recorder.turn(role, text)

    agent = Agent(instructions=config.get("system_prompt") or "You are a helpful voice assistant.")
    await session.start(agent=agent, room=ctx.room)

    greeting = (config.get("greeting") or "").strip()
    if greeting:
        await session.say(greeting, allow_interruptions=True)


async def _finish(recorder: CallRecorder) -> None:
    recorder.end()


if __name__ == "__main__":
    if not os.environ.get("OPENAI_API_KEY"):
        print("ERROR: OPENAI_API_KEY is not set (put it in .env). The Phase 1 "
              "worker uses OpenAI for STT/LLM/TTS.", file=sys.stderr)
        sys.exit(1)
    # livekit-agents reads LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
    os.environ.setdefault("LIVEKIT_URL", os.environ.get("APP_LIVEKIT_URL", "ws://127.0.0.1:7880"))
    os.environ.setdefault("LIVEKIT_API_KEY", os.environ.get("APP_LIVEKIT_API_KEY", ""))
    os.environ.setdefault("LIVEKIT_API_SECRET", os.environ.get("APP_LIVEKIT_API_SECRET", ""))
    agents.cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
