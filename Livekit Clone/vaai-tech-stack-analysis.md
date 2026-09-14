# vaai.aetosiot.com — Full Technology Breakdown
**Source:** authenticated offline mirror (403 files / 46 MB) of the live dashboard
**Product:** LiveKit Voice-AI Dashboard, Community Edition — dashboard app **v1.39.0**, white-labelled "Powered By Aetos Techlabs LLP"
**Analysed:** 14 Sep 2026

---

## 1. At a glance

| Layer | Technology |
|---|---|
| Web framework | **FastAPI** (Python) |
| App server | **Uvicorn** (ASGI), behind **nginx** |
| Templating | **Jinja2** — server-rendered HTML, one template per page |
| Front-end framework | **None.** Bootstrap 5.3.0 + vanilla JS + **HTMX 1.9.10** |
| Icons | Bootstrap Icons 1.11.0 |
| Charts | **Chart.js 4.4.0** (UMD) + hand-rolled SVG/CSS sparklines |
| Realtime media | **livekit-client 2.18.9** (browser WebRTC SDK) |
| Data store | **Redis** (primary — not a SQL DB) + **Qdrant** (vectors) |
| Cold storage | Local disk, **AWS S3** or **Google Cloud Storage** (boto3) |
| Agent runtime | **livekit-agents 1.8.0** + ~25 LiveKit provider plugins |
| Process model | **systemd** units + **Docker** containers (Qdrant, some services) |
| Auth | Session cookie + CSRF token (meta tag, injected into HTMX), optional **2FA**, fail2ban jails |
| API style | REST JSON under `/api/*` (~166 endpoints) + a few HTMX HTML partials + 1 SSE stream |
| Built-in MCP server | mounted at `/mcp` (Python `mcp` library) — external clients can drive the dashboard |

---

## 2. Front end

**It is not a SPA.** Every page is a full server-rendered Jinja template. There is no React/Vue/Svelte, no bundler, no npm build step. Total front-end asset footprint is tiny:

```
static/css/style.css          37 KB   ← the entire custom design system
static/js/main.js             12 KB   ← alerts, tab-hash nav, colour fixes
static/js/time-display.js            ← timezone formatting (window.DASHBOARD_TZ)
static/js/userguide.js
static/js/sip-setup-wizard.js
static/js/n8n-webhook-wizard.js
static/js/n8n-report-wizard.js
static/fonts/outfit-var.woff2, jetbrains-mono-var.woff2
```

Everything else is **inline `<script>` and inline `<style>` inside each template** — which is why the page weights are what they are:

```
settings.html   1.65 MB   (5 tab variants of the same monolith)
userguide.html    547 KB
tools.html        376 KB
simulation.html   251 KB
index.html        210 KB
agents.html       171 KB
```

That is the single biggest structural weakness: `settings.html` is a ~1.6 MB monolith holding General / Time&Date / White-Label / CDN / LiveKit / Integrations / Dependencies / Users / Security / System / Finance / Email / Storage / Notes / Licensing plus the entire changelog, all shipped on every load.

### Design system (`static/css/style.css`)
Dark-only, Bootstrap `data-bs-theme="dark"`, driven by CSS custom properties:

```css
--bg-primary:#0a0a0a  --bg-secondary:#141414  --bg-tertiary:#1a1a1a
--bg-card:#1e1e1e     --bg-hover:#252525
--border-color:#2a2a2a --border-hover:#3a3a3a
--text-primary:#fff   --text-secondary:#a0a0a0 --text-muted:#6b6b6b
--brand-primary:#22c55e (emerald)  --brand-primary-hover:#16a34a
--success:#22c55e --danger:#ef4444 --warning:#f59e0b --info:#10b981
```
Layout: fixed 240 px left sidebar (`.sidebar`), `.main-content { margin-left:240px }`, sticky `.top-bar`, `main { max-width:1600px; padding:2rem }`. Body ships with `style="zoom:0.9"` — a blunt global scale-down instead of a proper type scale. Brand colour, logo and fonts are overridable at runtime from Settings → White-Label.

