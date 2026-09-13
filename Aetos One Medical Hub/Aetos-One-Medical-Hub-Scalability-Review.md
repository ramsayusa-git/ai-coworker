# Aetos One Medical Hub — Scalability Review

**Companion to:** the main architecture, AI agent, and plugin architecture documents
**Version:** 1.1
**Date:** 13 September 2026
**Question answered:** is this design scalable, and what are the pros and cons?
**Status:** all five recommended changes, plus three secondary ones, have been applied to the architecture documents — see §7.

---

## 0. Verdict up front

**Yes — to about 1 million patients, 500 orgs and 10 000 consults/day, on the design as written, with no re-architecture.** That is roughly a top-20 Indian telemedicine operator. Getting past it needs three specific changes named in §5, all of which the current design leaves room for.

**But the thing that breaks first is not the database and not the API — it is Jitsi bandwidth, and it breaks around 1 500 concurrent participants.** Most of this review's cons are cost and operational load, not architectural dead ends.

**The most under-planned table is `access_log`, not `measurement`.** It will be the largest object in the system within a year.

---

## 1. Scale tiers used in this review

| Tier | Orgs | Patients | Consults/day | Peak concurrent consults | Where you are |
|---|---|---|---|---|---|
| **T1 — Pilot** | 1–20 | 50 k | 200–500 | ~40 | Phases 0–5 |
| **T2 — Regional** | 100–500 | 1 M | 10 000 | ~800 | The realistic 2–3 year target |
| **T3 — National** | 5 000+ | 10 M | 100 000 | ~8 000 | Needs the §5 changes |

---

## 2. What scales well — and why

### 2.1 `org_id` is on every clinical row

This is the single most consequential decision in the design. Every tenant table carries `org_id`, RLS keys off it, and every index leads with it. That means:

- **The system is shard-ready without a rewrite.** When one Postgres primary is no longer enough, `org_id` is the shard key and no query has to change shape — an org's data never spans shards because orgs never share clinical records by design.
- Query plans stay narrow: a 10 M-patient table behaves like a 20 k-patient table for any single org, because the leading index column eliminates 99.9% of rows before anything else runs.

Most multi-tenant systems discover at T2 that some table lacks a tenant column and needs a migration with downtime. This one does not have that table.

### 2.2 Stateless API, separate realtime gateway

The Core API holds no session state — JWT + Redis. It scales horizontally by adding pods, linearly, with no coordination. The realtime gateway is separated precisely because its scaling curve is different: it is bound by concurrent connections and memory, not CPU. Scaling them together would mean over-provisioning one to serve the other.

Node handles 50–100 k concurrent WebSockets per process. At T2's ~1 600 concurrent participants, the gateway is running at ~2% of one node's capacity. **This component will never be your problem.**

### 2.3 Blobs are not in the database

ECG waveforms, prescription PDFs, lab scans and recordings go to MinIO/S3. A 30-second single-lead ECG at 250 Hz is ~15 KB; 1 000 sessions/day is 15 MB/day — trivial as objects, and catastrophic as Postgres `bytea` at scale (bloated WAL, slow backups, unusable vacuum). Object storage scales to petabytes by adding disks, and restores don't block the database.

### 2.4 Time-series data is in the right shape

`measurement`, `access_log` and `dose_event` are Timescale hypertables: automatic time partitioning, compression after 30 days (typically 10–20× on this kind of data), and continuous aggregates so a "last 12 months of BP" chart reads a pre-computed rollup instead of scanning a year of rows.

Volume check at T2:

| Source | Rows/day | Rows/year |
|---|---|---|
| Consult readings (10 k consults × 3) | 30 k | 11 M |
| Ambulatory home monitoring (50 k active patients × 1/day) | 50 k | 18 M |
| Dose events (200 k active schedules × 2/day) | 400 k | 146 M |
| **`access_log`** (10 k consults × ~50 clinical reads) | **500 k** | **180 M** |

Postgres handles hundreds of millions of partitioned, compressed rows comfortably. **Note what the table above actually says: the audit trail is bigger than all the clinical data combined.** That is normal for healthcare and it is where the cost lands.

### 2.5 Event-driven plugins decouple the failure domains

A plugin cannot block the core: events are asynchronous, at-least-once, retried, and a dead plugin trips a circuit breaker instead of stalling a consult. Adding an integration adds load to a queue, not latency to a clinician's click. The six synchronous hooks are the only exceptions, which is exactly why the plugin document caps them at six.

### 2.6 The declarative plugin tiers scale for free

Device-packs, automations, report-packs and themes are data. They cache at the edge, execute no code, and cost nothing per org. An org enabling 40 automations adds 40 rows and some rule evaluation — not 40 processes. **Every capability pushed from a container plugin into a declarative pack is a permanent reduction in the scaling problem.**

