# Lattice Net — Application Framework Build Plan

Reference document for the console + Core build. Every later task is written against this
contract. Where this document and the code disagree, this document is wrong and should be
corrected — not the code.

**Date:** 15 Sep 2026
**Core version at time of writing:** Aetos Voice Core 2.0.0 (`:8100`, prefix `/api/v1`)
**Console:** `lattice-web/` — Vue 3.4 + TypeScript + Vite 5.4.21, dev on `:5173`
**Brand:** Lattice Net. Commercial licence. No Apache/MIT grant anywhere.

---

## 1. Decisions taken

| Question | Decision |
| --- | --- |
| Auth | Built into Core now. JWT access + rotating refresh, roles, seeded owner. |
| Tenancy | Full multi-tenant from day one. Every row is tenant-scoped. |
| Console scope | Whole API surface **plus** the visual agent designer. |

These three together are the reason the build is ordered backend-first: the console cannot be
written twice, so the data model has to be right before any screen is built.

---

## 2. What already exists

Core 2.0.0 exposes 29 routes. All of them are currently **unauthenticated and global** — any
caller reaches every row.

```
GET    /api/v1/agents                      GET    /api/v1/sessions
POST   /api/v1/agents                      POST   /api/v1/sessions
GET    /api/v1/agents/{aid}                GET    /api/v1/sessions/{sid}
PATCH  /api/v1/agents/{aid}                POST   /api/v1/sessions/{sid}/end
DELETE /api/v1/agents/{aid}                POST   /api/v1/sessions/{sid}/turns
POST   /api/v1/agents/{aid}/{action}
                                           GET    /api/v1/telephony/trunks
GET    /api/v1/analytics/overview          POST   /api/v1/telephony/trunks
                                           GET    /api/v1/telephony/numbers
GET    /api/v1/components                  POST   /api/v1/telephony/numbers
GET    /api/v1/components/store            GET    /api/v1/telephony/rules
POST   /api/v1/components/{name}/{action}  POST   /api/v1/telephony/rules
                                           GET    /api/v1/telephony/dispatch
GET    /api/v1/system/info
GET    /api/v1/system/events               GET    /contracts
GET    /api/v1/system/audit                GET    /healthz  GET /version
```

Existing tables: `agents`, `sessions`, `trunks`, `numbers`, `rules`, `audit`.
Existing schemas: `AgentIn`, `AgentPatch`, `Pipeline`, `SessionStart`, `SessionEnd`, `Turn`,
`TrunkIn`, `NumberIn`, `RuleIn`.

Unique constraints that **must change** for multi-tenancy — they are currently global and will
collide across tenants:

- `agents.name` unique → unique per `(tenant_id, name)`
- `trunks.name` unique → unique per `(tenant_id, name)`
- `numbers.e164` unique → unique per `(tenant_id, e164)`

---

## 3. Data model

### 3.1 New tables

**tenants**
| column | type | notes |
| --- | --- | --- |
| id | str pk | `ten_<hex10>` |
| slug | str unique | subdomain label, `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$` |
| name | str | display name |
| status | str | `active` / `suspended` |
| is_platform | bool | true for exactly one root tenant; its owners administer all tenants |
| created_at / updated_at | datetime | |

**users** — global identity; a user may belong to several tenants.
| column | type | notes |
| --- | --- | --- |
| id | str pk | `usr_<hex10>` |
| email | str unique (citext/lower) | |
| password_hash | str | Argon2id |
| name | str | |
| status | str | `active` / `disabled` / `invited` |
| must_change_password | bool | true for seeded and invited accounts |
| last_login_at | datetime nullable | |
| created_at / updated_at | datetime | |

**memberships** — the join that carries the role.
| column | type | notes |
| --- | --- | --- |
| id | str pk | `mem_<hex10>` |
| tenant_id | fk tenants | |
| user_id | fk users | |
| role | str | `owner` / `admin` / `operator` / `viewer` |
| created_at | datetime | unique on `(tenant_id, user_id)` |

