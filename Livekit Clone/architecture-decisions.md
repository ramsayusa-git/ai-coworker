# Aetos Voice Platform — architecture decisions
**Question:** Caddy instead of nginx? Next.js/Vite instead of Bootstrap+vanilla? Home-Assistant-style plugin/add-on architecture? Self-host + cloud with a license server?
**Date:** 14 Sep 2026

---

## 1. nginx → Caddy

**Yes. Do it.** For a product that ships to customer servers, Caddy is the better default.

### Pros
- **Automatic HTTPS.** ACME is built in. Your installer stops shipping certbot, cron renewals, and the "my cert expired" support ticket.
- **On-demand TLS** — the killer feature for a white-label product. A customer points `voice.theircompany.com` at their box and Caddy issues the cert on first request, no redeploy, no config edit. With nginx you are writing a cert-provisioning service yourself.
- **One static binary.** No modules to compile, no distro package drift. Drops straight into an installer or a container.
- **HTTP/3 + compression on by default**, sane TLS defaults you don't have to maintain.
- **Caddyfile is ~10 lines** vs. ~120 for the equivalent nginx config. Fewer places for a customer to break it.

### Cons — the work you actually have to redo
| Current nginx feature | Caddy equivalent | Effort |
|---|---|---|
| Branded 502 "Restarting…" page | `handle_errors { rewrite * /502.html; file_server }` | trivial |
| Upload size limit (you built backup chunking to dodge it) | `request_body { max_size 2GB }` — you can raise it and **delete the chunking code** | small win |
| fail2ban jails parsing access logs | Caddy logs JSON — every `failregex` must be rewritten | **1–2 days, do not underestimate** |
| Real client IP behind CDN/LB | `trusted_proxies` | trivial |
| Rate limiting / connection caps | **not in core** — needs `caddy-ratelimit` via `xcaddy`, i.e. a custom build in your release pipeline | medium |

Other honest downsides: ~2–3× nginx's idle RSS (still under 50 MB, irrelevant next to your agent worker); a much smaller pool of StackOverflow answers when a customer's sysadmin gets stuck; and any third-party module forces you to maintain your own `xcaddy` build.

**Verdict:** switch. The on-demand TLS story alone pays for the fail2ban rewrite. Nothing about LiveKit, WebSockets or SIP cares which proxy sits in front — SIP and RTP don't traverse it at all.

---

## 2. Front end — Next.js? Vite? Something else?

First, a correction: **Next.js and Vite are not a pair.** Next.js is a React framework with its own bundler; Vite is a build tool you put under plain React/Vue/Svelte. You pick one.

### Next.js — don't, for the self-hosted product
- SSR means a **Node process on every customer box**, supervised, updated, and memory-capped alongside Python. A second runtime on an appliance that already runs 7 services.
- ~150–250 MB RSS for a console that is login-gated and has zero SEO requirement. You get nothing back for it.
- If you use `output: 'export'` to avoid the Node process, you have a static SPA — at which point Next.js is just a heavier Vite.
- Worth it only if you want marketing site + docs + console in one repo. That is a different product.

### Vite + React/Svelte, built to static files — the sane default
- Builds to plain `.js`/`.css`. Caddy serves them. FastAPI becomes a pure JSON API. Clean seam.
- **Ship the build artefact, never build on the customer's box.** Release tarball contains `dist/`. No Node on the appliance at all.
- Real component reuse — you have ~20 screens with the same tables, stat tiles and status pills copy-pasted today.
- Fast HMR; your dev loop stops being "reload a 1.6 MB Jinja template".

### What you lose vs. today
- Hackability: today a customer (or you, at 2am) can edit a Jinja template on the server and reload. After this, changes require a build.
- Auth gets slightly harder — cookie + CSRF still works, but you must handle 401 → redirect in the client, and lock CORS down.
- A build step now sits in your release pipeline and must be reproducible.

### The constraint that actually decides it
If you want the Home-Assistant plugin model, **third parties must be able to add UI panels at runtime**. A compiled React bundle cannot accept new screens after it is built. Home Assistant solved this by making the frontend **Lit + Web Components**: custom cards are ES modules dropped in a folder, loaded at runtime, registering a custom element against a documented contract.