### 2.7 Reads can be offloaded cleanly

Reporting, analytics, the Insights agent and bulk export all run against read replicas and RLS views. The write path never contends with a hospital chain running a quarterly report over 2 M rows.

---

## 3. What does not scale well — the honest list

### 3.1 Jitsi bandwidth is the first and most expensive wall 🔴

This is the real constraint and it arrives earlier than anything else.

At T2: 10 000 consults/day × 20 min × 2 participants = 400 000 participant-minutes/day. Compressed into an 8-hour clinic day, that is **~830 concurrent participants on average and ~1 600 at peak**.

- A single JVB comfortably serves 300–500 participants before packet loss becomes visible. So T2 needs **4–6 JVBs with Octo (cascaded bridges)**, not one.
- At ~1.5 Mbps per stream, 1 600 participants is **~2.4 Gbps sustained egress**. On typical Indian VPS egress pricing this is the single largest infrastructure line item in the whole system — larger than compute and storage combined.
- Video quality degrades *before* it fails, so you will get "the call was choppy" complaints long before a bridge falls over. That is a support-load problem as much as a capacity one.

**Mitigations:** cap video to 360p for consults (clinically sufficient, halves bandwidth), enable last-N and simulcast aggressively, audio-only fallback as a first-class mode, regional JVBs near the patients, and consider committed-bandwidth hosting rather than per-GB egress before you reach T2.

### 3.2 `access_log` growth 🔴

180 M rows/year at T2, growing faster than every clinical table, retained 3 years by policy. Uncompressed and unpartitioned this becomes a multi-hundred-GB table that slows backups, bloats the WAL and makes the "who viewed my record" feature — a DPDP selling point — unusably slow.

**Mitigations (design them in now, not later):** monthly partitions, Timescale compression after 7 days, a separate tablespace on cheap disk, aggregate roll-ups for the patient-facing view, and export-to-object-storage for anything older than 12 months with a query path that reads it back on demand.

### 3.3 AI cost scales linearly with consults, and nothing amortises it 🟠

₹10–20 per consult is fine at 2–5% of a ₹300–800 fee. But:

| Volume | AI cost/month |
|---|---|
| T1 (500/day) | ₹1.5–3 lakh |
| T2 (10 k/day) | **₹30–60 lakh** |
| T3 (100 k/day) | ₹3–6 crore |

Infrastructure cost per consult *falls* with scale. **AI cost per consult does not.** This is the structural difference and it needs to be priced into the product, not absorbed.

**This breaks outright** if you ever pursue a high-volume/low-fee or freemium model — at a ₹100 consult fee, ₹15 of AI is 15% of revenue before a single other cost. Either AI is a paid tier, or the per-consult model changes.

**Mitigations:** prompt caching (60–80% saving, already in the design and non-optional), aggressive Haiku routing, self-hosted models for high-volume low-complexity agents (Message Composer, Adherence Coach), and hard per-org budgets enforced at the gateway.

### 3.4 RLS plus connection pooling is a real footgun 🟠

RLS driven by session GUCs (`SET app.current_org_id`) and PgBouncer in transaction-pooling mode is a classic production incident: a GUC set outside an explicit transaction leaks to the *next* tenant that borrows that connection. The failure mode is cross-tenant data exposure, and it is silent.

**The rule, and it is not optional:** every request opens an explicit transaction, issues `SET LOCAL`, does its work, commits. `SET LOCAL` is transaction-scoped and safe under transaction pooling; plain `SET` is not. This needs a Prisma middleware that makes it impossible to issue a query outside such a transaction, plus a test that proves a leaked GUC fails the build.

Secondary cost: RLS predicates are only free if every policy's columns are indexed. An unindexed RLS policy turns a point lookup into a sequential scan, and it shows up as "the app got slow" at exactly T2 scale.

### 3.5 Container sprawl: 23 agents × plugins 🟠

At 0.25 CPU / 256 MiB each, 23 agent containers idle at ~6 CPU / 6 GiB before serving a single request — and that is one replica each, with no HA. Add integration plugins and the fleet is 40+ containers to deploy, monitor, patch and pay for.

**Mitigations:** co-host low-traffic and declarative-ish agents in a shared "agent host" process (one container, many agent modules), give dedicated containers only to the heavy or latency-sensitive ones (Scribe, Live Copilot, Signal models), and scale-to-zero for anything event-triggered rather than request-path.

### 3.6 The plugin-per-org trap 🔴 — fix this in the design now

The plugin document describes per-org installation and configuration. If that is implemented as *one container per org per plugin*, the fleet is O(orgs × plugins) and dies at 50 orgs.

