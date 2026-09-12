"""Agent configuration model (Phase 1).

Stored as JSON in the ``app:agents`` Redis hash (field = agent id) and
snapshotted to ``data/agents.json`` on every write, per the operating rule
"Redis is the source of truth; snapshot critical state to disk on write".
"""
from __future__ import annotations

import re
import secrets
import time

from pydantic import BaseModel, Field, field_validator

# Providers the UI offers. The Phase 1 worker implements the "openai" stack
# end-to-end; other providers appear in the dropdowns but are marked as
# needing their plugin + API key wired into the worker.
LLM_PROVIDERS = ["openai", "groq", "anthropic"]
STT_PROVIDERS = ["openai", "deepgram"]
TTS_PROVIDERS = ["openai", "elevenlabs", "cartesia"]
TURN_DETECTION_MODES = ["vad", "stt", "manual"]

DEFAULT_MODELS = {
    "llm": {"openai": "gpt-4o-mini", "groq": "llama-3.3-70b-versatile", "anthropic": "claude-3-5-haiku-latest"},
    "stt": {"openai": "gpt-4o-mini-transcribe", "deepgram": "nova-3"},
    "tts": {"openai": "gpt-4o-mini-tts", "elevenlabs": "eleven_turbo_v2_5", "cartesia": "sonic-2"},
}
DEFAULT_VOICES = {"openai": "alloy", "elevenlabs": "Rachel", "cartesia": "default"}

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,47}$")


def new_agent_id(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:32] or "agent"
    return f"{base}-{secrets.token_hex(3)}"


class LLMSettings(BaseModel):
    provider: str = "openai"
    model: str = DEFAULT_MODELS["llm"]["openai"]
    temperature: float = Field(0.7, ge=0.0, le=2.0)


class STTSettings(BaseModel):
    provider: str = "openai"
    model: str = DEFAULT_MODELS["stt"]["openai"]
    language: str = "en"


class TTSSettings(BaseModel):
    provider: str = "openai"
    model: str = DEFAULT_MODELS["tts"]["openai"]
    voice: str = DEFAULT_VOICES["openai"]


class TurnSettings(BaseModel):
    mode: str = "vad"                     # vad | stt | manual
    vad_min_silence: float = Field(0.55, ge=0.1, le=5.0)   # seconds of silence to end a turn
    vad_activation_threshold: float = Field(0.5, ge=0.05, le=1.0)
    allow_interruptions: bool = True


class AgentConfig(BaseModel):
    id: str
    name: str
    system_prompt: str = "You are a helpful voice assistant. Keep answers short and conversational."
    greeting: str = "Hello! How can I help you today?"
    llm: LLMSettings = Field(default_factory=LLMSettings)
    stt: STTSettings = Field(default_factory=STTSettings)
    tts: TTSSettings = Field(default_factory=TTSSettings)
    turn: TurnSettings = Field(default_factory=TurnSettings)
    active: bool = True
    prompt_version: int = 1
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)

    @field_validator("id")
    @classmethod
    def _valid_id(cls, v: str) -> str:
        if not _ID_RE.match(v):
            raise ValueError("id must be lowercase letters/digits/dashes, 3-48 chars")
        return v

    @field_validator("name")
    @classmethod
    def _valid_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name is required")
        return v[:80]
