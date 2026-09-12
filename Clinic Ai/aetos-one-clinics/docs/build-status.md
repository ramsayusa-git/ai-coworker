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
| `lab-insights` | **New, 12 Sep 2026 (gap-analysis pass)**. Implemented: `/events/labreport.uploaded` extracts named lab markers (LLM + heuristic fallback) against a reference-range table and writes `Observation` rows back via the core API when `encounterId` is given. |
| `command-center` | **New, 12 Sep 2026**. Implemented: `/summary` aggregates today's queue depth, revenue collected, and add-on health by calling back into the core API — closes the "Command Center" agent gap identified vs. arogyam.ai. |
| `patient-concierge` | **New, 12 Sep 2026**. Implemented: `/events/patient.inquiry` drafts a patient-facing reply (LLM + heuristic fallback) and refuses to answer clinical questions (`CLINICAL_KEYWORDS` guard defers to a human). |
| `smart-queue` | **Implemented, 12 Sep 2026**: real additive rule-based triage scoring (red flags, vitals, age, chronic conditions) with human-readable reasons, writes back to `Appointment.triageScore`. |
| `revenue-integrity` | **Implemented, 12 Sep 2026**: real unbilled-item detection — matches conditions/medications against invoice line items (code + free-text description) via `GET /invoices/unbilled-candidates/:encounterId`, returns a `flagged` list. |
| `intake`, `follow-up` | Event-handler skeletons with realistic shapes; blocked on a real WhatsApp Business API integration to collect intake data / send recall nudges — not a logic gap, a credentials gap (see gap analysis). |
| `abdm-adapter` | Contract only (`/abha/create-or-verify`, `/consent/link-care-context`, `/health-records/:id`) — every endpoint raises `NotImplementedError` pending the Bahmni HIP/HIU-vs-NHA-wrapper decision (proposal section 3.4). |

## Gap-analysis build pass — 12 Sep 2026

Following a competitive gap analysis against arogyam.ai (public marketing site only —
their trial login and WhatsApp OTP signup both failed; see the analysis for detail),
five items were built into this codebase in one pass:

- **1-Click Visit Templates** (new `VisitTemplate` model + RLS policy, 21 seeded Indian
  OPD condition templates, `POST /visit-templates/draft` LLM drafting from a free-text
  description, `POST /visit-templates/:id/apply/:encounterId` applying a template's
  meds/tests to an encounter atomically, and a new `Visit Templates` page in the web app).
- **Lab Insights add-on** (new — see table above), plus `POST /encounters/:id/lab-report`
  and `POST /encounters/:id/observations` on the core API.
- **Command Center add-on** (new — see table above) + `GET /command-center/summary`.
- **Patient Concierge add-on** (new — see table above) + `POST /patient-concierge/draft-reply`.
- **Practice analytics**: `GET /analytics/overview?days=N` (appointments/no-shows,
  completed encounters, revenue collected, top-5 diagnoses) + a new `Analytics` page.

Verified: native (non-Docker) `dev:api` (port 3001) and `dev:web` (port 5173) both run
on the host; `GET /visit-templates` and `GET /analytics/overview` return real seeded/
computed data via curl; the two new web pages return HTTP 200 and compile with no
Vite/HMR errors.

## Add-ons now run natively too — 12 Sep 2026 (second pass)

All 10 add-ons (not just the 3 new ones) are now running as real standalone processes
in this native dev setup, not just discovered/typechecked:

- Created a shared venv (`.venv-addons/`) at the repo root and installed every add-on's
  `requirements.txt` into it (they all share the same fastapi/uvicorn/pydantic/httpx/
  anthropic pin set).
- Started all 10 with `uvicorn app.main:app --port <manifest port>` as background
  processes (`/tmp/addon-logs/<slug>.log`).
- **Fixed a real bug found in the process**: `AddonProxyService.call()` and
  `AddonSupervisorService.checkHealth()` both built add-on URLs as
  `http://${slug}:${port}` — correct inside Docker Compose (slug = service/DNS name),
  but unresolvable on a bare host (`getaddrinfo EAI_AGAIN <slug>`) where every add-on is
  just a process bound to `localhost` on its own port. Added
  `apps/api/src/addons/addon-host.util.ts` (`resolveAddonHost(slug)`, returns
  `process.env.ADDON_HOST_OVERRIDE || slug`) and used it in both call sites.
  `apps/api/.env` now sets `ADDON_HOST_OVERRIDE=localhost` for native dev;
  `docker-compose.yml` never sets it, so container mode is unaffected.
