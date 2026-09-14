# Aetos Voice Platform — target architecture
**Requirements:** clean, manageable API · LiveKit SDK, STT/TTS/LLM SDKs each managed and upgraded individually · every component upgradable on its own · **core never touched by any other component's upgrade**
Date: 14 Sep 2026

---

## The rule that makes it work

> **Core imports no vendor SDK. Ever.**
> Not `deepgram-sdk`, not `elevenlabs`, not `livekit-agents`, not `boto3`. Core talks to everything over a network contract. If a component can only be upgraded by changing Core's `pyproject.toml`, the design has failed.

Today every provider SDK is `pip install`ed into the same Python environment as the dashboard and the agent worker. That is why your Dependencies page carries a red warning about `boto3` / `aiobotocore` / LiveKit plugin constraints. The fix is not better pinning — it is **one process per SDK.**

---

## Layout

```
                      ┌──────────── Caddy (TLS, routing) ────────────┐
                      │                                              │
        static SPA + panels                                   /api/v1 · /mcp · /ws
                      │                                              │
                      ▼                                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ aetosd  — Supervisor                                                         │
│   pull · health-gate · swap · rollback · backup · licence · log aggregation   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  aetos-core            FastAPI · SQLite · REST v1 · MCP · WS      NO SDKs    │
│                                                                              │
│  aetos-agent           livekit-agents + ONE plugin: remote-provider adapter   │
│                        + VAD + turn-detector (in-process, latency-critical)  │
│        │ gRPC over unix socket                                               │
│        ├── stt-deepgram      own image, own venv, own deepgram-sdk pin        │
│        ├── stt-speechmatics  own image                                       │
│        ├── tts-cartesia      own image, own cartesia pin                     │
│        ├── tts-elevenlabs    own image, own elevenlabs pin                   │
│        └── llm-gateway       LiteLLM — OpenAI-compatible HTTP, all LLMs      │
│                                                                              │
│  livekit-server · livekit-sip · livekit-egress   upstream images, pinned     │
│                                                                              │
│  redis (events + hot session data) · qdrant (optional) · tool-* (MCP)        │
└──────────────────────────────────────────────────────────────────────────────┘
```

Eleven-ish containers on a single box, one `compose.yaml`, one Helm chart in the cloud — same images.

---

## Why provider sidecars, and what they cost

Each STT/TTS provider becomes its own container exposing a **stable streaming gRPC contract** (`provider-api v1`). The agent worker carries exactly one plugin — a thin adapter that speaks that contract — and never imports a vendor SDK.

| You get | Because |
|---|---|
| Upgrade `elevenlabs` 2.66 → 2.70 without touching anything else | it lives in `tts-elevenlabs` and nowhere else |
| A provider crash cannot take down the worker | separate process; adapter fails over to the next provider in the chain |
| Blue/green provider upgrades with zero dropped calls | start v2 beside v1, flip the route, drain v1 |
| A/B two TTS vendors on live traffic | routing rule in Core, not a code change |
| Language freedom for providers | anything that speaks the proto |
| The Dependencies page disappears | "pip install into the shared env" is replaced by "pull image tag" |

**What it costs — be honest with yourself:**

| Cost | Size | Mitigation |
|---|---|---|
| Latency | **+3–8 ms** total across STT/TTS hops on a unix socket | irrelevant against a 700 ms TTFB — **but only on unix sockets / host network; Docker bridge NAT adds jitter, don't use it** |
| Memory | ~80–150 MB RSS per Python sidecar; 6 providers ≈ **+0.6–1 GB** | Supervisor starts only providers referenced by an *enabled* agent; lazy start on first use |
| Engineering | you own a gRPC proto and one adapter per provider (~150 lines each) | providers are already streaming APIs; the sidecar is a normaliser, not a reimplementation |

LLM needs none of this — it is already HTTP. Put **LiteLLM** in its own container as the single OpenAI-compatible endpoint and every LLM vendor becomes a config line. You already use LiteLLM for fallback chains; you are just moving it out of process.

**VAD and turn detection stay inside the worker.** They are tiny (silero, `livekit-local-inference`), CPU-bound, and on the tightest latency path. They upgrade with the worker.

---

## The contracts — version these, not the components

| Contract | Transport | Who speaks it |
|---|---|---|
| `core-api v1` | REST `/api/v1`, OpenAPI-generated TS client | frontend, panels, external integrators |
| `provider-api v1` | gRPC, unix socket | agent worker ↔ provider sidecars |
| `events v1` | Redis Streams | core, worker, sinks, tools |
| `panel-api v1` | `window.aetos` ES-module contract | frontend plugins |
| `mcp` | MCP over HTTP | tools ↔ worker, external clients ↔ core |

Every component declares which contract versions it speaks in its manifest. **Core supports contract N and N-1 at all times** — that is what allows any component to be upgraded in any order.

### `provider-api v1` — the proto, in outline

```proto
service Stt {
  rpc Stream(stream AudioFrame) returns (stream SttEvent);
  // SttEvent: interim | final | end_of_turn | error   with ts, confidence, language
}
service Tts {
  rpc Synthesize(stream TextChunk) returns (stream AudioFrame);
  // text streams in as the LLM emits it; audio frames stream out — no buffering
}
service Provider {
  rpc Health(Empty) returns (HealthStatus);           // ready | degraded | down
  rpc Capabilities(Empty) returns (Caps);             // languages, voices, sample rates
  rpc Version(Empty) returns (VersionInfo);           // image, sdk pin, contract versions
}
```
`AudioFrame` = 16-bit PCM, 16 kHz or 24 kHz, 20 ms frames. Match LiveKit's native format so the adapter never resamples.

