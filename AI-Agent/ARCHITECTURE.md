# LiveKit Voice AI Dashboard — Software Architecture (as deployed on vps-fo3x / aic)

Surveyed live on 28 Aug 2026 via the `livekit-dashboard-mcp-aic.aetosiot.com` connection.
Product: **LiveKit Voice AI Dashboard v1.37.0** — self-hosted SSR dashboard for a private
LiveKit server with AI voice agents, telephony, and analytics. App code is PyArmor-protected
(commercial); this document is reconstructed from the deployment surface: systemd units,
configs, route/service/template names, README, Redis schema, containers, and nginx.

---

## 1. Topology (single-box deployment)

```
Internet ──► Cloudflare Tunnel ──► nginx (127.0.0.1:8880)
                                      │  /mcp/sk-mcp-<key> → header rewrite → /mcp
                                      ▼
                        Dashboard (FastAPI/uvicorn :8000, systemd, user krishna)
                                      │ REST/WS + LiveKit Server API
        ┌─────────────┬───────────────┼───────────────┬──────────────┐
        ▼             ▼               ▼               ▼              ▼
  livekit-server   Redis 6379    Qdrant (docker,  Agent Worker   Provider APIs
  (binary :7880,   (state +      host net, vol → (systemd,      OpenAI/Anthropic/
  RTC UDP 50000-   message bus,  data/qdrant)     livekit-agents Google/Deepgram/
  60000, TCP 7881, 113 keys)                      1.7, ws://     ElevenLabs/Cartesia/
  loopback bind)                                  127.0.0.1:7880) AWS Bedrock
        │
        ├── livekit-sip    (docker, host net, /etc/livekit-sip/config.yaml)   → SIP trunks
        └── livekit-egress (docker, host net, /etc/livekit-egress/config.yaml,
                            recordings → /var/livekit/egress)
```

Process management: systemd units `livekit.service`, `livekit-dashboard.service`,
`livekit-agent.service` (MemoryMax=1856M, CPUQuota=80%), `redis-server`, `nginx`;
docker only for sip / egress / qdrant. Dashboard unit self-installs a sudoers file
(`/etc/sudoers.d/livekit-dashboard`) at start so the web app can manage services.

## 2. Runtime stack

| Layer | Choice |
|---|---|
| Language | Python ≥3.11, Poetry-managed |
| Web framework | FastAPI 0.141 + Starlette <1.0, uvicorn |
| Rendering | SSR with Jinja2 templates (`*.html.j2`), no SPA framework |
| Realtime media | livekit-server binary + livekit-agents 1.7 SDK |
| Agent plugins | deepgram, openai, elevenlabs, google, cartesia, silero VAD, DTLN noise suppression, turn-detector (MultilingualModel) |
| AI SDKs | anthropic, google-genai, google-cloud-speech/tts, deepgram-sdk, elevenlabs, cartesia, dspy (AutoResearch), mem0ai (agent memory) |
| Primary datastore | Redis (namespaced keys, see §5) |
| Vector store | Qdrant (RAG knowledge base) |
| Docs/PDF | PyMuPDF (KB ingestion) |
| Protection | PyArmor 9.2 (pro) + license manager + feature gate |

## 3. Application structure (monolith, modular by domain)

```
app/
  main.py            FastAPI entry (uvicorn app.main:app)
  config.py
  core/feature_gate.py            # license-driven feature flags
  middleware/tenant_resolver.py   # multi-tenant request routing
  security/          basic_auth, csrf, two_factor, license_guard,
                     rest_api_auth, super_admin_guard, tenant_route_gate
  routes/            ~45 routers (one per domain, see §4)
  services/          ~150 service modules (business logic)
  templates/         Jinja2, one folder per domain + _macros/components
  static/            assets, 502 fallback page
scripts/run_agents.py             # agent worker entrypoint (start/stop CLI)
agent_config.json                 # agents + license state on disk
data/qdrant, logs/, /var/livekit/egress (recordings)
```