So:

> **Shell in Vite + React (or Lit). Plugin panels as ES modules that register a custom element.**
> The shell exposes `window.aetos.registerPanel({id, icon, element})` and an `api` object; plugins are `<script type="module">` loaded from `/panels/<plugin>/panel.js`. React hosts custom elements fine.

Lock that contract down before you write the first plugin, and version it.

---

## 3. Home-Assistant-style plugin / add-on architecture

### What HA actually does — three distinct mechanisms, don't conflate them
| HA concept | What it is | Update granularity |
|---|---|---|
| **Integrations** | Python packages *in-process* (core, or `custom_components/`) | with core (custom ones: individually, via HACS) |
| **Add-ons** | **Docker containers** described by `config.yaml`, installed from git "add-on repositories" | fully independent |
| **Lovelace cards** | ES modules loaded at runtime, register a custom element | fully independent |
| **HAOS** | immutable OS, A/B partition update via RAUC | independent |

Your equivalents map cleanly:
- **Add-ons (containers):** Qdrant, Redis, n8n, MQTT broker, a local Whisper/Piper engine, a CRM connector, a reporting engine.
- **Integrations (Python):** provider plugins — Deepgram, ElevenLabs, Cartesia, Twilio, Telnyx. You already have ~25 of these as `livekit-plugins-*`.
- **Panels:** the ES-module contract above.
- **OS:** you already build Aetos One HA OS images — same A/B idea applies.

### Pros
- **Smaller base install.** A customer who never touches the knowledge base doesn't run Qdrant. Your own dashboard already fights memory caps on Qdrant/Redis/Egress — this directly fixes that.
- **Independent release cadence.** A Deepgram SDK fix ships without a core release. Today a one-line provider fix forces a full v1.39.x.
- **Blast radius.** A broken community add-on doesn't take the console down.
- **Ecosystem flywheel.** HACS is a large part of why Home Assistant won. Third parties extend you without you merging PRs.
- **Clean licensing seam.** Premium add-ons are simply repository entries the license server will or won't serve.
- **Per-component rollback.**

### Cons — and these are serious
1. **You are building a package manager.** Manifest format, dependency resolution, signing, trust, install/upgrade/rollback, a store UI, a CI matrix. HA has a full-time team on Supervisor and it is still their single largest source of breakage. Budget months, not weeks.
2. **The Python dependency trap — this is the one that will bite you.** In-process plugins share one dependency tree. Two provider plugins wanting different `httpx`, `grpcio` or `protobuf` versions break the whole worker. Your own Dependencies page already warns about exactly this (`boto3`, `aiobotocore`, LiveKit plugin constraints). HA avoids it by **pinning everything centrally** — which quietly cancels "update each one individually".
   **Practical answer:** don't promise per-Python-package independence.
   - Provider plugins → in-process, **central lock file, updated as a set** (a "provider bundle" release).
   - Heavy services → **containers**, genuinely independent.
   - UI panels → **ES modules**, genuinely independent.
3. **Latency.** Voice lives inside an ~800 ms TTFB budget. Every out-of-process hop costs milliseconds. Home Assistant's add-ons are not in a real-time path; yours would be. **Keep the media and agent hot path monolithic.** Plugins belong at the edges — tools, connectors, panels, storage, reporting — never between STT and TTS.
4. **Version matrix explosion.** N plugins × M core versions. Every manifest needs `min_core`/`max_core`, and you need a real deprecation policy from day one, not after the first customer breaks.
5. **Security.** Arbitrary Python and Docker containers on a box holding carrier credentials, recordings and API keys. You need signed manifests, an official-repo review process, and a hard, visible "community add-ons are unsupported" line. HA's add-ons run with broad host privileges and it has hurt them.
6. **Docker becomes mandatory.** HA add-ons only work on HAOS/Supervised, not bare container installs — you will inherit the same split, and you already have this problem (pip vs. container). Choose deliberately: ship an appliance image, or support "container mode" with add-ons disabled and say so plainly.
7. **Support load.** Every ticket becomes "which of your 14 add-ons did this". HA's stock answer is "reproduce without custom components". You will need the same policy and a one-click "disable all community plugins" switch.

