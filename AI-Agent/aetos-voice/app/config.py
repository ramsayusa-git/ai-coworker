"""Application configuration.

All settings load from environment variables prefixed with ``APP_`` and,
when present, from a ``.env`` file in the working directory.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_VERSION = "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APP_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Identity
    app_name: str = "Aetos Voice AI Dashboard"

    # Bind address (loopback-first, per operating rules)
    host: str = "127.0.0.1"
    port: int = 8100

    # Security
    secret_key: str = "change-me-generate-a-real-secret"
    session_cookie: str = "av_session"
    session_max_age: int = 12 * 3600  # seconds
    admin_username: str = "admin"
    admin_password: str = "admin"  # override in .env before exposing anywhere

    # Redis
    redis_url: str = "redis://127.0.0.1:6379/0"
    redis_prefix: str = "app"

    # LiveKit (Phase 1) — local livekit-server, loopback
    livekit_url: str = "ws://127.0.0.1:7880"
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # Disk snapshot location for critical state (agents.json)
    data_dir: str = "data"

    @property
    def data_dir_path(self):
        from pathlib import Path

        return Path(self.data_dir)

    @property
    def insecure_defaults(self) -> list[str]:
        """Names of settings still on shipped defaults (shown as a warning banner)."""
        problems = []
        if self.secret_key == "change-me-generate-a-real-secret":
            problems.append("APP_SECRET_KEY")
        if self.admin_password == "admin":
            problems.append("APP_ADMIN_PASSWORD")
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