### `core-api v1` — resource-oriented, boring on purpose

```
/api/v1/agents                 CRUD, publish, pause
/api/v1/agents/{id}/pipeline   {stt: "deepgram@nova-3", llm: "gpt-4o-mini", tts: "cartesia@sonic-3"}
/api/v1/sessions               list · /{id} · /{id}/transcript · /{id}/recording
/api/v1/providers              installed sidecars, health, versions, capabilities
/api/v1/tools                  MCP tool servers
/api/v1/telephony/{trunks,numbers,rules,campaigns}
/api/v1/components             every container: version · contracts · health · available update
/api/v1/system/{backup,restore,update,licence}
/ws/v1/events                  live stream of events v1 for the console
/mcp                           MCP server (already exists)
```
Generate the TypeScript client from the OpenAPI spec in CI. The frontend never hand-writes a fetch.

### `events v1` — Redis Streams

```
session.started · turn.completed · tool.called · session.ended · summary.ready
provider.degraded · component.updated · system.alert
```
Consumer groups per subscriber, so nothing slow can stall a call.

---

## Component manifest

Every container ships `component.yaml`:

```yaml
name: tts-elevenlabs
version: 2.70.1                  # tracks the SDK it wraps
kind: provider/tts
contracts: {provider-api: [1], events: [1]}
image: ghcr.io/aetos/tts-elevenlabs
socket: /run/aetos/tts-elevenlabs.sock
secrets: [ELEVENLABS_API_KEY]    # injected by the secrets broker, never in config
health: grpc:Provider/Health
resources: {memory: 256M, cpu: 0.5}
```

Upstream components (LiveKit server, SIP, Egress, Redis, Qdrant) get the same file wrapping the upstream image — one uniform inventory.

---

## Upgrade flow — any component, any order

```
aetosd upgrade tts-elevenlabs 2.70.1
  1. pull image, verify signature
  2. check contracts against running core (N or N-1)   → refuse if incompatible
  3. start new container beside the old on a temp socket
  4. gRPC Health must return ready within 30 s          → else destroy, report, done
  5. atomically repoint the socket symlink              → new sessions use v2
  6. drain: old container exits after its last stream closes (max 10 min)
  7. keep previous image tag; `aetosd rollback tts-elevenlabs` repoints in <2 s
```

Core is never restarted by any of this. Core's own upgrades follow the same flow, and because Core supports contract N-1, an older worker or provider keeps working across the swap.

**LiveKit SDK** is now three independently pinned things, which is what you asked for:
- `livekit-server` — upstream image tag
- `livekit-agents` — inside `aetos-agent` only; upgrade that one image
- `livekit-client` (browser) — inside the frontend build only

---

## Data

| Store | Holds | Why |
|---|---|---|
| **SQLite** (Core volume; Postgres in cloud, same SQL) | agents, pipelines, telephony config, component inventory, entitlements, audit | transactional, migratable, backs up as one file — Redis-as-primary-DB is already producing restore bugs in your changelog |
| **Redis** | events v1, live session state, hot call data with TTL | what it is good at |
| **Object storage** (local / S3 / GCS) | recordings, transcripts, cold session archive | as today |
| **Qdrant** | vectors — optional component, not installed unless an agent uses the KB | saves ~500 MB on installs that don't |

---

## Security boundaries you get for free from this split

- Core never holds a vendor SDK, so a vulnerable SDK can never escalate into the console.
- Each sidecar sees exactly one API key, injected by the secrets broker; compromise one, you get one.
- Sidecars have no inbound network — unix socket only. Only `llm-gateway` and tools need egress, and only to an allowlist.
- Every image signed; `aetosd` refuses unsigned in the official channel.

---

## Migration from the monolith — in the order that de-risks fastest

| Step | Change | Risk | Why here |
|---|---|---|---|
| 1 | Frontend out (done), Caddy in | low | independent of everything else |
| 2 | **LiteLLM into its own container**; worker points at it over HTTP | low | LLM is already HTTP — a config change |
| 3 | Write `provider-api v1` proto + the remote adapter plugin | medium | the one real engineering task |
| 4 | Move **TTS** to sidecars first (text in, audio out — simplest stream) | medium | proves latency numbers on real calls |
| 5 | Move **STT** to sidecars | medium | same pattern |
| 6 | **Delete every vendor SDK from Core's `pyproject.toml`** | — | the moment the design is actually true |
| 7 | `aetosd` supervisor: manifest, health-gate, socket swap, rollback | high | build it once the contracts have survived steps 4–5 |
| 8 | SQLite migration for config | medium | can slide earlier if restore bugs keep coming |

After step 6, upgrading a TTS SDK is `aetosd upgrade tts-cartesia`, and Core does not know it happened.

---

## What I would not do

- **Do not** run all providers in one "provider gateway" container. That is the shared dependency tree again with an extra hop.
- **Do not** use Docker bridge networking for the audio path. Unix sockets or host network only — bridge NAT adds variable latency you will see in TTFB percentiles.
- **Do not** put VAD or turn detection behind the socket. They are the tightest loop you have.
- **Do not** version components without versioning contracts. Component versions tell you nothing about compatibility; contract versions tell you everything.
- **Do not** let Core restart on any other component's upgrade. If it does, you have not achieved the requirement, whatever the diagram says.
