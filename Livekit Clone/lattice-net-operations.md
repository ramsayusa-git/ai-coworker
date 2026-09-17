# Lattice Net — Deployment, White-Label and Operations

Companion to `lattice-net-build-plan.md`. That document is the contract; this one
is how you run the thing.

**As built, 15 Sep 2026.** Core 2.0.0 on `:8100`, console on `:5173`,
aetosd supervisor on `:8110`.

---

## 1. What is running right now

| Piece | Where | Notes |
| --- | --- | --- |
| Core API | `aetos-voice/core/` → `:8100` | FastAPI, SQLite at `~/.aetos/core.db` |
| Supervisor | `aetos-voice/aetosd/` → `:8110` | owns provider venvs and sockets |
| Console | `lattice-web/` → `:5173` | Vue 3 + Vite, also serves the marketing site at `/` |
| Providers | `aetos-voice/providers/` | tts-mock, stt-mock, tts-piper, stt-whisper, llm-gateway |

Owner account: **raamaak@outlook.com** on tenant `default`.

### The deploy gotcha that will bite you

aetosd installs Core as an **editable install pointing at a per-version
snapshot**, not at the repo:

```
~/.aetos/venvs/aetos-core@2.0.0/src/aetos_core   <- what actually runs
aetos-voice/core/aetos_core                      <- what you edit
```

Editing the repo changes nothing until you sync. Use:

```bash
bash aetos-voice/core/deploy.sh      # rsync source -> snapshot, restart, list routes
```

---

## 2. Installing on a new box

### 2.1 Prerequisites

Python 3.11+, Node 20+, Redis, and (optionally) an NVIDIA GPU with recent
drivers if you intend to run models locally.

### 2.2 Environment

```bash
export LATTICE_JWT_SECRET="$(openssl rand -base64 48)"   # 32+ chars, required
export AETOS_STATE=/var/lib/aetos                        # state dir
export AETOS_DB="postgresql://…"                         # omit for SQLite
export AETOS_REDIS="redis://127.0.0.1:6379/0"
export AETOS_CORS="https://console.example.com"          # not "*" in production
```

Core **refuses to start** if `LATTICE_JWT_SECRET` is set and shorter than 32
characters. If it is unset, a secret is generated into `$AETOS_STATE/jwt.secret`
(mode 0600) — fine for a single box, wrong for a cluster, because every node
would sign with a different key. Set it explicitly when you have more than one.

### 2.3 Database

```bash
cd aetos-voice/core
PYTHONPATH=. alembic upgrade head
```

Always dry-run against a copy first. The migration is destructive in one
specific way: it rebuilds `agents`, `trunks` and `numbers` to drop their old
global UNIQUE constraints.

```bash
cp $AETOS_STATE/core.db /tmp/check.db
AETOS_STATE=/tmp PYTHONPATH=. alembic upgrade head
```

### 2.4 First account

```bash
python -m aetos_core seed-owner --email you@example.com --tenant default
```

Prints a one-time password and sets `must_change_password`. There is no default
password anywhere in the codebase, by design.

### 2.5 Console

```bash
cd lattice-web
npm ci
VITE_API_BASE=https://api.example.com/api/v1 npm run build
# serve dist/ with Caddy or nginx
```

---

## 3. Reverse proxy and tenant subdomains

Tenants are resolved from the first Host label (`acme.example.com` → tenant
`acme`), so the proxy must pass Host through unchanged.

```caddy
*.example.com {
    encode gzip
    handle /api/* {
        reverse_proxy 127.0.0.1:8100 {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
        }
    }
    handle {
        root * /srv/lattice-web/dist
        try_files {path} /index.html
        file_server
    }
}
```

Vite's dev server rejects unknown hosts. To develop against a domain, add it to
`server.allowedHosts` in `vite.config.ts` — already configured for
`latticenet.aetosiot.com` and `.aetosiot.com`.

---

## 4. Creating a tenant (the reseller flow)

Only **platform-tenant owners** may create tenants.

```bash
curl -X POST https://api.example.com/api/v1/tenants \
  -H "Authorization: Bearer $PLATFORM_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"slug":"acme","name":"Acme Pty Ltd","owner_email":"ops@acme.com"}'
```

Returns a one-time password for the new owner when the user did not already
exist. The tenant gets its own brand profile, its own agents, sessions,
telephony and audit log. Cross-tenant reads return **404**, never 403 — a 403
would confirm the row exists.

