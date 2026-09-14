# Aetos Voice Platform — plugin architecture
**Home-Assistant-style extensibility, adapted for a real-time voice system**
Date: 14 Sep 2026

---

## The one idea that decides everything

Home Assistant's extensibility does not come from its add-on store. It comes from having **one universal data model (entities + state machine) and one event bus** that every integration publishes into and nothing talks around. The add-on store is just packaging on top.

So the first question is not "how do I install plugins" — it is **"what is my entity/event bus equivalent?"**

For a voice platform it is this:

| Home Assistant | Aetos |
|---|---|
| Entity + state machine | **Session / Turn** objects |
| Event bus (`state_changed`, …) | **Event bus** (`session.started`, `turn.completed`, `tool.called`, `session.ended`, `summary.ready`) |
| Service registry (`light.turn_on`) | **Tool registry** (JSON-schema functions an agent calls mid-call) |
| Integration (Python, in-process) | **Provider** (STT / LLM / TTS / VAD / turn-detector / avatar) |
| Add-on (container) | **Add-on** (container) — identical concept |
| Lovelace card (runtime ES module) | **Panel** (runtime ES module) — identical concept |
| Config flow (UI setup) | **JSON-schema-driven settings UI** |

Build the event bus and the registries first. The store is the last thing you build, not the first.

---

## The constraint Home Assistant does not have: latency

You are inside an ~800 ms time-to-first-audio budget. HA's add-ons are never in a real-time path; yours would be. That single fact tiers the whole system:

| Tier | What | Where it runs | Latency budget | Independently updatable? |
|---|---|---|---|---|
| **0 — hot** | STT, LLM, TTS, VAD, turn detection | **in-process** with the agent worker | microseconds | **No** — locked bundle with core |
| **1 — warm** | Tools called mid-turn | out-of-process, local | 1–5 ms overhead on a 300 ms call | **Yes** |
| **2 — cold** | Event subscribers, sinks, reporting, CRM sync, connectors | containers, off the hot path | irrelevant | **Yes** |
| **3 — UI** | Panels, cards | browser | n/a | **Yes** |

**Nothing from tier 1–3 may ever sit between STT and TTS.** That is the architectural line. Plugins extend the edges of a call, not its middle.

---

## Use MCP as the tool plugin ABI

This is the highest-leverage decision in the whole design, and you are already half-way there — the console ships an MCP server at `/mcp`.

A tool add-on is **a container that exposes an MCP server over HTTP**. That gets you, for free:

- **Dependency isolation solved.** The Python dependency-tree problem that kills in-process plugins simply does not exist across a process boundary. This is the single biggest risk in the naive HA-copy design, and MCP removes it.
- **Language freedom.** A customer writes a tool in Go or Node. You do not care.
- **Discovery is in the protocol.** `tools/list` returns names and JSON schemas — exactly what the LLM needs, no bespoke manifest parsing.
- **Testing for free.** Any MCP client (Claude Code included) can drive a tool add-on in isolation.
- **Cost is ~1–5 ms** of local HTTP against a 200–400 ms LLM call. Invisible.

Do not invent a tool plugin ABI. You would be writing a worse MCP.

---

## Component layout

```
┌─ Aetos One OS ─ immutable, A/B partitions (RAUC) ───────────────────────┐
│                                                                         │
│  aetosd  (Supervisor)                                                   │
│    install · update · rollback · health · resource caps · signatures     │
│    entitlement check · backup · log aggregation                          │
│      │                                                                  │
│      ├── Core            FastAPI + Uvicorn                              │
│      │     registries: provider · tool · channel · sink · panel          │
│      │     event bus (Redis Streams) · config store (SQLite)             │
│      │     console API · secrets broker · plugin token issuer            │
│      │                                                                  │
│      ├── Agent Worker    livekit-agents          ← HOT PATH, monolithic  │
│      │     └── provider bundle (in-process, one lock file)               │
│      │                                                                  │
│      ├── Platform        livekit · livekit-sip · livekit-egress          │
│      │                                                                  │
│      └── Add-ons (containers, independently updatable)                   │
│            tool:    MCP servers          (booking, CRM lookup, SMS)      │
│            channel: session sources      (WhatsApp, Teams, Telegram)     │
│            sink:    event subscribers    (BigQuery, Sheets, webhook)     │
│            service: plain infra          (Qdrant, Redis, n8n, MQTT)      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
        Caddy  ──►  Frontend shell (Vite, static)
                      └── panels/*.js   ← runtime ES modules, per-plugin
```

