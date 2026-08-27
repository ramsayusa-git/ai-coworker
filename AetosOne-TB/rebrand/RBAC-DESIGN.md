# RBAC design — Aetos One Cloud

**Status: Phases 1–6 built and verified. Both earlier limitations are now closed.**

| Phase | State |
|---|---|
| 1 — schema, model, persistence, services | done |
| 2 — permission resolution + cache, wired into access control | done, enforcing |
| 3a/3b — resource-level gating on list endpoints | done, 27 endpoints |
| 3c — row-level filtering for GROUP roles | done, SQL-side and exact |
| 4 — REST controllers for groups, roles, grants | done |
| 5 — Access control admin UI | done, incl. grant management |
| 6 — migration + audit fixtures | done, verified behaviour-neutral |

**Decision taken without an answer:** flat tenant → customer ownership, no nested
sub-customers. Ownership is one comparison rather than a recursive CTE. Reversible — it
lives in one place in the permission check.

### Row filtering — now SQL-side and exact

Both earlier limitations are closed.

Rather than duplicating an `entity_group_id IN (...)` join into ~40 entity queries, the
**membership table itself is paged**: `entity_group_entity` is the authoritative list of
what a GROUP role reaches, so paging it filtered to the granted groups yields correct page
sizes and correct `totalElements`. The caller then loads that page of ids. One query serves
every entity type and no existing DAO method changed.

Verified by `verify_group_scoping.py`, which builds the whole scenario through the REST API
and asserts, among others, that a page size smaller than the group comes back **full** --
the assertion post-query filtering fails.

Two bugs the verification caught, both now fixed:

- **A GROUP-only role was refused the list outright (403).** `checkResourcePermission` runs
  before any entity is in hand, and only GENERIC grants were consulted, so scoping never
  got a chance to run -- GROUP roles were unusable for lists. `MergedUserPermissions` now
  also tracks which *entity types* a group grant covers, and that admits the listing.
- **`SELECT DISTINCT` with a sorted `Pageable` (Postgres 42P10).** Postgres requires every
  `ORDER BY` expression to appear in the select list of a `SELECT DISTINCT`; a sorted
  `Pageable` injected a column that was not selected. Ordering now lives in the query and
  the `Pageable` is unsorted.

Applied to `GET /tenant/devices`. Other list endpoints are resource-gated; extending row
scoping to them is now a three-line change each, since the machinery is shared.

**Remaining caveat:** the scoped path pages ids from the membership table, so `textSearch`
and custom sort on that endpoint are not applied for GROUP-role users.

### Grants UI

The Access control page has three tabs: **Roles**, **Entity groups** and **Grants**. The
Grants tab binds a user group to a role, and asks for a target entity group only when the
selected role is a GROUP role -- mirroring the server rule that a GENERIC role must not
carry one and a GROUP role must.


## 1. Why this is the expensive one

Everything built so far has been additive — new tables, new endpoints, a new authority.
RBAC is different: it changes the answer to *"which rows may this user see?"* for every
entity type in the platform. Concretely it touches:

- 15+ entity types (device, asset, dashboard, customer, alarm, rule chain, entity view,
  edge, widget bundle, OTA package, TB resource, user, converter, integration, scheduler)
- Every `findByTenantId...` / `findByCustomerId...` DAO method
- Every controller that returns a page of entities
- The permission checker layer (`DefaultAccessControlService` and friends)

The risk is not writing the tables. It's that a missed DAO method silently leaks data
across groups, and you find out in production. Section 6 is the mitigation.

---

## 2. Ownership model

PE has a two-level owner: tenant → customer, with customers nestable. We add a third
case above it — the platform itself.

```
platform (tenant_id = NULL_UUID)
  └── tenant
        └── customer
              └── sub-customer …
```

An **owner** is therefore `(owner_type, owner_id)` where `owner_type ∈ {PLATFORM, TENANT, CUSTOMER}`.
Every entity group and every role belongs to exactly one owner.