- Verified end-to-end after the fix: all 10 add-ons report `{"ok":true}` via
  `POST /addons/:slug/health-check`; `GET /command-center/summary` and
  `POST /patient-concierge/draft-reply` both return real data through the full
  core-API → `AddonProxyService` → FastAPI add-on round trip (not just direct
  add-on calls).
- **Fixed a second bug while testing lab-insights**: its no-API-key heuristic fallback
  matched marker labels (e.g. "hemoglobin") but never parsed the number after them —
  every marker came back `value: null`, `flag: "unknown-range"`, useless without an
  Anthropic key. Added a regex pull of the first number following the label, so the
  heuristic path now returns real values and real low/high flags
  (`addons/lab-insights/app/main.py`).

Not yet done: no `ANTHROPIC_API_KEY` is set anywhere in this environment, so every
add-on that has an LLM path (ai-scribe, med-safety explanations, lab-insights,
patient-concierge) is running on its heuristic/deterministic fallback only — set the
key in `apps/api/.env` and each add-on's environment to exercise the LLM path.

## Real logic added to two previously-empty add-on skeletons — 12 Sep 2026 (third pass)

`smart-queue` and `revenue-integrity` were "event-handler skeletons with realistic
shapes; core logic TODO" (see table below) — this pass filled in real, testable logic
for both, verified against real inserted rows (not just direct add-on pings):

- **Smart Queue** (`addons/smart-queue/app/main.py`): replaced the flat "90 if any red
  flag else 50" score with a transparent additive rule-based model — red flag count,
  SpO2, heart rate, temperature, systolic BP, age band, and chronic condition count
  each contribute points, capped at 100, and the response includes a `reasons` list so
  a front-desk user can see why a patient was prioritized. `IntakeCompletedEvent` now
  accepts `vitals`, `ageYears`, and `chronicConditionCount`. Verified: a synthetic
  intake with a red flag, low SpO2 (89%), high heart rate (135bpm), age 72, and 2
  chronic conditions scored 100 with all five reasons listed, and the score persisted
  correctly on the appointment (confirmed via `GET /appointments/queue`).
- **Revenue Integrity** (`addons/revenue-integrity/app/main.py`): the old handler
  called `GET /invoices?patientId=""` (a bug — always empty) and only returned raw
  condition/medication counts. Wired it to the core API's existing-but-unexposed
  `BillingService.findUnbilledCandidates()` — added the missing route
  (`GET /invoices/unbilled-candidates/:encounterId` in `billing.controller.ts`) — and
  implemented real matching: each condition/medication is checked against every
  invoice line item's `code` (exact match) and free-text `description` (substring,
  case-insensitive) across all invoices for that encounter; anything not covered is
  returned in a `flagged` list. Verified against a real encounter with one condition
  and one medication and two invoices: with only a "Consultation fee" line, both were
  flagged; after adding a line item covering the medication, only the condition stayed
  flagged. Matching is intentionally loose (line items are hand-typed free text today,
  not structured codes) — see the docstring in the add-on for the caveat.

`intake` (needs a real WhatsApp Business API integration to collect vitals/red flags
in the first place) and `follow-up` (needs a WhatsApp/SMS send integration to actually
notify patients) remain skeletons — both are correctly blocked on the same external
credentials gap already called out in the gap analysis, not on missing logic.

## Sign-in date added to User and Patient — 12 Sep 2026 (fourth pass)

Added `lastSignInAt DateTime?` to both `User` and `Patient` (`schema.prisma`, pushed
with `prisma db push`) — distinct from `createdAt` (account/registration date):

- `PATCH /users/:id/sign-in` (`users.controller.ts` / `users.service.ts`) — call this
  from wherever sign-in actually happens once Keycloak (or a dev login) is wired; no
  such call site exists yet since there's no login flow in this scaffold.
- `PATCH /patients/:id/sign-in` (`patients.controller.ts` / `patients.service.ts`) —
  for a future patient portal/kiosk sign-in; no portal exists yet either.

Both fields are `null` until the first real sign-in — no placeholder/dummy timestamps
were seeded into existing rows, since a fabricated sign-in date in a clinical record
would be indistinguishable from a real one later. Verified both endpoints against a
throwaway test user and test patient (each correctly went from `null` to a real
timestamp), then removed the test rows. **Waiting on real data**: Ramsay said he'll
provide real sign-in data — once that's available it can be imported directly into
these two columns (bulk `UPDATE`/CSV import), no schema changes needed.