---

## The six plugin kinds

| Kind | Runs as | Contract | Update cadence |
|---|---|---|---|
| `provider` | in-process Python | `livekit-agents` plugin ABC | **with core**, locked bundle |
| `tool` | container | **MCP over HTTP** | independent |
| `channel` | container | Core session API (HTTP/WS) + webhook | independent |
| `sink` | container | Redis Streams consumer group | independent |
| `panel` | browser ES module | `window.aetos.registerPanel()` | independent |
| `service` | container | none — plain infra | independent |

Be honest in your marketing about the first row. "Everything updates individually" is not true of providers and never will be, because in-process Python plugins share one dependency tree — two providers wanting different `grpcio` or `protobuf` versions break the worker. Your own Dependencies page already warns about exactly this with `boto3` and `aiobotocore`. Ship providers as a **versioned bundle** (`provider-bundle 2026.9.1`) and say so.

---

## Manifest — one format for every kind

`aetos.yaml`, modelled on HA's `config.yaml` + `manifest.json`, merged:

```yaml
slug: whatsapp-channel
name: WhatsApp Channel
version: 1.4.2
kind: channel                    # provider|tool|channel|sink|panel|service
core_api: ">=1.4,<2"             # the entire compatibility matrix, in one field
arch: [amd64, aarch64]
image: ghcr.io/aetos/addon-whatsapp-{arch}

schema:                          # JSON Schema → settings UI is GENERATED
  waba_id:      {type: string, title: "WhatsApp Business ID"}
  phone_number: {type: string, pattern: "^\\+[0-9]{8,15}$"}
  agent:        {type: string, x-ref: agent}

grants:                          # capabilities, shown to the user at install
  - events:session.*:read
  - api:agents:read
  - secrets:whatsapp_token
  - net:graph.facebook.com

panel: panel.js                  # optional bundled UI
license: pro                     # community|pro|enterprise
signature: cosign:...            # over manifest + image digest
```

Three fields carry most of the weight:

- **`schema`** — the settings UI is generated from it. This is HA's config-flow lesson: if every add-on author has to hand-build a settings page, nobody writes add-ons.
- **`grants`** — explicit capability grants, displayed before install and enforced by Core. **Home Assistant does not have this** — its add-ons run broadly privileged, and it has hurt them repeatedly. You hold carrier credentials, call recordings and provider API keys. Get this right from v1; retrofitting a permission model is nearly impossible.
- **`core_api`** — your whole version matrix in one semver range. Supervisor refuses to install or keep an incompatible plugin, and this is the only thing that will let you make breaking changes later without a support catastrophe.

---

## Repositories and the store

Straight copy of HA's model, it is good:

```
repo-root/
  repository.yaml        # name, maintainer, url
  whatsapp-channel/
    aetos.yaml
    panel.js
  crm-lookup-tool/
    aetos.yaml
```

- **Official repo** — signed, reviewed, supported, ships in the base image.
- **Community repos** — user adds a git URL. Warning banner, unsupported, and a single **"disable all community plugins"** switch. You will need that switch on day one of your first support ticket; HA's equivalent policy is "reproduce without custom components".

---

## Event bus — the thing that makes plugins safe

HA uses an in-process asyncio bus. You need cross-process, so: **Redis Streams** (already running) with consumer groups.

```
session.started   {session_id, agent, channel, from, started_at}
turn.completed    {session_id, n, asr_ms, llm_ms, tts_ms, text}
tool.called       {session_id, tool, args_digest, ok, ms}
session.ended     {session_id, outcome, duration, cost}
summary.ready     {session_id, summary, sentiment, transcript_url}
system.*          {service, level, message}
```

