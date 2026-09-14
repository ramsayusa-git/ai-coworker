# Current LiveKit dashboard vs. proposed architecture
Date: 14 Sep 2026

---

## Side by side

| | **Current (vaai v1.39, monolith)** | **Proposed (sidecars + contracts)** |
|---|---|---|
| Processes | 7 services; dashboard + agent worker share one Python env | ~11 containers; every SDK in its own process |
| Where vendor SDKs live | one shared `pyproject.toml` | one container each; Core has none |
| Upgrade a TTS SDK | `pip install` into shared env, pray, restart worker; may restart dashboard | `aetosd upgrade tts-x`; Core untouched; rollback in 2 s |
| Blast radius of a bad SDK | whole worker, possibly the console | that one provider; adapter fails over |
| Front end | Jinja server-rendered, Bootstrap + HTMX, 1.6 MB settings page | Vite static SPA, typed client generated from OpenAPI |
| API | ~166 ad-hoc `/api/*` routes, no version prefix, mixed JSON + HTML partials | `/api/v1` resource API, OpenAPI, N/N-1 contract support |
| Config store | Redis only | SQLite (Postgres in cloud) + Redis for hot/events |
| Reverse proxy | nginx, manual certs, custom 502 page, fail2ban on nginx logs | Caddy, auto/on-demand TLS |
| LLM routing | LiteLLM in-process | LiteLLM as its own container (OpenAI-compatible endpoint) |
| Events | none — pages poll or open SSE per feature | Redis Streams `events v1`, consumer groups |
| Extensibility | pip packages + MCP tools | MCP tools + provider sidecars + ES-module panels |
| Idle RAM (est.) | ~2.5–3 GB | ~3.2–4 GB (+0.6–1 GB for sidecars) |
| TTFB overhead | 0 (in-process) | +3–8 ms on unix sockets |
| Repo/deploy shape | one repo, one release, one version number | one repo, many images, many version numbers, one contract version |
| Time to ship a new provider | ~1 day (install plugin, wire config) | ~2–3 days first time (proto adapter + image), ~1 day after |
| Debugging a bad call | one log, one process | one trace ID across 3–4 containers — needs correlation from day one |
| Ops skill needed | Python + systemd | Python + Docker + gRPC |

---

## Current monolith — honest pros

1. **Simplicity.** One codebase, one release, one log file, one version number. When a call goes wrong you `grep` one log.
2. **Lowest latency possible.** In-process providers add zero hops. This is a real advantage; every millisecond of TTFB is audible.
3. **Lowest memory.** No per-provider Python interpreter. Matters on the small VPSs your customers actually buy.
4. **Fastest feature velocity for one team.** No contract to version, no proto to regenerate, no image to publish — edit, restart, done.
5. **Hackable on the box.** A Jinja template can be fixed on a customer server at 2 am with `nano`.
6. **Already works.** 1.39 releases of hard-won behaviour — transfer edge cases, Redis race fixes, restart handling. None of that has to be rewritten to keep the monolith.

## Current monolith — cons

