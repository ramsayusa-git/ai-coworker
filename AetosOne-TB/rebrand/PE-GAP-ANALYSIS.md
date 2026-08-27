# Aetos One Cloud vs ThingsBoard PE — gap analysis

Compared against ThingsBoard's **published** PE feature comparison (thingsboard.io, fetched
2 Aug 2026), not against PE source — PE is closed, so this measures against what ThingsBoard
advertises, which is the fair yardstick for "are we at parity".

Base: ThingsBoard **CE v4.3.1**. Everything marked *built* was added in this project.

---

## 1. Scoreboard

| PE feature | Status | Notes |
|---|---|---|
| **White-labeling** | ✅ Built | Logo, colours, app title, favicon; platform → tenant inheritance; login page selected by host name |
| **Advanced RBAC** | ✅ Built | Entity groups, GENERIC + GROUP roles, grants, enforcement, row scoping on all six groupable types, admin UI. Residual gaps in §2 |
| **Entity groups** | ✅ Built | CRUD, membership, implicit "All" group, admin UI |
| **RBAC-driven menu** | ✅ Built | Users only see menu entries they hold a READ grant for. Presentation only — endpoints stay enforced |
| **Custom menu** | ✅ Built | Rename, re-icon, reorder, hide, plus external links; platform → tenant, edited from Settings → Customization |
| **Custom translation** | ✅ Built | Per-locale key overrides merged into the loaded language; same storage and inheritance pattern |
| **CSV/XLS widget export** | ✅ Built | Exports the data the widget is showing, from the widget header |
| **Scheduler** | ✅ Built | Attribute writes, telemetry posts **and server-side RPC**, once / interval / cron, with the last outcome shown per event |
| **Reporting** | 🟡 Partial | **Telemetry → CSV/Excel built**, on demand, with aggregation. Dashboard → PDF/image is not: it needs a headless renderer running as its own service |
| **Platform integrations** | 🟡 Partial | Outbound already in CE (MQTT, Kafka, RabbitMQ, AWS, GCP, REST rule nodes). **Inbound webhooks and an external MQTT broker subscriber built**, with a declarative payload converter. Per-protocol runtimes for LoRaWAN/Sigfox/AWS IoT/Azure IoT are not |
| **Device payload codec library** | ❌ Not built | But see §3 — the library itself is Apache-2.0, so this is packaging, not engineering |
| **Secrets storage** | ✅ Built | AES-256-GCM vault, per tenant. Values are write-only — there is deliberately no API that reads one back |
| **Solution templates** | ❌ Not built | Pre-packaged dashboards/rule chains. The demo seeder covers the same ground informally |
| **Multi-level sub-customers** | ❌ Deliberately skipped | Flat tenant → customer; decision recorded in RBAC-DESIGN.md |
| **SSO / OAuth2** | ✅ Already in CE | PE's table lists this as PE-only, but CE 4.3.1 ships `OAuth2Controller`, `DomainController` and OAuth2 client management. **The marketing table overstates this gap.** |
| Audit logging | ✅ Already in CE | `AuditLogController` present |
| Rule engine, dashboards, OTA, device mgmt, protocols, gateway, clustering, AI nodes | ✅ Already in CE | Not differentiators |

**Beyond PE.** Three things here have no PE equivalent:

| Feature | What it is |
|---|---|
| `SUPER_ADMIN` | An authority above `SYS_ADMIN`, with RBAC roles ownable at the **platform** level. PE scopes roles to tenants only |
| **MCP server** | Claude and other AI clients can read and manage the platform — devices, telemetry, alarms, dashboards, provisioning, access control. Acts through the REST API as a real user, so RBAC applies unchanged. Writes need an explicit opt-in *and* an administrative account |
| **Inbound webhooks** | A third-party system POSTs its own payload shape to a generated URL; a field mapping turns it into telemetry or attributes, creating the device on first delivery |

---

## 2. RBAC — what is actually missing

RBAC is the closest to parity and the easiest to overstate, so precisely:

| Capability | State |
|---|---|
| Entity groups, roles, grants, admin UI | Done |
| GENERIC role enforcement (resource × operation) | Done, enforced everywhere `accessControlService` is called |
| Resource-level gating on list endpoints | Done — 27 endpoints across 7 controllers |
| Row-level scoping for GROUP roles | Done for all six groupable types: devices, assets, dashboards, edges, entity views, customers |
| Scoping on the `*Infos` endpoints the UI actually calls | Done — see the note below |
| Menu hidden to match grants | Done |
| `textSearch` / custom sort under GROUP scoping | Done — the scoped query joins the entity's own table, whitelisted per type |
| Multi-level sub-customer hierarchy | Skipped by decision |
| Per-group column customisation, actions from group view | **Pending** — PE's group admin UX |

Two behaviours worth recording, both confirmed by `verify_group_scoping.py` (10/10):

- With **no** grant for a resource, the request is denied outright (403) rather than
  returning an empty list — stricter, and the better default.
