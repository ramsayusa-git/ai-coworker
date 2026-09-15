# Aetos Voice Platform

Core never imports a vendor SDK. Every STT/TTS/LLM engine is a sidecar behind `provider-api v1`; every component upgrades and rolls back on its own.

```
contracts/    provider-api v1 (proto) · events v1 (Redis Streams)
core/         FastAPI console API  /api/v1 · /api/docs · /healthz · /contracts       — no SDKs
agent/        livekit-agents worker + ONE plugin (remote_provider) + VAD/turn detector
providers/    one folder = one sidecar = one venv/image:  tts-mock stt-mock tts-piper stt-whisper llm-gateway
aetosd/       supervisor: inventory · health · start/stop · health-gated upgrade · rollback · HTTP :8110
frontend/     static SPA (Vite-free, no build) — served by Caddy or by Core in dev
deploy/       compose.yaml · Caddyfile · livekit.yaml
```

## Dev, no Docker
```
scripts/gen-proto.sh            # once, after editing the proto (needs grpcio-tools)
scripts/dev-up.sh               # aetosd + tts-mock + stt-mock + core, each in its own venv
open http://localhost:8100/api/docs
AETOS_FRONTEND=$PWD/frontend    # set before starting core to have it serve the SPA at /
```
Upgrade a provider without touching anything else:
```
# bump version in providers/tts-piper/component.yaml, then
python -m aetosd upgrade tts-piper      # new venv, starts beside old, health gate, socket swap, drain
python -m aetosd rollback tts-piper     # back in ~2 s
```

## Prod
`cd deploy && docker compose up -d` — one container per component, sockets on a shared volume, Caddy on-demand TLS.
