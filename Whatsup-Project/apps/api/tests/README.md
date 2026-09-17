# Tests

```bash
npm test          # everything (unit + integration)
npm run test:unit # pure functions only — no database needed
npm run test:e2e  # integration only
npm run test:watch
```

## Unit tests (39 assertions, no database)

Pure functions, so they run anywhere including CI with nothing provisioned:

- `unit-licensing` — key signing, tamper detection, wrong-secret rejection, expiry and
  not-yet-valid windows, malformed input.
- `unit-billing` — template category → billing category, milli-paise conversion.
- `unit-interactive` — the exact Meta `interactive` payloads for buttons, cta_url, list,
  single product, product_list and flow. The payload is the contract with Meta, so a
  refactor that changes its shape fails here rather than at send time.
- `unit-flows` — Flow JSON v5 compilation: component mapping, screen navigation, and
  that every field on the terminal screen reaches the completion payload.
- `unit-webhook-signing` — the HMAC is recomputed the way a customer's receiver would,
  not by calling our own signer, plus replay-protection properties.
- `unit-meta-webhook-parse` — inbound text, button reply, list reply, flow submission
  (including malformed JSON), template button taps, and that status callbacks are ignored.

## Integration tests (21 assertions, real Postgres + real Fastify)

`tests/helpers/db.ts` creates a throwaway `whatsup_test` database per run, migrates it,
seeds the plan and rate catalogue, and drops it afterwards — the dev database is never
touched. `tests/helpers/app.ts` builds the real Fastify app and drives it with
`app.inject`, so routes, auth, plugins and RLS all run as they do in production.

- `integration-api` — registration and login, 401 without a token, 403 when the token's
  org does not match the URL, contact CRUD, interactive template creation with Meta's
  limits enforced, the preview payload, edit-resets-to-pending, the public plan
  catalogue, wallet top-up and ledger, plan gating (402 on Free → allowed on Advanced),
  API key issue/authenticate/revoke, and dashboard layout save and reset.
- `integration-licensing` — hosted plans refused a key, self-hosted licence issued with
  the key returned once, cross-partner access refused, offline verification, tamper
  rejection, activation, the instance cap, heartbeats that preserve instance details,
  suspend/resume, freeing a slot, and permanent revocation.

## Why the migration history was rebuilt

The first integration run failed because a fresh database could not be built from the
migrations: 13 tables and ~20 columns existed only in the dev database, created by
`drizzle-kit push`. `push` updates the snapshot files under `meta/` without writing SQL,
so `generate` saw nothing to emit and the history silently stopped matching reality. A
fresh install — production, CI, or a self-hosted customer — would have come up missing a
third of the product.

The fix was to squash to a single `0000_baseline` generated from `schema.ts`. The old
files are kept, unused, in `src/db/migrations-legacy/`. Databases that predate the
baseline are stamped with `npx tsx scripts/stamp-baseline.ts` (idempotent); new ones just
migrate normally.

**Use `drizzle-kit generate` + `npm run db:migrate`. Never `drizzle-kit push`.**

## Demo data

```bash
npm run db:demo            # seed / re-seed "Aetos Demo Store"
npm run db:demo -- --drop  # remove it
```

Sign in as `demo@loqio.local` / `Demo@Loqio2026`. The script is idempotent: it drops and
rebuilds its own org, so it is safe to re-run after a schema change.

It creates one org on the Advanced plan with an owner and two agents, a team, a connected
channel, 3 companies, 8 contacts, 6 conversations with threaded history (including an
interactive send and a button reply), 14 days of backfilled traffic so the trend chart and
analytics have a shape, 6 templates (buttons, list, plain and SMS), a 5-stage pipeline
with 7 deals across open/won/lost, 5 tasks including overdue ones, a Flow with 2
submissions, 3 campaigns (a completed one with a real funnel built from message rows, a
running 3-step drip with recipients mid-sequence, and one scheduled), 2 automation rules,
canned responses, a saved view, and a wallet ledger with metered conversation charges.