**The correct model, which must be explicit in the spec:** one plugin deployment serves **all** orgs; the org's configuration and scoped token are passed per invocation; the plugin holds no per-org state in memory. Per-org isolation is a *data* boundary, not a *process* boundary. The only exception is a plugin requiring an on-prem connection (hospital LDAP, local LIS), which gets a dedicated connector agent by necessity.

This is the single biggest scaling error available in the current design, and it is cheap to prevent and expensive to retrofit.

### 3.7 Single Postgres primary is a T3 ceiling 🟡

All writes go to one primary. That is correct and simple through T2 — a well-tuned Postgres on decent hardware handles several thousand writes/second, far above T2's needs. At T3 it becomes the limit.

The escape path exists (§5.1) and is unusually clean because of `org_id`, but it is a project, not a config change.

### 3.8 The global `user` table resists sharding 🟡

Everything else shards by `org_id`. `user`, `session` and `credential` are deliberately global — one human, one account, across all orgs. When clinical data shards, identity cannot shard the same way.

**Mitigation:** plan for identity to become its own service with its own database at T3. The design already isolates it as a module with no cross-module repository access, so the extraction is mechanical rather than archaeological — but do not let anyone add a foreign key from a sharded clinical table directly to `user` beyond `user_id` as a plain column.

### 3.9 Temporal is operational weight you may not need yet 🟡

Temporal is the right answer for durable, human-gated, multi-step workflows — and it is also a cluster with its own database, its own upgrade cycle and its own failure modes. At T1 with three such workflows, it is more operational load than it removes.

**Honest recommendation:** BullMQ for phases 0–4. Introduce Temporal when the count of genuinely durable human-gated workflows passes about five, or when you first lose a multi-step flow to a restart. Design the interfaces so the swap is contained — but do not run a Temporal cluster to orchestrate four jobs.

### 3.10 Synchronous hooks are latency you have given away 🟡

Six sync hooks, each with a 2-second timeout, two of them fail-closed. A third-party plugin having a bad day becomes a doctor unable to sign a prescription. The timeouts and fail modes are specified, which is the right start — but the p99 of the prescription-signing path is now partly owned by someone else's code.

**Mitigation:** a per-hook circuit breaker that trips to the declared fail mode after N consecutive slow calls, a hard cap on how many plugins may register on a single fail-closed hook (suggest: one), and hook latency on the clinical SLI dashboard next to consult join success.

---

## 4. Scorecard by component

| Component | T1 | T2 | T3 | Limiting factor |
|---|---|---|---|---|
| Core API (stateless) | ✅ | ✅ | ✅ | Add pods; linear |
| Realtime gateway | ✅ | ✅ | ✅ | Never the bottleneck |
| Postgres (writes) | ✅ | ✅ | ⚠️ | Single primary at T3 |
| Postgres (reads) | ✅ | ✅ | ✅ | Replicas |
| `access_log` | ✅ | ⚠️ | 🔴 | Needs partition + compression + archive **now** |
| Object storage | ✅ | ✅ | ✅ | Add disks |
| Redis | ✅ | ✅ | ✅ | Cluster mode at T3 |
| **Jitsi** | ✅ | ⚠️ | 🔴 | **Bandwidth and JVB count — first wall** |
| AI agent fleet | ✅ | ⚠️ | 🔴 | Cost, then container sprawl |
| Plugin runtime | ✅ | ✅ | ⚠️ | Only if multi-tenant per deployment |
| Declarative packs | ✅ | ✅ | ✅ | Free |
| Android apps | ✅ | ✅ | ✅ | Offline-first already |

---

## 5. What T3 actually requires

Three changes. None of them invalidate work done before; all three are enabled by decisions already made.

### 5.1 Shard clinical data by `org_id`

Citus, or application-level routing with a directory service mapping `org_id → shard`. Clean here because no query crosses orgs. Estimated effort: 6–10 weeks, and it is a one-time cost.

### 5.2 Extract identity into its own service and database

`user`, `credential`, `session`, and the membership index. Everything else keeps a plain `user_id` column. Token issuance and validation move behind an interface the rest of the system already uses.

### 5.3 Regionalise the media plane

JVBs near the patients, Octo cascading between regions, and consult routing that prefers a local bridge. This is also the latency fix, not just the capacity fix.

---

## 6. Pros and cons, compressed

### Pros

1. **`org_id` everywhere** — shard-ready from day one; the migration everyone else needs at T2 is already done.
2. **Stateless API + separate realtime plane** — the two components with different scaling curves are scaled separately.
3. **Blobs outside the database** — backups, vacuum and WAL stay sane at any volume.
4. **Timescale for time-series** — compression and continuous aggregates mean charts stay fast as history grows.
5. **Event-driven plugin boundary** — integrations add queue depth, not clinical-path latency.
6. **Declarative plugin tiers** — device-packs and automations scale at zero marginal cost, and decouple hardware support from app releases.
7. **Modular monolith with hard boundaries** — one deployable to operate now, with a clean extraction path per module later. You avoid paying distributed-systems tax at T1 for benefits you only need at T3.
8. **Offline-first mobile** — client load is absorbed at the edge; the outbox pattern means a backend outage is a delay, not a data loss.
9. **RLS at the database** — scaling the team does not scale the risk of a missed `WHERE org_id = ?`.
10. **Read/write separation available** — heavy reporting never contends with clinical writes.