Tenant count is capped by the licence (`tenants_max`); exceeding it returns 402.

---

## 5. White-labelling a tenant

Everything below is configuration. There is no fork, so upgrades do not need
re-applying.

| Field | Effect |
| --- | --- |
| `product_name` | Console title, page `<title>`, login heading, sidebar |
| `logo_url`, `logo_dark_url` | Sidebar and login mark |
| `favicon_url` | Browser tab, swapped at runtime |
| `login_art_url` | Login screen artwork |
| `colors` | CSS custom properties on `:root` — primary, accent, success, warning, danger |
| `typography`, `radius` | Font stack and corner radii |
| `mail_from_name/email`, `mail_footer` | Transactional mail identity |
| `support_url`, `docs_url`, `privacy_url`, `terms_url` | Footer and help links |
| `custom_css` | Injected last, overrides everything, capped at 100 KB |

Edit it in **Settings → Branding** (previews live before saving), or:

```bash
curl -X PUT https://acme.example.com/api/v1/branding \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"product_name":"Acme Voice","colors":{"primary":"#0f766e"}}'
```

The login screen reads `GET /api/v1/branding/public?host=…` **unauthenticated**,
so a partner's customers never see Lattice Net branding at any point — including
before sign-in. That endpoint deliberately omits mail fields.

---

## 6. Licensing

Ed25519-signed, verified locally. No network call exists in any code path.

```json
{
  "payload": {
    "licensee": "Acme Pty Ltd",
    "tier": "white-label",
    "tenants_max": 25,
    "concurrent_sessions_max": 200,
    "features": ["white_label", "multi_tenant", "designer", "air_gapped"],
    "issued_at": "2026-09-15T00:00:00Z",
    "expires_at": "2027-09-15T00:00:00Z",
    "grace_days": 30
  },
  "signature": "<base64 ed25519 over the canonical payload>"
}
```

Canonical form is `json.dumps(payload, sort_keys=True, separators=(",", ":"))`.

```bash
python -m aetos_core install-licence --file licence.json
```

State machine: **valid → grace → read-only**. In read-only, existing calls are
never cut; only writes are refused (402). Unlicensed installs run with trial
limits (1 tenant, 2 concurrent sessions).

### 6.1 Issuing licences (vendor side)

`aetos-voice/tools/licence-issuer.py` is the only place the private half of the
signing key exists. It never ships to a customer.

```bash
python tools/licence-issuer.py keygen          # once, ever — then back it up offline
python tools/licence-issuer.py pubkey          # the value every runtime needs

python tools/licence-issuer.py issue \
  --licensee "Acme Pty Ltd" \
  --owner-email owner@acme.example \
  --tier enterprise \
  --tenants-max -1 --sessions-max -1 \
  --out acme.json
```

Keys live at `~/.aetos/issuer/signing.key` (0600) and `~/.aetos/issuer/public.key`.
Rotating the signing key invalidates every licence already issued, which is why
`keygen` refuses to overwrite without `--force`.

Tiers: `starter`, `business`, `enterprise`. `--years N` for a fixed term, omit
it for perpetual. `-1` on either cap means unlimited.

### 6.2 Telling a runtime which key to trust

Resolution order, most specific first:

1. `LATTICE_LICENCE_PUBKEY` — env, for containers and CI
2. `~/.aetos/licence.pub` — state file
3. the compiled-in production key

The state file matters because Core gets started several ways (aetosd, bare
uvicorn, systemd). An env var set in one launcher is not set in the others, and
a licence that verifies under one but not another is a miserable bug to chase.

```bash
python tools/licence-issuer.py pubkey > ~/.aetos/licence.pub
```

---

## 7. Running your own models

Providers are sidecars behind `provider-api v1` over unix sockets. Each is
versioned and upgraded independently; Core imports no vendor SDK.

| Kind | Local options | Cloud options |
| --- | --- | --- |
| STT | faster-whisper, NVIDIA Parakeet, Vosk | Deepgram, AssemblyAI, Azure |
| LLM | vLLM (Qwen, Llama, Mistral), Ollama | OpenAI, Anthropic, Google, Groq via LiteLLM |
| TTS | Piper (CPU), Kokoro, XTTS | ElevenLabs, Cartesia, Azure |

A single RTX 4090 sustains roughly 6–10 fully-local concurrent sessions.
Assign per agent in the designer; each agent picks its own STT, LLM and TTS.