### Interaction model
- **HTMX** for partial loads: `hx-get` / `hx-post` / `hx-trigger` (~49 / 29 / 20 uses) against HTML-partial routes like `/settings/_partials/pricing_tab`, `/rooms`, `/improvement-lab/history`. CSRF token is read from `<meta name="csrf-token">` and attached to HTMX requests.
- **`fetch()` + JSON** for the bulk of the app (the ~166 `/api/*` endpoints).
- **SSE** (`EventSource`) for long-running work — e.g. `/api/provider/test-all-models`.
- **Polling** for update/restart flows (`/api/system/update-status`, `update-follow`) with logic that distinguishes a real JSON 500 from nginx's HTML 502 page during restarts.
- **livekit-client UMD** only on the agent-tester page — browser joins a LiveKit room with a token from `/api/agent-tester/token`, ICE from `/api/agent-tester/ice-servers`.

---

## 3. Back end

**FastAPI + Uvicorn**, fronted by **nginx** (TLS, upload limits, a branded 502 "Restarting…" page wired in at install time).

### Services (systemd + Docker)
Visible from Settings → System / Logs / Alerts:

| Service | Unit | Role |
|---|---|---|
| Dashboard | `livekit-dashboard` | this FastAPI app |
| LiveKit Server | `livekit.service` | SFU / WebRTC media (server v1.13.6) |
| Agent Worker | `livekit-agent` | the voice/chat AI agent process |
| SIP | `livekit-sip` | SIP bridge for telephony |
| Egress | `livekit-egress` | recording / composite egress |
| Redis | — | primary datastore |
| Qdrant | Docker container | vector DB for KB + agent memory |
| nginx | — | reverse proxy |

Per-service CPU/memory caps are editable from the UI (writes systemd/Docker limits and restarts in background). Alerting emails on service-down and CPU/memory thresholds.

### Data model — Redis-first, no SQL
- Calls, chats, transcripts, summaries, agent configs, settings, API keys, campaign state → **Redis**.
- Hot/cold tiering: "Keep in Redis (memory) N days" + hard **Redis size limit (MB)**; older records gzipped to local disk / S3 / GCS and rehydrated on open.
- Vector data (KB documents, agent memory via **mem0ai 2.0.20**) → **Qdrant**.
- Backup = Redis export + configs + optional Qdrant vectors + audio, zipped, chunk-uploaded (to dodge nginx body limits), restorable with preview + undo, plus scheduled cloud backup to S3/GCS.
- Explicitly *not* in backups: source code, pip deps, SSL certs, systemd/nginx config, raw Redis files.

### AI / voice stack (Python)
```
livekit-agents 1.8.0, livekit 1.1.17, livekit-api 1.2.1,
livekit-local-inference 0.2.7 (on-device turn detection/VAD),
livekit-plugins-silero / turn-detector / dtln / webrtc-noise-gain
STT : deepgram-sdk 7.8.1, openai 2.54.0 (Whisper), google-cloud-speech 2.40.0,
      assemblyai, speechmatics, sarvam, azure, groq, telnyx, slng, salutespeech
LLM : openai (incl. xAI), google-genai 2.22.0, anthropic 0.125.0, aws (Bedrock),
      groq — routed/failover via LiteLLM
TTS : cartesia 4.2.0, elevenlabs 2.66.0, google-cloud-texttospeech 2.37.0,
      hume, minimax-ai, rime, azure, groq (PlayAI/Orpheus)
Avatars: D-ID, Tavus, Beyond Presence, HeyGen (liveavatar), Anam, Simli, Avatario
SMS : twilio 9.11.0, telnyx 4.178.0
KB  : pymupdf 1.28.2, beautifulsoup4 4.15.0, httpx 0.28.1, dspy 3.3.1 (AutoResearch)
Memory: mem0ai 2.0.20
Observability: opentelemetry-api/sdk 1.44.0 → spans buffered & flushed to Redis
      (no external collector)
Storage: boto3 1.40.61
Automation: n8n webhooks (report + webhook wizards)
```

