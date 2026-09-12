# aetos-voice — local installation (aiserver)

> **Phase 1 note.** The app now includes the agent editor (`/agents`), prompt
> version history, rooms overview (`/rooms`), and the browser test call
> (`/test-call`). Local infra lives in `~/.local/valkey` (Redis-compatible,
> port 6379) and `~/.local/livekit` (livekit-server, port 7880, loopback).
> The agent worker (`bash run_worker.sh`) needs `OPENAI_API_KEY` in `.env`;
> deps install with `pip install -e ".[dev,worker]"` (setup.sh does this).

Phase 0 foundation of the clean-room clone (see ../BUILD-PLAN.md). Runs entirely
locally: FastAPI + Jinja2 SSR dashboard with session auth, CSRF, and a namespaced
Redis access layer. No LiveKit needed yet — that arrives in Phase 1.

## Prerequisites

Python 3.11+ and Redis. On aiserver (Ubuntu/Debian):

```bash
sudo apt update
sudo apt install -y python3-venv redis-server
sudo systemctl enable --now redis-server
```

The app boots without Redis too (dashboard shows "Redis: Offline"), but install it —
Redis is the primary datastore from Phase 1 onward.

## Setup and run

```bash
cd ~/ai-work-space/ai-coworker/AI-Agent/aetos-voice
bash setup.sh        # venv + deps + .env with a generated secret
nano .env            # set APP_ADMIN_PASSWORD (defaults to 'admin')
bash run.sh          # serves http://127.0.0.1:8100
```

Open http://127.0.0.1:8100 → you get the login page → sign in with
`APP_ADMIN_USERNAME` / `APP_ADMIN_PASSWORD` from `.env` → empty dashboard with
live service/Redis/host tiles. That is the Phase 0 exit criterion.

## Tests

```bash
.venv/bin/pytest    # 11 tests: auth, CSRF, throttle, health, Redis layer
```

Tests use fakeredis — they pass with no Redis running.

## Run as a service (optional)

```bash
sudo cp deploy/aetos-voice.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aetos-voice
systemctl status aetos-voice
```

## Health check

```bash
curl -s http://127.0.0.1:8100/healthz | python3 -m json.tool
```

## Layout

```
app/
  main.py            app factory, security headers, router mounting
  config.py          APP_* settings from .env (pydantic-settings)
  core/redis_store.py    namespaced keys (app:*), JSON/hash helpers, TTL cache
  security/auth.py       PBKDF2 passwords, signed-cookie sessions, CSRF, throttle
  routes/            health.py (/healthz), auth.py (/login,/logout), dashboard.py (/)
  services/system_service.py   uptime, redis, memory/disk/load snapshot
  templates/         base + login + dashboard (Jinja2, dark theme)
  static/css/app.css
tests/               pytest + httpx + fakeredis
deploy/aetos-voice.service
```

## Next (Phase 1)

Agent config model in Redis (`app:agents`), agent editor UI, `scripts/run_agents.py`
worker on livekit-agents, rooms overview via LiveKit API, browser test call.