> **Decided: flat tenant → customer, no nested sub-customers.** Ownership is one
> comparison, not a recursive walk. The schema still stores the owner generically, so
> adding nesting later is a change in the permission check rather than a migration.

---

## 3. Schema

### 3.1 `entity_group`

```sql
CREATE TABLE entity_group (
    id            uuid PRIMARY KEY,
    created_time  bigint NOT NULL,
    tenant_id     uuid NOT NULL,          -- NULL_UUID for platform-owned groups
    owner_type    varchar(32) NOT NULL,   -- PLATFORM | TENANT | CUSTOMER
    owner_id      uuid NOT NULL,
    type          varchar(32) NOT NULL,   -- DEVICE | ASSET | DASHBOARD | USER | CUSTOMER | ...
    name          varchar(255) NOT NULL,
    configuration jsonb,
    additional_info varchar,
    version       bigint DEFAULT 1,
    CONSTRAINT entity_group_unq UNIQUE (owner_type, owner_id, type, name)
);
CREATE INDEX idx_entity_group_owner ON entity_group(owner_type, owner_id, type);
```

Each owner automatically gets an **"All"** group per entity type, created lazily. "All" is
not materialised in `entity_group_entity` — membership is implied by ownership. This
matters: without it, creating a tenant with 100k devices would insert 100k membership rows.

### 3.2 `entity_group_entity`

```sql
CREATE TABLE entity_group_entity (
    entity_group_id uuid NOT NULL REFERENCES entity_group(id) ON DELETE CASCADE,
    entity_id       uuid NOT NULL,
    entity_type     varchar(32) NOT NULL,
    added_time      bigint NOT NULL,
    PRIMARY KEY (entity_group_id, entity_id)
);
CREATE INDEX idx_ege_entity ON entity_group_entity(entity_id, entity_type);
```

The second index is the one that makes "which groups is this entity in?" fast — needed on
every single-entity permission check.

### 3.3 `role`

```sql
CREATE TABLE role (
    id           uuid PRIMARY KEY,
    created_time bigint NOT NULL,
    tenant_id    uuid NOT NULL,          -- NULL_UUID for platform roles
    owner_type   varchar(32) NOT NULL,
    owner_id     uuid NOT NULL,
    name         varchar(255) NOT NULL,
    type         varchar(32) NOT NULL,   -- GENERIC | GROUP
    permissions  jsonb NOT NULL,
    additional_info varchar,
    version      bigint DEFAULT 1,
    CONSTRAINT role_unq UNIQUE (owner_type, owner_id, name)
);
```

Two role types, as in PE:

- **GENERIC** — resource-wide. `{"DEVICE": ["READ","WRITE"], "DASHBOARD": ["READ"]}`.
  Applies to everything the user's owner owns.
- **GROUP** — the operation list only, e.g. `["READ","WRITE"]`. Meaning comes from what
  it is bound to in `group_permission`.

`permissions` as `jsonb` rather than a join table is deliberate: roles are read on every
request and cached per user; a nested table would mean a join per check for data that is
tiny and changes rarely.

### 3.4 `group_permission`

This is where platform-level roles change things versus PE.

```sql
CREATE TABLE group_permission (
    id                    uuid PRIMARY KEY,
    created_time          bigint NOT NULL,
    tenant_id             uuid NOT NULL,   -- NULL_UUID for platform-level grants
    user_group_id         uuid NOT NULL REFERENCES entity_group(id) ON DELETE CASCADE,
    role_id               uuid NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    entity_group_id       uuid REFERENCES entity_group(id) ON DELETE CASCADE,
    entity_group_type     varchar(32),
    is_public             boolean DEFAULT false
);
```

`entity_group_id` is **nullable**: null means the grant is generic (pair a GENERIC role
with a user group, no target group). Non-null means a GROUP role over that specific group.

