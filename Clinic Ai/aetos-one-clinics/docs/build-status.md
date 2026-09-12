# Build status — 12 Sep 2026

Initial scaffold. Everything below compiles/typechecks; "implemented" means
real logic, "stubbed" means the shape/contract is real but the internals are
a placeholder that raises `NotImplementedError` or returns empty data.

## Core API (`apps/api`) — implemented

- Multi-tenant data model (Prisma schema + RLS policies)
- Patients, Appointments (with token queue + triage sort), Encounters,
  Prescriptions (med-safety hook), Billing/Invoices — CRUD wired to Postgres
- Add-on registry, per-org supervisor (enable/disable/config/health), event
  bus (HTTP fan-out to subscribed enabled add-ons), synchronous add-on proxy
- RBAC (`@Roles` guard, 4 roles) — dev header fallback until Keycloak is wired
- White-label branding (CRUD + public domain lookup)
- Audit log table (not yet written to by every read/write — TODO before
  ISO 27001 / ABDM readiness)

## Core API — stubbed / TODO

- Keycloak JWT strategy (`auth.module.ts` describes the shape; not wired)
- Allergy list on `Patient` (med-safety add-on needs it — currently returns `[]`)
- Structured `code` field on invoice line items (blocks real revenue-integrity matching)

## Web (`apps/web`) — implemented

- Queue, Patients search, **Add-ons store** (enable/disable/configure/health —
  the HA-Supervisor-style UI), Branding settings
- White-label theming via CSS custom properties

## Web — TODO

- Login/auth flow (Keycloak), encounter/SOAP note editor with AI-scribe diff
  review, prescription writer with med-safety findings UI, billing UI,
  patient app (Flutter, separate from this repo)

## Add-ons (`addons/*`)

| Add-on | Status |
|---|---|
| `med-safety` | **Implemented**: deterministic interaction/allergy rule engine + optional LLM rephrasing. `_fetch_patient_context` needs a real active-medications/allergy source (see Core API TODO). |
| `ai-scribe` | LLM structuring (Anthropic) implemented; ASR transcription is a stub — raises `NotImplementedError` until an ASR provider is wired. |
| `intake`, `smart-queue`, `follow-up`, `revenue-integrity` | Event-handler skeletons with realistic shapes; core logic (WhatsApp send, cadence persistence, invoice-line matching) is TODO. |
| `abdm-adapter` | Contract only (`/abha/create-or-verify`, `/consent/link-care-context`, `/health-records/:id`) — every endpoint raises `NotImplementedError` pending the Bahmni HIP/HIU-vs-NHA-wrapper decision (proposal section 3.4). |

## MCP server (`apps/mcp-server`)

Implemented: `list_addons`, `enable_addon`, `disable_addon`, `configure_addon`,
`check_addon_health`, `search_patients`, `get_queue`, `get_branding`,
`update_branding`, `list_users`, `update_user_role`. Requires
`AETOS_API_BASE_URL` / `AETOS_ORG_ID` / `AETOS_SERVICE_TOKEN` env vars — see
its README for Claude Code / Claude Desktop / Codex config snippets.

## Infra

`infra/docker-compose.yml` wires Postgres, Redis, Keycloak, api, web, and all
seven add-ons. Not yet started in this session (scaffold-only, per Ramsay's
12 Sep 2026 decision) — bring up with
`docker compose -f infra/docker-compose.yml up -d`.

## Next steps

1. `npm install` at repo root, `npm run typecheck` (done in this session — see
   the verification note in the delivery message).
2. `cp apps/api/.env.example apps/api/.env`, fill in `DATABASE_URL`.
3. `docker compose -f infra/docker-compose.yml up -d postgres redis`
4. `npm run prisma:migrate -w apps/api` (creates tables), then apply
   `apps/api/prisma/rls.sql` once against the database.
5. `npm run dev:api` and `npm run dev:web`; open http://localhost:5173.
6. Seed one `Organization` + `Location` row and set `aetos.orgId` /
   `aetos.locationId` in browser localStorage to exercise the UI.