### Recommended shape
```
Aetos One OS (immutable, A/B update)
└── Supervisor            ← add-on lifecycle, updates, health, license check
    ├── Core (FastAPI + Uvicorn)         ← console, API, orchestration   [monolith]
    ├── Agent worker (livekit-agents)    ← real-time hot path            [monolith]
    │     └── provider plugins           ← in-process, ONE lock file, bundle release
    ├── LiveKit / SIP / Egress           ← containers, independent
    └── Add-ons (containers)             ← Qdrant, Redis, n8n, MQTT, connectors
Frontend shell (Vite, static)
    └── panels (ES modules)              ← runtime-loaded, independent
```
Three update channels, each honest about what it can actually do independently:
`OS` · `core + provider bundle` · `add-ons and panels`.

---

## 4. Self-hosted + cloud, with a cloud license server

You already run this model (Community Edition, `/api/license/activate`, `/api/license/reverify`). Scaling it up:

### Pros
- Recurring revenue; feature gating without forking the codebase.
- Metering (minutes, agents, seats) for usage-based pricing.
- Telemetry that makes support possible on machines you cannot SSH into.
- The add-on store is a natural entitlement boundary — premium add-ons simply aren't served to unlicensed installs.
- Self-hosting is a genuine differentiator: call recordings and transcripts are voice biometrics / PII under GDPR, India's DPDP, and Illinois BIPA. "Your audio never leaves your building" closes deals that SaaS competitors cannot.

### Cons and the traps
1. **Never let a license check stop a live call.** Sign licenses as JWTs with an embedded public key, verify offline, and run a **14–30 day grace period** on failed re-verification. Degrade to read-only or warn — never hang up a call. Your customers include a water plant; an internet blip must not silence the phone line.
2. **Offline / air-gapped installs need a file-based activation path.** Signed `.lic` file, machine fingerprint, manual upload. Plan it now; retrofitting is painful.
3. **The license server is a single point of failure** for your whole install base, and a DDoS and legal target. Host it separately from your product cloud, cache aggressively, version its API, and keep the old version alive for two years.
4. **Self-hosted Python cannot be protected.** The source is on the customer's disk. Accept it. Enforcement is for honest customers; put the genuinely valuable things **server-side** — hosted STT/TTS proxying, model routing, cloud backup, the add-on store, fleet management — so cracking the client gets you a crippled product rather than a free one.
5. **Don't fork for cloud.** One codebase, tenancy as configuration. The moment you maintain a "cloud build" and an "appliance build" separately, features diverge and every bug is fixed twice.
6. **The update channel is also a kill switch.** Legally and reputationally, be extremely careful about ever using it as one.
7. **Fingerprinting churn.** Machine IDs change on VM migration, disk replacement and container rebuilds. Allow N re-activations per period and self-service deactivation, or you will spend your week on licence resets.

### Cloud side, concretely
```
cloud.aetos (multi-tenant)         licence.aetos (isolated)
  ├── tenant console                 ├── issue / renew / revoke signed JWT licences
  ├── shared LiveKit + agents        ├── entitlements → add-on store index
  ├── per-tenant Qdrant namespace    ├── usage ingest (minutes, agents, seats)
  └── fleet view of self-hosted      └── offline activation file generator
      installs that opt in
```

---

## Bottom line

| Decision | Call |
|---|---|
| nginx → Caddy | **Yes.** Budget 1–2 days for the fail2ban log-format rewrite. |
| Next.js | **No.** A Node runtime on every appliance buys you nothing here. |
| Vite + static SPA shell | **Yes**, shipped prebuilt, never built on the customer's box. |
| Plugin UI | **Web Components / ES modules**, contract versioned from day one. |
| HA-style add-ons | **Yes for containers and panels. No for in-process Python** — those ship as one locked bundle. |
| Real-time path | **Stays monolithic.** No plugin hop between STT and TTS. |
| Licence server | **Yes**, offline-verifiable JWT + grace period. Gate value server-side, not with `if licensed:`. |

The single biggest risk in this plan is not Caddy or React. It is promising "everything updates individually" and then discovering that your in-process Python provider plugins share one dependency tree. Decide that boundary now and document it, or the plugin system will become the thing you spend 2027 fixing.