Why this specific mechanism matters: consumer groups mean **a slow or crashed plugin cannot stall a call**. It falls behind in the stream and catches up later. Compare an in-process hook, where one plugin's blocking HTTP call adds 400 ms to the caller's turn. Every sink, connector and report subscribes here. Nothing subscribes inside the agent loop.

Use NATS JetStream instead only if you outgrow Redis in the cloud tier. Do not add it to a single-box install.

---

## Fix the data layer while you are here

The current product uses Redis as its primary database. For a plugin system that will not hold:

- Plugin install state, versions, grants and audit logs are **transactional** data.
- You need schema migrations across plugin versions.
- Backup today is "export Redis" — fragile, and it is already the source of restore bugs in your changelog.

**SQLite for config, registry, entitlements and audit** (Postgres in the cloud tier — same SQL, one codebase). **Redis stays** for hot session data and the event bus, which is what it is good at. Do this before the plugin system, not after; migrating a live install base later is far worse.

---

## Security model

| Layer | Control |
|---|---|
| Supply chain | cosign signature over manifest + image digest; Supervisor refuses unsigned in the official channel |
| Install | user sees and approves `grants` |
| Runtime | one container per plugin · read-only rootfs · dropped caps · no host network by default · per-plugin volume · memory and CPU caps |
| API | per-plugin bearer token, scoped to its granted `api:` and `events:` entries |
| Secrets | **brokered by Core** — a plugin gets a scoped token, never your raw Deepgram or Twilio key, unless `secrets:` explicitly grants it |
| Network | egress allowlist from `net:` grants |
| Support | community plugins flagged; one-click disable-all |

---

## Licence integration

Entitlements ride in the signed licence JWT, so everything works offline:

1. Supervisor reads entitlements from the local JWT (public key embedded, verified offline).
2. Store index is filtered — `license: pro` add-ons are not offered without entitlement.
3. At start, Supervisor checks each installed plugin against entitlements.
4. On expiry: **grace period, then stop the plugin — never the call.** A voice system must keep answering the phone even when your licence server is down.

---

## Build order — do not build all of this

Phase 0 is not optional and everything else depends on it.

| Phase | What | Why here |
|---|---|---|
| **0** | **Extract and semver the Core Plugin API.** Registries, event schema, plugin token issuer. Publish `core_api 1.0`. | Nothing below works without a stable contract. This is the phase people skip and regret. |
| **1** | **Panels** — ES modules + `window.aetos` contract | Lowest risk, visible immediately, proves the contract with no infrastructure |
| **2** | **Tools as MCP containers** | Biggest value per unit of work; dependency isolation comes free |
| **3** | **Sinks on Redis Streams** | Unlocks every integration request without touching core |
| **4** | **Supervisor + store UI + signing + repositories** | Only worth building once phases 1–3 prove the contracts |
| **5** | **Channels** | Most invasive; do it last |
| **—** | **Providers stay bundled.** Possibly forever. | The dependency tree says so |

Phases 1–3 give you most of the extensibility benefit for maybe a quarter of the effort of phase 4. Ship them, then decide whether the store is worth it.

---

## What NOT to copy from Home Assistant

1. **Privileged add-ons.** HA add-ons run with broad host access. You carry carrier credentials and recordings. Add the `grants` model.
2. **YAML and Redis as the database.** Use SQL for structured state.
3. **In-process third-party Python.** `custom_components` is HA's biggest breakage source, and HA does not have your latency budget. Third parties get containers and ES modules, not your agent process.
4. **An unstable plugin API.** HA breaks custom components on a regular cadence and the community absorbs the pain. You will be selling this. Semver the plugin API and commit publicly to two minor versions of deprecation warning before any removal.
5. **Supervisor-only features.** HA's "some features only on HAOS/Supervised" split confuses everyone. Decide up front: either add-ons are appliance-only and you say so plainly, or Core degrades gracefully in plain-container mode with the store hidden.

---

## Bottom line

Build, in this order: **event bus → registries → semver'd plugin API → panels → MCP tools → sinks → store**.

Keep the voice path monolithic. Make tools MCP. Give plugins capability grants. Ship providers as a bundle and be honest that they are not independently updatable — that one piece of honesty now will save you the 2027 you would otherwise spend fixing dependency conflicts in production.