1. **Shared dependency tree.** `boto3` / `aiobotocore` / 20 LiveKit plugins pinned together. Your own Dependencies page warns about it in red. One SDK bump can break every provider.
2. **Every provider upgrade is a worker restart, often a dashboard restart.** "Core is never touched" is impossible by construction.
3. **No blast-radius control.** A provider SDK crash or memory leak takes the agent worker with it — and all live calls.
4. **Redis as the only database.** No transactions, no schema, backup = export. Your changelog already lists restore bugs, race conditions, orphaned keys, and unbounded growth from this.
5. **1.6 MB settings page.** Every settings tab, plus the full changelog, shipped on every load. Inline JS per template; no component reuse across 20 screens.
6. **166 unversioned API routes** mixing JSON, HTMX HTML partials and SSE. No OpenAPI, no generated client, no way to change a route without breaking something you can't see.
7. **Not responsive, dark-only, `zoom: 0.9` on `<body>`.** Fine for a laptop, unusable on a tablet at a plant.
8. **Manual TLS + nginx-specific hacks** (chunked backup upload exists only to dodge nginx's body limit).
9. **Scales by "bigger server" only.** Can't run the agent worker on a second box without duplicating the whole install.

---

## Proposed — pros

1. **Requirement met by construction.** Core has no vendor SDK, so no vendor upgrade can touch it. Not a policy — a property of the layout.
2. **Independent upgrade and rollback per component**, health-gated, zero dropped calls (blue/green socket swap).
3. **Failure isolation.** Provider dies → adapter fails over to the next in the chain; worker keeps talking.
4. **A/B and vendor switching become routing rules**, not code changes. Compare Cartesia vs ElevenLabs on live traffic this afternoon.
5. **Contracts, not components, are versioned.** N/N-1 support means any component upgrades in any order, and you can make breaking changes with a deprecation window instead of a big-bang release.
6. **Real API.** Versioned, OpenAPI-described, typed client generated in CI. Third parties can integrate without reading Jinja.
7. **Scales out.** Worker + sidecars can move to a second box; Core stays where it is. Same images run under Helm in the cloud tier.
8. **Transactional config** with migrations and a one-file backup.
9. **Security boundaries for free.** Each sidecar sees one API key; sidecars have no inbound network; Core can't be reached through a vulnerable SDK.
10. **Dependencies page disappears.** "Which pip version is installed" becomes "which image tag is running".

## Proposed — cons (do not skip this section)

1. **You are building a small platform, not an app.** A gRPC proto, one adapter per provider, a supervisor with health gating and socket swaps, a contract-compatibility checker. Realistically 2–3 months of platform work before the first feature that a customer sees.
2. **+0.6–1 GB RAM.** On a 4 GB VPS that is the difference between fitting and not. Lazy-starting providers helps; it does not make it free.
3. **+3–8 ms TTFB.** Small, but non-zero, and only that small on unix sockets / host network. Docker bridge networking would make it worse and jittery. One misconfigured install and the numbers are bad.
4. **Debugging gets harder.** A bad call now spans worker → STT sidecar → LLM gateway → TTS sidecar. Without a trace ID propagated across every hop from day one, you will lose hours. OpenTelemetry becomes mandatory, not optional.
5. **More things to version and publish.** ~11 images, each with a tag, each signed, each with a manifest. Your release pipeline becomes real CI, not a `git pull` on the box.
6. **Contract discipline is a tax forever.** Every change to `provider-api` or `core-api` needs N/N-1 compatibility and a deprecation window. Skip it once and the whole "upgrade in any order" promise is gone.
7. **Rewrite cost.** The frontend is a rewrite (done, in progress). The provider layer is a rewrite. Core's API surface is a reshape. The 1.39 releases of edge-case fixes in the worker survive; much else does not.
8. **Higher ops bar.** Customers' sysadmins need to be comfortable with Docker. Bare-metal-Python installs go away.
9. **More moving parts to secure and patch.** Eleven images = eleven base-image CVE feeds instead of one.

---

## When each one is the right answer

**Stay on the monolith if:** one small team, customers on small VPSs, latency is the only metric that matters, and "restart the worker to upgrade a provider" is an acceptable ops story. It is a legitimate choice — many profitable products ship this way.

**Move to the proposed architecture if:** you sell to customers who cannot tolerate a worker restart, you need to swap or A/B vendors without a release, you plan a cloud multi-tenant tier on the same images, or the shared-dependency breakage has already cost you a customer. Your stated requirements — *every component independently upgradable, core never touched* — cannot be met by the monolith, so if those requirements are real, this is the only shape that satisfies them.

**The middle path** (do this if unsure): steps 1–5 of the migration only — Caddy, LiteLLM out, proto + adapter, TTS sidecars, STT sidecars. Skip the supervisor; use plain `docker compose` and manual tags. You get the isolation and independent upgrades for roughly a third of the platform work, and you can measure the real latency and memory cost on real calls before deciding whether `aetosd` is worth building.