## 4. Functional domains (from routes/ + templates/)

- **Auth & accounts**: password + magic-link + signup, 2FA, forgot/reset, impersonation, signup protection, IP lock, fail2ban integration.
- **Agents**: visual agent editor (~150 config fields: LLM/STT/TTS/realtime pipeline, VAD, turn detection, handoffs, voicemail/IVR detection, LLM fallback), start/stop from UI, prompt versioning with diff/restore, agent templates, export/import.
- **Telephony**: SIP inbound/outbound trunks, dispatch rules (DID → agent routing), campaign dialer/executor, SMS (Telnyx, n8n workflows, sent.dm), 3CX integration, trunk whitelists.
- **Calls**: call history (Redis-indexed by agent/date/direction), transcription viewer, latency observability (STT/LLM/TTS component breakdown, P50/P90/P99, traces), sentiment/topic AI insights, call summaries, annotations, recordings via egress + cleanup/retention queues.
- **Knowledge base (RAG)**: collections, document upload (TXT/MD/CSV/PDF), URL sources with auto-refresh, chunking config, Qdrant vector search, per-agent collection assignment, embedding service.
- **Quality tooling**: Simulation suite (personas, judges, suites, runs), Improvement Lab (scoring criteria, triage, replay/STT-replay, audio regression tests), AutoResearch (OPRO + DSPy prompt optimization from real transcripts, scheduler).
- **Web chat**: chatbot agents, embeddable widget (`widget_api`, sandbox pages), chat history + summaries.
- **Billing / multi-tenant**: Stripe client, pricing plans, invoices (store, rollup, delivery, daemon), spend analytics, usage tracker, tenant lifecycle/manager/sweeper/redis, cluster + capacity nodes.
- **Platform**: settings, backups (system + call-history), updater/version manager, service monitor + resource monitor, audit log, security logger, reports engine, email service, LLM health checks, MCP API keys.
- **MCP server** (`/mcp`, streamable HTTP): ~180 tools mirroring the whole feature surface; API-key auth (`sk-mcp-*`), IP allowlists, per-key rate limits; MCP edits recorded in prompt version history with key name.

## 5. Data model (Redis-first)

Namespaced keys, e.g.:
`livekit:agents`, `livekit:call_history` (+ `by_agent:*`, `by_date`, `by_direction:*`),
`livekit:call_transcriptions`, `livekit:call_observability{,:index,:traces,:status}`,
`livekit:kb_collections|kb_documents:<id>|kb_agent_collections|kb_config`,
`livekit:campaigns`, `livekit:chat_agents`, `livekit:handoff_configs`,
`livekit:mcp_api_keys`, `livekit:audit_log`, `livekit:license`, `livekit:branding_settings`,
`analytics:*` and `livekit:analytics_cache:*` (TTL caches), `agent_job:sim-*`.
Redis doubles as LiveKit's message bus (server ↔ sip ↔ egress share the same instance).
Files hold what Redis shouldn't: qdrant vectors, recordings, logs, agent_config.json.

## 6. Edge & exposure

nginx site `vaai-dashboard` listens loopback :8880 behind a **Cloudflare tunnel**
(vaai-dashboard.aetosiot.com). Notable pattern: URL-path token for MCP clients that
can't send headers — `location ~ ^/mcp/sk-mcp-…` maps the path segment into
`Authorization: Bearer …` and rewrites to `/mcp`. WebSocket upgrade headers passed
through; 502 fallback page served from app static.

## 7. Cross-cutting concerns observed

- Config hot-reload service, env write lock, asyncio watchdog, worker state monitor, turn-detector self-heal — resilience for a long-running single process.
- Retention/cleanup schedulers for logs, history, recordings, versions.
- Licensing enforced in code (feature_gate + license_guard) and by PyArmor obfuscation.
- Single-box design: everything binds loopback except RTC UDP; security by tunnel + tokens rather than exposed ports.