Deliberately not attempted in this pass (each is a substantial separate build requiring
external accounts/credentials): CarePro / real WhatsApp Business API integration, the
separate patient mobile app, and Razorpay payment-gateway wiring. See
`clinic-ai-proposal-summary.md` (claude.ai "Clinic AI" project) and the full gap-analysis
doc for the complete feature comparison and priority ranking.

## Fixed: UI showed empty/old-looking pages with no explanation — 12 Sep 2026 (fifth pass)

Root cause found after Ramsay reported "nothing found in ui, found old basic ui":
every feature built in the earlier passes was genuinely working, but the web app
had no login/org-picker flow — `apps/web/src/lib/api.ts` only attaches the
`X-Org-Id` header when `localStorage.aetos.orgId` is already set, and nothing in
the UI ever set it. Every page (Queue, Visit Templates, Analytics, ...) was
silently rendering its "no clinic selected" empty state, which looks identical
to a broken or outdated build. Confirmed by manually setting the localStorage
keys in a live browser: Visit Templates immediately showed all 21 seeded
templates and Analytics rendered correctly — proving the features, not just the
diagnosis, were sound.

Fix (no more manual devtools step required):

- New pre-login endpoint `GET /organizations` (`apps/api/src/organizations/`)
  returns every Organization with its Locations. Explicitly excluded from
  `TenantMiddleware` (`tenancy.module.ts`) since it has to be callable with no
  `X-Org-Id` header — that's the value it exists to discover. Uses the raw
  Prisma client for the org list (no RLS on `organizations`) and loops
  `forTenant(org.id)` per org to read locations (RLS-protected).
- New `apps/web/src/lib/OrgGate.tsx`, wrapping `<App/>` in `main.tsx`: on first
  load, if `aetos.orgId` isn't set, it calls `GET /organizations` and — with
  exactly one org (today's case: "Sunrise Clinic") — auto-selects it and its
  first location with zero prompts; with more than one, shows a one-click
  picker; with zero, shows a clear "no organization set up yet" message
  instead of a blank app.

Verified in the live browser pane with `localStorage.clear()` + reload: the app
auto-bootstrapped to Sunrise Clinic with no manual step and Visit Templates /
Queue rendered real data immediately.

## Real custom-domain verification + activation for white-label branding — 12 Sep 2026 (sixth pass)

Ramsay pointed at the same feature already built in the Whatsup-Project ("Aetos One Chat") partner
console and asked for it here too: the `Branding.customDomain` field previously just stored a raw
string with no proof the org actually owned that domain, and no way to stage a change before it
went live. Rebuilt to match the Whatsup pattern exactly:

- Schema: `Branding` gained `customDomainStatus` (unset/pending/verified/failed),
  `customDomainActive` (bool), `domainVerificationToken`, `domainVerifiedAt`.
- `branding.service.ts`: saving/clearing `customDomain` always resets status to `pending`/`unset`,
  clears `active`, and mints a fresh verification token. `GET /branding/domain-instructions` returns
  the exact TXT (`_aetosclinics-verify.<domain>`) + CNAME (`<subdomain> -> edge.aetosone.clinics`)
  records to add. `POST /branding/domain-verify` does real `dns.resolveTxt`/`resolveCname` lookups
  (Node's `dns/promises`, no third-party API) and only flips to `verified` if both resolve.
  `POST /branding/domain-activate` refuses to activate unless status is `verified` — verified and
  active are deliberately separate states, same reasoning as Whatsup's partner console. The public
  `getByCustomDomain()` lookup (used pre-login to resolve branding by hostname) now requires BOTH
  verified AND active before serving a custom domain's branding; the free subdomain path is
  unaffected (always live once saved, no external DNS to get wrong).
- `apps/web/src/pages/BrandingPage.tsx`: status + active badges next to the domain field, a DNS
  records table, Verify/Activate buttons (Activate disabled with a tooltip until verified), and an
  always-visible worked example filling in the org's actual typed/saved domain — never a bare
  placeholder that disappears when there's nothing saved yet.

Verified end-to-end in the live browser pane, not just via curl: saved a test domain, watched the
DNS-instructions block and pending/inactive badges appear, clicked **Verify domain** for real and
watched it correctly report "failed" with the genuine `ENOTFOUND` DNS errors (the test domain has
no real records), confirmed **Activate domain** stays disabled until verified. Cleared the test
domain back to unset afterward.

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
5. `npm run dev:api` and `npm run dev:web`; open http://localhost:5173 — the
   app now auto-selects the organization/location on first load (see "Fixed:
   UI showed empty/old-looking pages" above), no manual localStorage step
   needed as long as at least one `Organization` row exists.