**brand_profiles** — one per tenant.
| column | type | notes |
| --- | --- | --- |
| tenant_id | fk tenants pk | |
| product_name | str | replaces "Lattice Net" everywhere in the console |
| logo_url / logo_dark_url / favicon_url / login_art_url | str | served from asset store |
| colors | json | `{primary, accent, bg, panel, text, muted, success, warning, danger}` |
| typography | json | `{font_body, font_mono, scale}` |
| radius | json | `{sm, md, lg}` |
| support_url / docs_url / privacy_url / terms_url | str | |
| mail_from_name / mail_from_email / mail_footer | str | |
| custom_css | text | escape hatch, size-capped |
| updated_at | datetime | |

**api_keys**
| column | type | notes |
| --- | --- | --- |
| id | str pk | `key_<hex10>` |
| tenant_id | fk tenants | |
| name | str | |
| prefix | str | first 8 chars, shown in UI |
| hash | str | Argon2id of full secret; secret shown **once** at creation |
| scopes | json | list of `resource:action` |
| created_by | fk users | |
| last_used_at | datetime nullable | |
| expires_at | datetime nullable | |
| revoked_at | datetime nullable | |

**refresh_tokens**
| column | type | notes |
| --- | --- | --- |
| id | str pk | `rt_<hex10>` |
| user_id | fk users | |
| tenant_id | fk tenants | token is bound to the tenant it was issued for |
| token_hash | str | SHA-256; raw token never stored |
| family_id | str | rotation family, for reuse detection |
| expires_at | datetime | |
| revoked_at | datetime nullable | |
| user_agent / ip | str | for the sessions-list UI |

**agent_versions** — required by the designer's publish/diff.
| column | type | notes |
| --- | --- | --- |
| id | str pk | `av_<hex10>` |
| tenant_id / agent_id | fk | |
| version | int | monotonic per agent |
| graph | json | designer node graph (see §6) |
| pipeline | json | compiled `Pipeline` the runtime consumes |
| prompt | text | |
| tools | json | |
| status | str | `draft` / `published` / `archived` |
| created_by | fk users | |
| created_at | datetime | |
| note | str | change note shown in the diff view |

**licence** — single row.
| column | type | notes |
| --- | --- | --- |
| id | int pk | always 1 |
| blob | text | the signed licence file, verbatim |
| installed_at | datetime | |

### 3.2 Changes to existing tables

Add `tenant_id` (fk tenants, indexed, not null) to `agents`, `sessions`, `trunks`, `numbers`,
`rules`, `audit`. Extend `audit` with `actor_user_id`, `actor_type` (`user`/`api_key`/`system`),
`ip`, and `target` so the audit log is genuinely attributable.

### 3.3 Migration

Core currently calls `Base.metadata.create_all` with no migration tool. Introduce **Alembic**
before touching the schema — `create_all` will not add columns to existing tables and will
silently leave the running database wrong.

Migration `0001_multitenancy`:
1. create new tables
2. insert platform tenant `ten_platform` (slug `platform`, `is_platform=true`) and a default
   tenant `ten_default` (slug `default`)
3. add nullable `tenant_id` to existing tables, backfill every row to `ten_default`, then set
   not-null
4. drop the three global unique constraints, recreate them as composite with `tenant_id`
5. create the default brand profile

Seeding an owner is a **CLI command**, never a default password:
`python -m aetos_core seed-owner --email … --tenant default` prints a one-time password and sets
`must_change_password`.

---

## 4. Auth and tenancy

### 4.1 Endpoints

```
POST   /api/v1/auth/login          {email, password, tenant?} → {access, refresh, user, tenant, memberships}
POST   /api/v1/auth/refresh        {refresh}                  → rotated {access, refresh}
POST   /api/v1/auth/logout         revokes the presented refresh token
GET    /api/v1/auth/me             current user + memberships + role
POST   /api/v1/auth/password       {current, new}
POST   /api/v1/auth/switch-tenant  {tenant_id} → tokens rebound to that tenant
GET    /api/v1/auth/sessions       active refresh tokens for this user
DELETE /api/v1/auth/sessions/{id}  revoke one
```

### 4.2 Tokens

