"""FastAPI entrypoint — run with `python -m app` or `uvicorn app.main:app`."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import APP_VERSION, get_settings
from app.core.redis_store import RedisStore
from app.routes import agents, auth, calls, dashboard, health, rooms, testcall, webhooks
from app.security.auth import SessionManager

BASE_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    ok = await app.state.redis.ping()
    if not ok:
        # Boot anyway — dashboard shows Redis as down; nothing in Phase 0 hard-depends on it.
        print("WARNING: Redis unreachable at startup "
              f"({app.state.settings.redis_url}) — running degraded.")
    yield
    await app.state.redis.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=APP_VERSION, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)

    app.state.settings = settings
    app.state.redis = RedisStore(settings.redis_url, settings.redis_prefix)
    app.state.sessions = SessionManager(settings)

    templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
    templates.env.globals["app_name"] = settings.app_name
    templates.env.globals["app_version"] = APP_VERSION
    app.state.templates = templates

    app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(dashboard.router)
    app.include_router(agents.router)
    app.include_router(rooms.router)
    app.include_router(testcall.router)
    app.include_router(calls.router)
    app.include_router(webhooks.router)
    return app


app = create_app()
