# Decisions

Append-only log of architecture/design decisions taken during autonomous build cycles.

## 2026-09-17 — Store all timestamps as `timestamptz`

**What:** Migrated all 90 `timestamp without time zone` columns to `timestamptz`
(`0002_timestamptz.sql`), reinterpreting existing values as `Asia/Kolkata`, and switched
both schema files to `timestamp(..., { withTimezone: true })`.

**Why:** Postgres stored the server's local wall-clock value and postgres-js read it back
tagged as UTC, so every date in the product was skewed by the server's offset. Symptom
found in the browser: a contact touched minutes ago rendered as "-313m ago". The same
skew silently applied to SLA deadlines, appointment reminders, campaign schedules and
billing periods. Existing rows were written as IST wall-clock, so `AT TIME ZONE
'Asia/Kolkata'` is the only reading that preserves what the data meant.

**Alternatives considered:**
- Treat existing values as already-UTC — simpler migration, but leaves every existing row
  5h30m wrong.
- Force `TZ=UTC` on the API process and Postgres session — one line, no migration, but any
  psql session, backup restore, or self-hosted box on a non-UTC clock reintroduces the
  skew. Unacceptable for a shipped self-hosted edition.

## 2026-09-17 — Test database lifecycle owned by `globalSetup`

**What:** Added `tests/helpers/global-setup.ts` (create + migrate + seed once, drop once)
and removed the per-file `recreateTestDatabase()` / `dropTestDatabase()` calls from all
four integration test files.

**Why:** Vitest runs each test file in its own worker even with `fileParallelism: false`.
Every file recreating `whatsup_test` at import time meant one file's `DROP DATABASE`
landed while another was mid-run — a different pair of files failed on each run (observed:
5 fails, then 0, then 3, then 2). One owner for the database lifecycle removes the race at
its source. Side benefit: suite duration fell from ~46s to ~18s because the migration runs
once instead of eleven times.

**Alternatives considered:**
- A separate database per test file — isolates correctly but multiplies migration cost by
  the number of files.
- `TEST_DB_NAME` override for the one new file — tried first; only moved the race rather
  than removing it, since the other ten files still contended.

**Gotcha recorded:** `globalSetup` runs *before* `setupFiles`, so `dotenv` has not loaded
`DATABASE_URL` yet — `global-setup.ts` must import `dotenv/config` itself.

## 2026-09-17 — CSAT and NPS rolled up on separate scales

**What:** `/csat` now computes the CSAT average over CSAT responses only and reports NPS
(% promoters − % detractors) as its own field, instead of averaging all scores together.

**Why:** CSAT is out of 5 and NPS is out of 10. Averaging both produced "Average CSAT
6 / 5" and a 120% ring on the surveys screen.

## 2026-09-17 — Tenant isolation tiers, resolved inside `withOrgDb`

**What:** Added four isolation tiers (`row` | `schema` | `database` | `app`) as a column on
`orgs`, plus `on_prem` as a fourth deployment target. Tier resolution happens inside
`withOrgDb`, so it picks the database/schema a transaction runs against.

**Why there:** every org-scoped route already funnels through `withOrgDb`, so tiering it
means zero route changes and no route can accidentally bypass isolation. Verified end to
end: an insert through an unchanged route landed in the tenant's own schema (1 row) with
zero rows in `public`.

**Alternatives considered:** per-request middleware handing each handler a request-scoped
db — spreads a security invariant across 40+ modules, where one missed call site is a
cross-tenant leak.

**Invariants chosen deliberately:**
- Tiers are cumulative, not alternatives. RLS runs in *every* tier, so a routing
  misconfiguration degrades to row isolation rather than to no isolation.
- A `database`/`app` tenant whose secret cannot be resolved **fails closed** — it must never
  quietly serve queries from the shared database. A `schema` tenant missing its schema name
  degrades to row isolation instead, because RLS still isolates it and failing closed would
  take a working tenant offline for a metadata bug.
- Connection strings are never stored in `orgs`; the column holds a *reference* to a secret,
  so reading that table (or a leaked backup) cannot yield every tenant's credentials.
