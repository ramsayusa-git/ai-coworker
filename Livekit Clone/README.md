# Lattice Net

Modular voice-AI infrastructure. Runs in our cloud, your private cloud, or
on-premises — and rebrands as your own product.

Commercial licence. No Apache, MIT or other open-source grant applies.

---

## Folder map

```
lattice-web/              Marketing site + operator console (Vue 3 + TS + Vite)
aetos-voice/              Backend monorepo
  core/                   Core API — FastAPI, auth, tenancy, licensing  :8100
  aetosd/                 Supervisor — provider venvs and sockets       :8110
  providers/              STT / TTS / LLM sidecars behind provider-api v1
  agent/                  livekit-agents worker + remote-provider adapter
  contracts/              provider.proto v1, event schemas
  deploy/                 compose.yaml, Caddyfile
docs/screenshots/         Console, light and dark
_archive/old-scaffold/    Superseded stub views, kept for reference only
frontend/                 Original "Aetos Voice Console" static app (superseded)
"livekit dump"/           Source-app analysis material
```

## Documents

| File | What it is |
| --- | --- |
| `lattice-net-build-plan.md` | **The contract.** Data model, auth flow, tenant resolution, designer graph schema, licence format, build order, risks. |
| `lattice-net-operations.md` | **How to run it.** Install, migrate, create tenants, white-label, licensing, BYO models, backup, upgrade, known gaps. |
| `target-architecture.md` | Core imports no vendor SDK; providers as gRPC sidecars. |
| `latency-architecture.md` | Turn budget ~700 → ~450 ms and the levers that get you there. |
| `self-hosted-gpu-inference.md` | Running STT/LLM/TTS on your own GPUs. |
| `plugin-architecture.md` | Earlier HA-style plugin design (superseded by target-architecture). |
| `architecture-decisions.md` | Caddy vs nginx, Vite vs Next, licensing approach. |
| `comparison-current-vs-proposed.md` | Monolith vs the modular proposal. |
| `vaai-tech-stack-analysis.md` | Teardown of the original vaai.aetosiot.com app. |

## Running it

```bash
# Backend — note: edit the repo, then SYNC, or nothing changes
bash aetos-voice/core/deploy.sh          # rsync source -> aetosd snapshot, restart
curl -s localhost:8100/healthz

# Console
cd lattice-web && npm run dev            # http://localhost:5173

# Security tests — run after ANY auth, tenancy or routing change
bash aetos-voice/core/test-isolation.sh  # 19 assertions, all must pass
```

**The trap:** aetosd installs Core as an editable install pointing at
`~/.aetos/venvs/aetos-core@2.0.0/src/aetos_core`, a per-version snapshot — not
this repo. Editing `aetos-voice/core/` changes nothing that is running until you
run `deploy.sh`.

## Current state

Owner account `raamaak@outlook.com` on tenant `default`.

Done: multi-tenancy with enforced isolation, JWT auth with rotating refresh,
roles, API keys, per-tenant branding, offline Ed25519 licensing, and a console
covering agents, the visual designer, sessions, analytics, telephony,
components and settings. `vue-tsc` clean, production build passes.

Not done: brand asset upload (URL field only), agent version publish/rollback/diff,
designer branch/transfer/hangup/webhook nodes at runtime, session audio playback,
frontend tests. Pricing figures on the site are placeholders.

Full list at the end of `lattice-net-operations.md`.