### Telephony
SIP trunks (inbound/outbound), dispatch rules, phone numbers, campaigns — Twilio and Telnyx guided setup wizards. `livekit-sip` handles the SIP↔WebRTC bridge; fail2ban jails cover SIP flood/scan and 2FA brute force.

---

## 4. API surface

~166 distinct `/api/*` REST endpoints. Grouped:

| Group | Examples |
|---|---|
| Analytics / stats | `/api/server-stats`, `/api/analytics/export`, `/api/call-history/latency-stats`, `/api/call-history/health-stats` |
| Rooms / live | `/api/rooms/active-metrics`, `/api/rooms/{name}` |
| Agent tester | `/api/agent-tester/token`, `/ice-servers`, `/device-prefs` |
| Tools | `/api/tools/*`, `/api/webhook-tools/*`, `/api/mcp-servers/*`, `/api/mcp-server-templates` |
| Knowledge base | `/api/kb/collections`, `/documents`, `/memories`, `/search`, `/qdrant/setup`, `/api/kb/config` |
| Simulation | `/api/simulation/tests|suites|runs|suite-runs/*` (+ improve-prompt, compare, apply-version) |
| Telephony | `/api/sip-outbound-trunks`, `/api/sip/outbound-call`, `/api/campaigns/*` |
| Providers / pricing | `/api/provider/test/{id}`, `/api/pricing/providers/*`, `/api/llm-health/*`, `/api/estimate` |
| Storage / backup | `/api/backup/*`, `/api/call-history/backup|sync-to-cloud`, `/api/test-s3-storage`, `/api/test-gcs-storage` |
| Security | `/api/security/{settings,ban,banned,whitelist,ip-lock,logs,my-ip,restart,reload}` |
| System | `/api/system/update-check|follow|install|status`, `/api/system/ntp-status|sync` |
| Email | `/api/email/{settings,templates,logs,test}` |
| Widget / embed | `/api/widget/token`, `/api/widget/end`, `/api/widget-abuse-settings` |
| Licensing | `/api/license/activate`, `/api/license/reverify` |

Plus HTML-partial routes for HTMX (`/settings/_partials/pricing_tab`, `/improvement-lab/history`, …) and the MCP endpoint at `/mcp`.

---

## 5. Information architecture (sidebar)

```
Core        Analytics · Reports · Rooms · Call History · Chat History ·
            Recording/Egress · Tools · Knowledge Base/Memory ·
            Voice Agents · Chatbot Agents
Telephony   SIP Trunks · Dispatch Rules · Phone Numbers · Campaigns
Testing     Agent Tester · Simulation · AutoResearch · Improvement Lab
Admin       Settings (15 tabs) · User Guide
```

---

## 6. Honest assessment — what to keep, what to fix in the clone

**Keep**
- Server-rendered + HTMX: fast first paint, no build toolchain, trivially white-labelled.
- CSS-variable design tokens — already the right foundation for theming.
- Redis-hot / object-storage-cold tiering with live usage gauges.
- IA: the four-group sidebar is genuinely clear.

**Fix**
1. **Inline everything.** 1.6 MB `settings.html`, 376 KB `tools.html`. Split into per-tab partials loaded on demand; extract inline JS to modules.
2. **`zoom: 0.9` on `<body>`.** Breaks accessibility zoom and subpixel layout. Replace with a real type/space scale.
3. **Dark-only.** No light theme, no theme switcher, no `prefers-color-scheme`.
4. **Not responsive.** Fixed 240 px sidebar with `margin-left:240px` and no collapse/drawer — unusable on tablet or phone.
5. **Weak visual hierarchy.** Flat `#1e1e1e` cards, one accent colour, no elevation system, no chart palette — 13 `new Chart()` calls with ad-hoc colours.
6. **No design-system layer.** Bootstrap defaults patched per page; badges, tables and empty states drift between pages.
7. **Nav depth.** 15 settings tabs behind one link; no global search / command palette across 20+ pages.
