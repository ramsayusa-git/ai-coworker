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