Manage them in **Components** (platform tenant only — they are host-wide
infrastructure, so one tenant must not be able to restart another's providers).

---

## 8. Backup and restore

```bash
# SQLite — consistent snapshot without stopping Core
sqlite3 $AETOS_STATE/core.db ".backup '/backup/core-$(date +%F).db'"

# Also back up, they are not reproducible:
#   $AETOS_STATE/jwt.secret   — losing it signs every user out
#   the installed licence blob
#   uploaded brand assets
```

Restore is a file copy plus `alembic upgrade head`.

---

## 9. Upgrading

1. Back up the database and `jwt.secret`.
2. Dry-run migrations against a copy.
3. `bash aetos-voice/core/deploy.sh`.
4. Check `/healthz`, then `/api/v1/system/info`.
5. Rebuild the console if it changed.

Core supports **N and N-1** provider contracts, so providers do not have to move
in lockstep. Roll a provider back from Components; roll Core back with
`alembic downgrade` plus the previous snapshot.

---

## 10. Verification checklist

Four suites live in `aetos-voice/core/`. All 135 assertions currently pass.

| Suite | Asserts | Count |
| --- | --- | --- |
| `test-isolation.sh` | auth gates, tenant isolation, cross-tenant 404, platform-only surfaces | 19 |
| `test-versions.sh` | designer compile/publish/rollback/diff, brand asset upload safety | 27 |
| `test-console.sh` | every endpoint each console screen calls, as a signed-in owner | 26 |
| `test-sections.sh` | rooms, tools, knowledge base, reports, notes, recordings, settings groups | 63 |

```bash
cd aetos-voice/core
for t in test-isolation.sh test-versions.sh test-console.sh test-sections.sh; do bash $t; done
```

Two rules these encode, worth keeping:

- **Suites own their fixtures.** They seed `owner@default-demo.com` and
  `owner@acme-demo.com` rather than borrowing a real account. Borrowing bit us
  once: rotating the real owner's password broke the security tests, and
  promoting that account to platform owner silently *inverted* the
  "platform surfaces are refused" assertions — they passed for the wrong reason.
- **Assert relationships, not literals.** Version numbers climb across runs and
  demo data changes, so the checks are "n then n+1" and "non-empty vs exactly
  zero", never a pinned count. A suite that fails on correct behaviour trains
  you to ignore it.

`test-sections.sh` restarts `tts-mock` as its last platform check. Running the
suites back to back can catch that component mid-restart and report a transient
502 — re-run rather than chasing it.

Console: `npx vue-tsc --noEmit` must be clean (it is), and `npx vite build`
must succeed (it does).

---

## 11. Known gaps

Honest list of what is **not** finished. Anything absent from this list is
built and covered by a test.

**Not built at all**

- **Outbound dialer.** No queue, pacing, retry ladder or answering-machine
  detection. The Campaigns screen says so on its face and does the part that is
  real — outbound readiness and routing checks. Single dispatch works.
- **Session audio playback.** `Recording` rows are created, listed, stopped and
  deleted, but no media is captured or streamed yet — the row is metadata about
  a capture the media plane does not yet perform.
- **Knowledge base embedding.** Documents are stored and chunk counts are
  computed with the real chunking arithmetic, but nothing is embedded or
  retrieved. An agent cannot yet answer from a knowledge base.
- **Frontend test suite.** Typecheck and build are enforced; there are no
  component or end-to-end tests. Screens are verified by hand.

**Built but shallow**

- **Designer branch, transfer, hangup and webhook nodes** can be placed and
  configured, and they compile, but the runtime ignores them; only STT/LLM/TTS
  reach the agent.
- **Provider API keys** (Integrations → API keys) stores Lattice Net's own
  machine credentials. The long list of upstream provider keys VAAI carries —
  OpenAI, Deepgram, ElevenLabs and the rest — is not modelled here yet;
  providers take their credentials from their own sidecar environment.
- **Simulation and Improvement lab** compute over stored sessions. They are
  observational, not controlled experiments, and both say so on screen.

**Deliberate**

- **Signup is a request form**, not self-service provisioning. Open signup
  would let anyone create tenants against your licence.
- **Pricing figures are absent from the marketing site**, not placeholder
  numbers. The licensing section presents the deployment × tier grid and says
  pricing is quoted. Replace with real figures when the tiers are set.