- With a grant for one group, the list shows exactly that group, at the right page size and
  with the right `totalElements`. Post-query filtering would fail that assertion.

**A gap this testing found.** Scoping was originally applied only to `/tenant/devices`,
`/tenant/assets` and their siblings — but the UI's list pages call the `*Infos` variants
(`/tenant/deviceInfos`, `assetInfos`, `entityViewInfos`, `edgeInfos`), which were **not**
scoped. A GROUP-restricted user therefore saw the entire tenant on screen while the API they
never call behaved correctly. Fixed in all four controllers; Dashboard and Customer were
already correct because their single scoped endpoint is the one the UI uses. Worth stating
plainly because it is the failure mode this kind of feature is most prone to: the enforced
path and the used path drifting apart.

---

## 3. What remains, ranked

**Cheap, not yet done**

1. **Payload codec library.** `github.com/thingsboard/data-converters` is Apache-2.0 — the
   400+ codecs can be used directly. A packaging job, but it needs network access to fetch
   the repository, which this environment does not have.

**Expensive, and genuinely remaining**

2. **Dashboard → PDF rendering** — needs a headless browser rendering the real dashboard
   (PE runs a Node/puppeteer service). Not a code-only task: it is a second service to
   deploy, secure and operate. Telemetry → CSV/Excel is built and covers most of what
   "reporting" is actually asked for.
3. **More integration protocols** — LoRaWAN, Sigfox, AWS IoT and Azure IoT each need their
   own client and semantics. The framework they would plug into now exists: an integration
   record, a reconciling runtime, a payload converter and a secrets vault, all proven by the
   MQTT subscriber. Each additional protocol is now incremental rather than foundational.
4. **JavaScript payload converters** — PE runs uploaded JS. Ours is a declarative field
   mapping, which handles the common shapes without needing a sandbox, CPU limits and a way
   to stop a runaway converter. Worth revisiting only if a real payload cannot be expressed
   as a mapping.
5. **Multi-level sub-customers** — only if the business needs resellers-of-resellers.

---

## 4. Verification

Every feature here has a script that drives it through the REST API against a running
server, because that is the only level at which inheritance, authority splits and row
scoping actually get exercised.

| Script | Covers | Result |
|---|---|---|
| `verify_white_labeling.py` | Platform → tenant branding, login by host | 8/8 |
| `verify_super_admin.py` | The authority above SYS_ADMIN | 3/3 |
| `verify_rbac.py` | Resource-level enforcement | 18/18 |
| `verify_rbac_migration.py` | Migration is behaviour-neutral | 10/10 |
| `verify_group_scoping.py` | Row scoping, with exact pagination | 10/10 |
| `verify_customization.py` | Guided navigation, translation, menu | 14/14 |
| `verify_scheduler.py` | Schedule maths *and* a real executor run | 8/8 |
| `verify_group_search_sort.py` | Search and sort under group scoping | 10/10 |
| `verify_webhooks.py` | Inbound delivery, mapping, and the security boundary | 12/12 |
| `verify_vault_reports_mqtt.py` | Vault secrecy at rest, report output, MQTT integration | 17/17 |
| `mcp-server/test/smoke-test.js` | MCP protocol and the write gate | 9/9 |
| `mcp-server/test/provisioning-test.js` | Provisioning, read back from the platform | 12/12 |

---

## 5. Honest summary

For a **white-label multi-tenant IoT platform**, everything that gates that business is built
and verified: white-labeling, RBAC with row scoping, permission-driven navigation,
tenant-level menu and translation overrides, data export, scheduling with RPC, inbound
webhooks, an external MQTT subscriber, an encrypted secrets vault, telemetry reporting, and
an MCP server for AI-driven operation.

Two things remain genuinely undone, and neither is a matter of writing more of the same code:

**Dashboard-to-PDF.** Anything short of rendering the real dashboard in a real browser
produces a document that does not match what the customer sees. That is a separate service,
not a module.

**Protocol breadth.** LoRaWAN, Sigfox, AWS IoT and Azure IoT each carry their own semantics.
The difference from the start of this project is that the *framework* now exists and is
proven end-to-end by the MQTT subscriber — integration record, reconciling runtime, payload
converter, credential vault. Adding a protocol is now incremental work against a working
skeleton rather than building the skeleton.

One caveat worth carrying forward: the `*Infos` scoping gap in §2 was invisible until a test
drove the endpoint the UI actually calls. Any future feature that enforces something should
be tested against the path the product uses, not the path that seemed canonical.

---

Sources: [PE product page](https://thingsboard.io/products/thingsboard-pe/),
[CE vs PE](https://thingsboard.io/ce-vs-pe-diff/),
[PE roles docs](https://thingsboard.io/docs/pe/user-guide/roles/),
[PE white labeling docs](https://thingsboard.io/docs/pe/user-guide/white-labeling/),
[PE integrations docs](https://thingsboard.io/docs/pe/user-guide/integrations/)
