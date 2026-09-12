# Architecture — Aetos One Clinics

This scaffold implements the recommended architecture from the project proposal
(`Aetos-Clinic-AI-Project-Proposal.docx`, sections 3–4): a FHIR-lite,
multi-tenant TypeScript core with every AI capability shipped as an
independent **add-on**, modeled on the Home Assistant Supervisor add-on
system.

## Why add-ons

Home Assistant Supervisor manages add-ons via a `config.yaml` manifest per
add-on (name, version, ports, options schema) and a store UI to
install/configure/enable/view logs. Aetos One Clinics copies that shape
exactly:

- `addons/<slug>/addon.yaml` — the manifest (`@aetos/shared-types`'
  `AddonManifestSchema` is the contract).
- `apps/api/src/addons/addon-registry.service.ts` — scans `addons/` at
  startup and validates each manifest (the "store catalog").
- `apps/api/src/addons/addon-supervisor.service.ts` — per-organization
  enabled/disabled + config + health state (the "installed add-ons" table).
- `apps/api/src/addons/addon-bus.service.ts` / `addon-proxy.service.ts` —
  fire-and-forget events and request/response calls into whichever add-ons
  are enabled for that clinic.
- `apps/web/src/pages/AddonsPage.tsx` — the store UI: enable/disable,
  a config form generated from `configSchema`, and a health-check button.

A clinic on the "Front Desk" plan simply has zero add-ons enabled. A "Full
Suite" clinic enables `ai-scribe`, `med-safety`, and `follow-up`. Adding a
tenth AI capability later means shipping a tenth add-on directory — no core
release required.

## Multi-tenancy

`Organization` → `Location` → (`Patient`, `Appointment`, `Encounter`, ...).
Every tenant-scoped table carries the FK chain back to `Organization`, and
PostgreSQL row-level security (`apps/api/prisma/rls.sql`) enforces isolation
at the database layer, keyed off a `app.current_org_id` session variable that
`PrismaService.forTenant(organizationId)` sets before every query. This is
the multi-tenant model the proposal's section 3.2 specifies, and it is the
central reason the proposal recommends *not* running one Bahmni/OpenMRS
stack per clinic — Bahmni has no equivalent of this.

## RBAC

Four roles (`apps/api/prisma/schema.prisma` `UserRole`): `OWNER`, `ADMIN`,
`DOCTOR`, `FRONT_DESK`. `@Roles(...)` (`apps/api/src/auth/roles.decorator.ts`)
+ a global `RolesGuard` gate sensitive routes — add-on enable/configure and
branding changes require `OWNER`/`ADMIN`; user role changes require `OWNER`.
Wire a real Keycloak JWT strategy to populate `req.auth.role`; until then a
dev `X-Role` header fallback (see `roles.guard.ts`) keeps every route testable.

## White-labeling

`Branding` (one row per `Organization`): product name, logo, primary/accent
color, custom domain, support contact, and a `hidePoweredBy` flag for
reseller plans. The web app (`apps/web/src/lib/branding.ts`) fetches this on
load and applies it as CSS custom properties (`--brand-primary`,
`--brand-accent`), so every themed component re-skins with zero
per-component branding logic. `GET /branding/by-domain/:domain` resolves
branding *before* login, for a clinic running its product under its own
domain.

## MCP server (Claude / Codex management)

`apps/mcp-server` is a standalone MCP server (`@modelcontextprotocol/sdk`)
that exposes add-on management, patient search, queue lookup, branding, and
user/RBAC tools to any MCP client — Claude Code, Claude Desktop, or Codex —
the same way the `aetosonepro` connector manages a Home Assistant instance.
See `apps/mcp-server/README.md` for connection config.

## What is stubbed vs implemented

See `docs/build-status.md`.