### Cons

1. **Jitsi bandwidth is the first wall** — ~2.4 Gbps and 4–6 JVBs at T2; the largest infra line item and the one that degrades visibly before it fails.
2. **`access_log` outgrows everything** — 180 M rows/year at T2; must be partitioned, compressed and archived by design, not by incident.
3. **AI cost is linear per consult and never amortises** — ₹30–60 lakh/month at T2; structurally incompatible with a low-fee or freemium model.
4. **RLS + transaction pooling is a silent cross-tenant footgun** — `SET LOCAL` inside an explicit transaction, enforced by middleware and proven by a test, or it will eventually leak.
5. **Container sprawl** — 23 agents plus integrations is 40+ containers to run and pay for; needs co-hosting and scale-to-zero.
6. **Plugin-per-org would be fatal** — must be one multi-tenant deployment per plugin; fix the spec before anyone implements it.
7. **Single Postgres primary caps T3** — escape path is clean but is a 6–10 week project.
8. **Global `user` table resists sharding** — identity must become its own service at T3.
9. **Temporal is real operational weight** — premature below ~5 durable workflows.
10. **Sync hooks put third-party latency on the prescribing path** — cap to one plugin per fail-closed hook and circuit-break hard.
11. **Three products' worth of surface area** — the largest scaling risk is not technical: it is a small team maintaining device telemetry, telemedicine and practice management simultaneously.

---

## 7. Status — all five changes applied (13 Sep 2026)

| # | Change | Applied in |
|---|---|---|
| 1 | Plugins are one multi-tenant deployment serving all orgs; `tenancy:` in the manifest; `dedicated` only for on-prem connectors | Plugin doc v1.1 §0 rule 4, §3.1, manifest |
| 2 | `access_log` sized for 180 M rows/yr — monthly chunks, compression at 7 days, own tablespace, 12-month hot / Parquet cold, continuous aggregate for the patient view, batched async writes, explicit not-logged list | Main doc v1.1 §7.6 |
| 3 | `SET LOCAL` inside an explicit transaction, enforced by a Prisma wrapper, proven by a pool-leak test; RLS columns indexed with `org_id` leading | Main doc v1.1 §6.5 |
| 4 | 360p cap, simulcast, last-N, first-class audio-only with auto-degrade, recording audio-only by default; multi-JVB with Octo in the topology; egress modelled before hosting is bought | Main doc v1.1 §8.5, §12 |
| 5 | Temporal deferred — BullMQ + `workflow_run` behind a `WorkflowEngine` interface through phase 4, with named triggers for the swap | AI agent doc v1.1 §1.4, §3 |

Three further items from §3 were applied at the same time:

| Item | Applied in |
|---|---|
| Container sprawl — three hosting classes (`shared` agent host / `dedicated` / `inference`), scale-to-zero; ~5–7 containers instead of 23 | AI agent doc v1.1 §1.7 |
| AI cost as a priced tier with per-org gateway budgets, cost-per-consult as an SLI, self-hosting path for high-volume agents | AI agent doc v1.1 §7.1 |
| Sync hooks — one plugin max on any fail-closed hook, per-hook circuit breaker, hook latency on the clinical SLI dashboard, list closed at six | Plugin doc v1.1 §4.2 |

Still open by choice, to be done only when scale demands it: `org_id` sharding, identity extracted to its own service, regional JVBs (§5). The main doc now carries the two invariants that keep those cheap — no cross-org query, and no clinical foreign key into the global `user` table.

---

## 8. The five things to change in the design right now

Cheap today, expensive later. In priority order:

1. **Specify plugins as one multi-tenant deployment serving all orgs**, config passed per invocation. Write it into the plugin document as a hard rule.
2. **Design `access_log` for its real volume from the first migration** — monthly partitions, compression policy, separate tablespace, archive job.
3. **Make `SET LOCAL` inside an explicit transaction structurally impossible to bypass**, with a test that fails the build on a leaked GUC.
4. **Cap consult video at 360p with audio-only fallback**, and model bandwidth cost before committing to a hosting plan.
5. **Drop Temporal from phases 0–4.** Use BullMQ; keep the interface swappable.

---

*Prepared for Ramsay, Aetos Tech Labs LLP. Fourth of four architecture documents for the Medical Hub.*