- `search_path` cannot be parameterised, so schema names are validated against a strict
  allowlist (`^[a-z_][a-z0-9_]{0,62}$`) rather than escaped — covered by injection tests.
- Downgrades are refused by the API (409): moving rows back into shared storage is a
  data-exposure decision for an operator, not a settings toggle.
- Tier migration is copy → verify → switch, leaving the source rows in place so the switch
  can be reverted.
- DB CHECK constraints reject half-configured states (schema tier with no schema name,
  database tier with no secret ref) so the application never discovers them at request time.

**Known gap:** `CREATE TABLE ... LIKE INCLUDING ALL` does not carry RLS policies, so
provisioning returns an explicit manual step to run `scripts/reapply-rls.sql` against the
new schema before it serves traffic. Automating that is the obvious follow-up.

## 2026-09-17 — RLS moved into a migration, and made strict

**What:** `0004_rls_policies.sql` now enables FORCE ROW LEVEL SECURITY and the
`org_isolation` policy on 40 org-scoped tables as part of the migration chain.

**Why:** `scripts/reapply-rls.sql` was never in the chain. Every fresh install — including
every self-hosted and on-prem deployment — came up with row isolation silently OFF until
someone remembered to run that script by hand. The `row` isolation tier depends entirely on
these policies.

**The bigger find:** the old policy read
`org_id::text = current_setting(...) OR coalesce(current_setting(...), '') = ''`.
That second clause makes RLS a **no-op for any query that forgets `withOrgDb`** — an unset
GUC meant unrestricted access to every org's rows, which is precisely the bug the policy
exists to catch. Replaced with an explicit `app.bypass_rls`, set only by seed/migration
processes via `RLS_BYPASS=on` as a connection option (never by the API server, so
request-serving code cannot reach for it by accident).

Verified: an unscoped `select count(*) from contacts` now returns 0 where it previously
returned every row in the database.

**Three bugs the strict policy exposed**, none catchable by the old suite:
- `creditWallet` wrote the balance and its ledger row through the unscoped `db` — money
  movement running with no org scoping, and not atomic. Now one `withOrgDb` transaction.
- The conversation-charge debit path had the same defect across three writes. Now atomic,
  so a partial failure can neither double-charge nor lose the audit trail.
- `withOrgDb` was doing a routing lookup on a SEPARATE connection before every transaction
  (introduced by the tenancy work), which made `integration-crm` flake ~1 run in 4. Added a
  fast path that skips routing entirely while every org is on `row` tier.

**Correction to an earlier claim in this file:** I previously recorded that `licenses`
needed RLS because licence rows were "readable across orgs". That was wrong. `licenses`,
`api_keys` and `org_members` are credential-lookup tables — the credential is what
*establishes* org context, so RLS cannot guard the query that determines the org. Adding
policies to them broke login and offline licence activation outright. All three are now
documented exclusions in the migration.

## 2026-09-17 — Marketing site reflects what is actually built

**What:** Added the five shipped CRM modules (Service Desk, Lead Scoring & Distribution,
Quotes, Appointments, CSAT & NPS Surveys) to `marketing-data.ts`, plus two comparison
groups (CRM & service desk, Deployment & isolation) to `compare-data.ts`.

**Why the copy is written the way it is:** every bullet describes behaviour that exists and
was verified in the browser against demo data. The "edge" lines state the actual design
decision rather than a marketing claim — e.g. surveys say CSAT and NPS are never averaged
together, which is the bug fixed earlier today.

The hero stat already derived from `features.length`, so it reads 20 automatically; the two
hardcoded "Twelve modules" strings were changed to "Every module" so the count cannot drift
again.

**Mobile (390x844) verified** across 11 pages by measuring real horizontal overflow in a
390px viewport. One genuine bug found and fixed: `/contacts` used `overflow-hidden` around a
718px table, which pushed the whole page sideways instead of scrolling the table. Now
`overflow-x-auto` with `min-w-[640px]`, matching the other tables.
