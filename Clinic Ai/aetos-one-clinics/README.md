# Aetos One Clinics

AI-powered clinic management platform for Indian OPD clinics (Arogyam.ai-class), built on a FHIR-native
core with a **Home-Assistant-style add-on system** for every AI capability.

See `docs/architecture.md` and the original proposal (`Aetos-Clinic-AI-Project-Proposal.docx`) for the
full rationale, including the Bahmni build-vs-reuse decision.

## Repo layout

```
apps/
  api/          NestJS + Prisma core — patients, appointments, encounters, prescriptions, billing,
                the add-on registry/supervisor, and the FHIR-lite REST surface
  web/          React + Vite clinic UI, including an "Add-ons" store page modeled on the
                Home Assistant Supervisor add-on store (install / configure / enable / logs)
addons/         Each AI capability is an independently deployable service with its own
                addon.yaml manifest (name, version, icon, config schema, port) — same shape
                as a Home Assistant add-on's config.yaml. The API's add-on supervisor discovers
                and manages these.
  scribe/            AI Scribe — ASR + LLM structuring into SOAP / FHIR draft resources
  intake/            Pre-visit intake agent (WhatsApp-driven)
  med-safety/        Medication safety — deterministic rule engine + LLM explanation
  smart-queue/       Clinical urgency triage / queue ordering
  follow-up/         Chronic-care recall engine
  revenue-integrity/ Unbilled-procedure detection
  abdm-adapter/      ABDM HIP/HIU adapter (ABHA, consent, FHIR bundles to NHA gateway)
  lab-insights/      Lab report marker extraction vs. reference ranges → Observation records
  command-center/    Ops-oversight aggregation (queue, revenue, add-on health)
  patient-concierge/ Patient-facing support chat drafting (defers clinical questions to staff)
packages/
  shared-types/  FHIR-lite TypeScript types + Zod schemas shared by api and web
infra/
  docker-compose.yml   Postgres, Redis, Keycloak, api, web, and every add-on
```

## Why add-ons, not a monolith AI layer

Every AI capability ships as its own containerized service with a manifest (`addon.yaml`):
name, version, icon, description, required config (e.g. which LLM/ASR provider, API keys),
and a health endpoint. The API's **add-on supervisor** (`apps/api/src/addons`) reads the
manifest registry, lets an admin enable/disable/configure each add-on from the web UI's
Add-ons store page, and proxies calls to whichever add-ons are enabled. This mirrors how
Home Assistant Supervisor manages add-ons, which is the operating model Aetos already
knows well from Aetos One — and it means a clinic can run only the add-ons it has paid
for, an add-on can be swapped (e.g. a different ASR vendor) without touching the core,
and a new AI capability ships as a new add-on rather than a core release.

## Getting started (local dev)

```bash
npm install
cp .env.example .env        # fill in DB/Keycloak/LLM credentials
npm run typecheck           # verify the whole workspace compiles
docker compose -f infra/docker-compose.yml up -d postgres redis keycloak
npm run dev:api             # http://localhost:3001
npm run dev:web             # http://localhost:5173
```

## Status

Scaffold generated 12 Sep 2026. See `docs/build-status.md` for what is stubbed vs implemented.