Access token: JWT, **15 min**, claims `sub`, `tid`, `role`, `jti`, `exp`, `iat`.
Refresh token: opaque 32-byte random, **30 days**, hashed at rest, rotated on every use.
Reuse of an already-rotated token revokes the whole `family_id` — that is the stolen-token signal.

Signing key from env `LATTICE_JWT_SECRET`; Core refuses to start if it is unset or shorter than
32 bytes. No default secret in code.

### 4.3 Tenant resolution

In priority order: JWT `tid` claim → `X-Tenant-Slug` header (only when authenticating with an API
key) → `Host` subdomain. If the resolved tenant conflicts with the token's `tid`, reject **403** —
never silently prefer one.

### 4.4 Roles

| role | can |
| --- | --- |
| `viewer` | read everything in the tenant |
| `operator` | + agent start/stop/publish, session actions |
| `admin` | + full CRUD on agents, telephony, components, branding, users |
| `owner` | + tenant settings, API keys, licence, delete tenant |
| platform owner | + create/suspend tenants, cross-tenant system views |

Enforced by a `require_role(min_role)` dependency, not by UI hiding. The console hides what the
role cannot do **as well**, but that is cosmetic.

### 4.5 Isolation rule

Every query is scoped through a `tenant_scope(session, model)` helper. A cross-tenant id returns
**404, not 403** — a 403 confirms the row exists to an attacker. This is tested, not assumed.

---

## 5. Branding API

```
GET  /api/v1/branding/public?host=…   unauthenticated — login screen branding before sign-in
GET  /api/v1/branding                 authenticated, full profile
PUT  /api/v1/branding                 admin+
POST /api/v1/branding/assets          multipart; svg/png/webp, ≤2 MB, dimension + type validated
```

The console applies the profile by writing CSS custom properties onto `:root` at runtime, so a
brand change needs no rebuild. `custom_css` is injected last, scoped, and size-capped.

**Fallback:** if `/branding/public` fails, the console renders neutral defaults rather than a
broken or half-branded screen.

---

## 6. Agent designer

The designer edits a **graph**; the runtime consumes a compiled **Pipeline**. Keeping these
separate is what lets the canvas hold layout and authoring metadata without polluting the
contract Core already accepts.

```jsonc
{
  "version": 1,
  "nodes": [
    { "id": "n1", "type": "entry",  "pos": [0, 0] },
    { "id": "n2", "type": "stt",    "pos": [220, 0], "config": { "component": "stt-whisper", "language": "en" } },
    { "id": "n3", "type": "llm",    "pos": [440, 0], "config": { "component": "fast", "prompt": "…", "temperature": 0.4 } },
    { "id": "n4", "type": "tool",   "pos": [660, -90], "config": { "name": "book_appointment", "timeout_ms": 500 } },
    { "id": "n5", "type": "branch", "pos": [660, 90], "config": { "on": "intent", "cases": ["transfer", "default"] } },
    { "id": "n6", "type": "tts",    "pos": [880, 0], "config": { "component": "tts-piper", "voice": "…" } }
  ],
  "edges": [ { "from": "n1", "to": "n2" }, { "from": "n2", "to": "n3" } ]
}
```

Node types: `entry`, `stt`, `llm`, `tts`, `tool`, `branch`, `transfer`, `hangup`, `webhook`.

Each node's properties panel is generated from the component's own JSON schema, fetched from
`/components` — so a newly installed provider gets a correct editor with no console change. That
is the whole point of the plugin model and the designer must not hardcode provider fields.

**Compile step** (`POST /api/v1/agents/{aid}/compile`) validates the graph and emits `Pipeline`.
Validation rules: exactly one `entry`; no orphan nodes; no cycles except through `branch`; every
referenced component installed and healthy; every tool resolvable. Errors are returned per-node
so the canvas can mark the offending node rather than showing one modal.

Publish writes an `agent_versions` row and flips `agents.pipeline`. Rollback re-points to an
earlier version. Diff is computed between two version rows.

---

## 7. Licence enforcement

Ed25519-signed licence file, verified **offline** — matching what the site promises.

