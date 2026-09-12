# Build Plan — Voice AI Agent Dashboard ("like software")

Goal: build our own software with the same architecture class as the LiveKit Voice AI
Dashboard v1.37 running on the aic box (see ARCHITECTURE.md). Clean-room build: we copy the
architecture and feature ideas, not the protected code.

## Recommended stack (mirrors what's proven on the reference box)

- Python 3.11+, FastAPI + Jinja2 SSR (or FastAPI + HTMX for interactivity without an SPA)
- livekit-server (self-hosted) + livekit-agents SDK for the voice pipeline
- Redis = primary state + LiveKit message bus; Qdrant = RAG vectors
- Docker for sip/egress/qdrant; systemd for server, dashboard, agent worker
- nginx + Cloudflare tunnel at the edge; token-in-path MCP auth pattern
- Poetry for deps; pytest for tests

## Phase 0 — Foundation (week 1)

1. Repo scaffold: `app/{routes,services,security,middleware,templates,static}`, `scripts/`, Poetry, pytest, `.env` config loader.
2. Infra on a dev VPS: livekit-server (systemd, loopback bind, RTC 50000-60000), Redis with password, nginx reverse proxy, Cloudflare tunnel.
3. FastAPI skeleton: health endpoint, session auth (login page, CSRF, itsdangerous cookies), base Jinja2 layout, static assets.
4. Redis access layer with namespaced keys (`app:agents`, `app:call_history:*`) + TTL cache helper.

Exit: login → empty dashboard page served through the tunnel.

## Phase 1 — Core dashboard + agent runtime (weeks 2-4)

1. **Agent model**: JSON config store (Redis + file snapshot) — name, system prompt, LLM/STT/TTS provider + model + voice, VAD/turn-detection settings.
2. **Agent worker**: `scripts/run_agents.py` using livekit-agents; systemd unit with Memory/CPU limits; start/stop from dashboard via a small privileged helper (sudoers file, like the reference).
3. **Agent editor UI**: SSR form, provider-aware field visibility; prompt version history (append-only list in Redis, diff view, restore).
4. **Rooms/overview page**: LiveKit Server API (livekit-api) — active rooms, participants, server health (CPU/mem/disk).
5. **Web test call**: browser sandbox page joining a room with the agent (token endpoint).

Exit: create an agent in the UI, talk to it from the browser.

## Phase 2 — Telephony (weeks 5-6)

1. Deploy livekit-sip container; trunk CRUD (inbound/outbound) + dispatch rules (DID → agent) in the UI; Twilio/Telnyx setup guides.
2. Call lifecycle capture via webhooks/agent hooks → `call_history` in Redis with `by_agent`, `by_date`, `by_direction` indexes.
3. Transcription capture from the agent session; color-coded transcript viewer.

Exit: real phone number answers with an agent; the call appears in history with transcript.

## Phase 3 — Observability + recordings (weeks 7-8)

1. Latency tracing: STT / LLM TTFT / TTS timings per turn; P50/P90/P99 rollups, slow-call flags; charts (Chart.js).
2. Call summaries + sentiment/topics via LLM post-processing queue.
3. livekit-egress container for recordings → disk; retention/cleanup scheduler.
4. Audit log + security logger; daily analytics aggregates with TTL cache.

## Phase 4 — Knowledge base (RAG) (weeks 9-10)

1. Qdrant container; embedding service (OpenAI or local); collection CRUD.
2. Document ingestion: TXT/MD/CSV/PDF (PyMuPDF), chunk size/overlap config; URL sources with refresh interval.
3. Agent ↔ collection assignment; retrieval tool wired into the agent's LLM context.

## Phase 5 — Programmatic control (MCP + REST) (weeks 11-12)

1. Versioned REST API (`/api/v1`) over the same services.
2. Embedded MCP server at `/mcp` (FastMCP, streamable HTTP): agent CRUD, prompt update, call queries, KB ops.
3. API keys (`sk-mcp-*`) with IP allowlist + rate limits; nginx path-token → Authorization header rewrite for clients that can't send headers.
4. MCP-originated edits tagged in prompt version history.

## Phase 6 — Quality tooling (weeks 13-16, optional but high-value)

1. Simulation: personas + judge LLM + test suites; run against a live agent, score transcripts.
2. Scoring/triage on real calls; regression tests replayed from recorded audio.
3. AutoResearch-style prompt optimizer: analyze transcripts → suggest prompt diffs → simulate before apply.

## Phase 7 — Productization (as needed)

- Web-chat agents + embeddable widget; email service (magic links, reports).
- Multi-tenancy (tenant resolver middleware, per-tenant Redis namespaces) and billing (Stripe, usage tracker, invoices) — only if selling as SaaS.
- Backup/restore, self-updater, license/feature-gate — only if distributing to customers.

## Operating rules

- Single box, loopback-first: only RTC UDP exposed; everything else behind the tunnel.
- Redis is the source of truth; snapshot critical state (agents, keys) to disk on write.
- Every domain = one router + one service module + one template folder; no cross-domain imports except through services.
- Watchdogs from day one: asyncio watchdog, worker-state monitor, restart-always units.

## Suggested first milestone for us

Phases 0-1 on a fresh VPS (or the aic box beside the existing stack on different ports)
≈ 3-4 weeks of effort, and already yields a usable "own-brand" agent dashboard: agent
editor + browser calls + rooms overview. Telephony (Phase 2) is the next visible win.
