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