```jsonc
{
  "licensee": "Acme Pty Ltd",
  "tier": "white-label",
  "tenants_max": 25,
  "concurrent_sessions_max": 200,
  "features": ["white_label", "multi_tenant", "designer", "air_gapped"],
  "issued_at": "2026-09-15T00:00:00Z",
  "expires_at": "2027-09-15T00:00:00Z",
  "grace_days": 30
}
```

Public key compiled into Core. On expiry: **grace period → read-only → refuse new sessions.**
Existing calls are never cut mid-session. No network call, ever, in any state.

Enforcement points: tenant creation checks `tenants_max`; session start checks
`concurrent_sessions_max`; feature-flagged routes check `features`.

---

## 8. Console structure

```
lattice-web/src/
├── api/            client.ts (fetch + refresh-on-401), agents.ts, sessions.ts, …
├── stores/         auth, tenant, branding, ui
├── router/         guards: requiresAuth, requiresRole, requiresFeature
├── layouts/        AppLayout (sidebar + topbar), AuthLayout, PublicLayout
├── components/ui/  Button, Input, Select, Modal, Drawer, DataTable, Tabs, Badge,
│                   EmptyState, Skeleton, Toast, ConfirmDialog
├── components/designer/  Canvas, Node, Edge, PropertiesPanel, NodePalette, ValidationList
└── views/
    ├── Landing.vue              (public marketing page — already built)
    ├── auth/                    Login, Signup, ForgotPassword, ChangePassword
    └── app/
        ├── Dashboard.vue        analytics overview
        ├── agents/              List, Detail, Designer
        ├── sessions/            List, Detail (transcript)
        ├── components/          Installed, Store
        ├── telephony/           Trunks, Numbers, Rules
        └── settings/            Users, ApiKeys, Branding, Tenant, Licence, System
```

### Non-negotiables for every screen

1. **Loading, empty and error states are part of "done".** A screen that only handles the happy
   path is not finished.
2. **Content is visible by default.** Entry animations are enhancement only — no `opacity: 0`
   resting state gated on JS or on an animation running. (A background tab freezes both; this
   already bit us once and left every section invisible.)
3. Destructive actions confirm, and say what will be destroyed.
4. Every table: keyboard navigable, sortable, paginated server-side where the endpoint supports it.
5. Works at 400 px wide with no horizontal scroll.

---

## 9. Build order

Backend first — the console is written once, against a settled contract.

| # | Task | Blocked by |
| --- | --- | --- |
| 1 | Build plan + contract (this document) | — |
| 2 | Tenancy + auth schema, Alembic migration | 1 |
| 3 | `/api/v1/auth` | 2 |
| 4 | Tenant scoping + role guards on all routes | 3 |
| 5 | Users / tenants / API keys | 4 |
| 6 | Branding API + theme engine | 4 |
| 7 | Console shell, API client, UI kit | 6 |
| 8 | Real login/signup, delete mock auth | 7 |
| 9 | Agents screens | 8 |
| 10 | Agent designer | 9 |
| 11 | Sessions + transcript | 8 |
| 12 | Analytics dashboard | 8 |
| 13 | Components / store | 8 |
| 14 | Telephony | 8 |
| 15 | System / Settings / Branding admin | 5, 6, 8 |
| 16 | Licence enforcement | 4 |
| 17 | End-to-end verification | 10–16 |
| 18 | Deployment + white-label docs | 17 |

---

## 10. Risks worth stating up front

**Alembic on a live database.** Core is running right now with real seeded data. The migration
is written and tested against a copy first; `~/.aetos` is backed up before it runs.

**The designer is the largest single item.** Canvas interaction, schema-driven property panels,
graph validation and version diffing are four separate problems. If it slips, everything from
task 11 onward is independent of it and can ship without it.

**No test suite exists today.** Auth, tenant isolation and licence limits get tests because a
silent failure in any of them is a security bug, not a cosmetic one. The rest is verified by
walking the UI.

**`vue-tsc` is currently unrun.** The console has never been type-checked. Expect a batch of
pre-existing errors to surface at task 17; they are fixed there, not ignored.