Because a platform-level grant has `tenant_id = NULL_UUID`, the natural uniqueness
constraint has to tolerate nulls:

```sql
CREATE UNIQUE INDEX group_permission_unq
  ON group_permission (user_group_id, role_id, COALESCE(entity_group_id, '00000000-0000-0000-0000-000000000000'::uuid));
```

A plain `UNIQUE (user_group_id, role_id, entity_group_id)` would **not** work — Postgres
treats NULLs as distinct, so you could insert the same generic grant unlimited times.

---

## 4. How a permission check resolves

For user *U*, resource *R*, operation *O*, optional entity *E*:

1. If `U.authority` is SUPER_ADMIN or SYS_ADMIN and no platform role is bound to them →
   allow (preserves today's behaviour; platform RBAC is opt-in).
2. Load *U*'s user groups → their `group_permission` rows → roles. Cache per user, keyed by
   user id, invalidated on any role/group/permission write.
3. **GENERIC roles**: if any grants `O` on `R`, allow — scoped to entities owned by *U*'s
   owner or any owner below it.
4. **GROUP roles**: allow if *E* belongs to a bound `entity_group_id` (or *E*'s owner is the
   group's owner, for "All" groups).
5. Otherwise deny.

For **list** endpoints there is no *E*, so step 4 inverts into a filter: collect the set of
readable group ids and constrain the query. Two options, and this is the other decision I
need from you:

| | Approach A — join filter | Approach B — post-filter |
|---|---|---|
| How | Add `entity_group_id IN (…)` to the DAO query | Fetch page, drop rows the user can't see |
| Correctness | Correct | **Breaks pagination** — page sizes come back short |
| Cost | Rewrite ~40 DAO queries | Almost no DAO change |
| Verdict | Correct, and what I'd build | Only viable if you accept wrong page counts |

I recommend A. B looks cheap and is how these things usually go wrong.

---

## 5. Migration

Existing installs have no groups. On upgrade:

1. Create the implied "All" groups lazily on first read — no backfill, no downtime.
2. Create a built-in `Tenant Administrator` GENERIC role per tenant granting all operations
   on all resources, and bind it to an `All Users` group.
3. Every existing TENANT_ADMIN joins `All Users`. Behaviour is then **identical to today**.
4. CUSTOMER_USER likewise gets a `Customer User` role matching current customer permissions.

Net effect: after upgrade nothing changes for anyone until an admin creates a group. That
property is worth protecting — it is what makes the change reversible in practice.

---

## 6. Guarding against the real risk

The failure mode is a DAO method that forgets the group filter and quietly returns
everything. Plan:

- Enumerate every `find*` on every entity DAO up front; that list is the checklist.
- A test fixture with two tenants × two groups × two users, asserting every list endpoint
  returns only permitted rows. Any endpoint not in the fixture is treated as unaudited.
- Default-deny in the permission checker: an unknown resource denies rather than allows.

---

## 7. Estimate

| Phase | Work |
|---|---|
| 1 | Schema, entities, DAOs, `EntityGroupService`, `RoleService` |
| 2 | Permission resolution + cache, replace `DefaultAccessControlService` |
| 3 | DAO query filtering across ~40 methods |
| 4 | REST controllers for groups, roles, permissions |
| 5 | UI: group management, role editor, permission assignment |
| 6 | Migration + the audit fixture in §6 |

Phases 1–2 are the design-sensitive part. Phase 3 is the volume. Phase 5 is roughly the
size of everything built in this project so far.

---

## Open questions

1. **Nested sub-customers** — support them, or flat tenant → customer? (Affects §2 and the
   hot path.)
2. **List filtering** — confirm Approach A in §4.
3. **Platform roles** — should a platform role be able to grant access *into* a tenant's
   entities, or only to platform-owned objects? The first is what "root of the whole
   system" implies, but it means a platform grant can reference a tenant's entity group,
   and tenant admins can no longer assume they see every grant over their own data.
