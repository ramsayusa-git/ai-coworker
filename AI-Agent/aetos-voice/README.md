# Aetos Voice AI Dashboard

Clean-room, self-hosted voice AI agent dashboard — our own software with the same
architecture class as the reference LiveKit Voice AI Dashboard v1.37 (see
`../ARCHITECTURE.md` and `../BUILD-PLAN.md`). Architecture and feature ideas are
copied; code is original.

**Status: Phase 0 — Foundation.** FastAPI + Jinja2 SSR, session auth (signed
cookies, CSRF, login throttle), namespaced Redis access layer with TTL cache,
health endpoint, dark-theme dashboard shell.

Quick start: `bash setup.sh && bash run.sh` → http://127.0.0.1:8100 — full steps
in [installation.md](installation.md).
