# Aetos One Medical Hub — Open-Source Composition & Feature-Gap Build Plan

**Companion to:** the main architecture, AI agent, plugin architecture, scalability review and competitive landscape documents.
**Version:** 1.0
**Date:** 13 September 2026
**Answers:** which missing features the competitive analysis exposed, which open-source projects fill them, and how each one plugs into the plugin/add-on architecture without contaminating your core.

> **Every licence below was read from the project's LICENSE file or licence page.** Anything that could not be confirmed is marked **⚠️ unverified** and must be checked before it is written into code. Two findings in §1 change decisions already made in the existing architecture documents.

---

## 1. Three findings that change existing decisions

### 1.1 🔴 MinIO is archived. It must come out of the architecture today.

**The `minio/minio` repository was archived by its owner on 25 April 2026 and is read-only.** The README states verbatim: *"THIS REPOSITORY IS NO LONGER MAINTAINED."*

Timeline: June 2025 the admin UI was stripped from Community Edition → December 2025 maintenance mode → February 2026 EOL-toned README → **25 April 2026 archived**. The licence did not change (still AGPLv3); what ended is **maintenance and official binaries**. Community edition is now source-only — build from Go yourself — and legacy binaries will never be patched. MinIO now directs users to the commercial AIStor tiers.

**Two problems, either of which is disqualifying:**
1. **AGPLv3 network copyleft on the store holding patient recordings and ECG waveforms.**
2. **An unmaintained, unpatched object store for protected health data.** Every future CVE is yours to find and fix, in Go, forever.

**Decision: MinIO is removed.** Replacement, in order of preference:

| Option | Licence | When |
|---|---|---|
| **Managed S3-compatible storage in India** — AWS S3 Mumbai `ap-south-1`, or an Indian provider for residency comfort | n/a | **Default.** Removes the licence question, the patching burden and the durability engineering in one move. Self-hosting object storage is not where a small team should spend scarcity |
| **SeaweedFS** | **Apache-2.0** | If self-hosting is mandatory (a hospital demands on-prem) — permissive and maintained |
| **Garage** | AGPLv3 | Actively maintained and lightweight, but carries the same AGPL posture as MinIO — only if SeaweedFS does not fit |

The S3 API surface is unchanged either way, so this is a configuration and ops decision, not a code rewrite. **Do it before any code is written.**

### 1.2 🟠 TimescaleDB: every feature you chose it for is outside Apache-2.0

TimescaleDB (now **TigerData**) splits into two editions, and the split lands precisely on the features the architecture depends on:

| Feature | Edition |
|---|---|
| `create_hypertable`, `show_chunks`, `drop_chunks`, `time_bucket` | ✅ Apache-2.0 |
| **Compression / columnstore** | 🚨 **TSL only** |
| **Continuous aggregates** (entire feature set) | 🚨 **TSL only** |
| **Retention policies** | 🚨 **TSL only** |
| Advanced hyperfunctions (`time_bucket_gapfill`, percentile approx) | 🚨 **TSL only** |

The Apache tier is close to bare partitioning. **The `access_log` compression and continuous-aggregate design in main-doc §7.6, and the `measurement` compression, are all TSL features.**

**Is that a problem?** Probably not for you. TSL permits self-hosted use and modification; what it forbids is offering *TimescaleDB itself* as a service — verbatim: *"You cannot sell TimescaleDB Community Edition as a service."* You are selling telemedicine, not a time-series database, so you are almost certainly inside the grant. The clause is aimed at DBaaS providers.

**But go in with eyes open:** TSL is a **source-available proprietary licence, not open source**; it can change; and if you ever expose raw time-series query access as a customer-facing feature, the line blurs. **Keep the fallback documented:** plain Postgres declarative partitioning + object storage for raw waveforms + materialised views refreshed on a schedule is licence-free and a small team can live with it.

### 1.3 🟠 Jitsi's recording and transcription paths are worse than assumed

Your decision to use self-hosted Jitsi for A/V stands — it is Apache-2.0, it works, and you already run it. But two properties of the recording path were not in the architecture:

- **Jibri supports exactly one recording at a time per instance.** Verbatim from the project: *"Only one recording at a time is supported on a single jibri."* It works by launching **headless Chrome in a virtual framebuffer and encoding with ffmpeg** — so N concurrent recorded consultations means N CPU-bound Jibri instances. At any real volume this is the **single largest cost driver** in a recorded-telemedicine deployment. It reinforces the existing decision to default recording off and audio-only where enabled.
- **Jibri only works with a full Jitsi Meet frontend.** Verbatim: *"Using a different frontend won't work."* Your clinician web console **is** a custom frontend. So the moment you build the consult UI you intended, Jibri recording breaks.
- **Jibri does not transcribe.** Transcription is **Jigasi**'s job, and it targets Google Cloud Speech / Vosk. The open path to an ambient scribe is *"Jigasi plumbing plus bring your own ASR"* — a connector you build.

**Decision: Jitsi keeps the A/V media plane (D2 unchanged). The scribe audio tap does not go through Jibri or Jigasi.** Two viable paths, and you already own the infrastructure for the better one:

| Path | How | Verdict |
|---|---|---|
| **LiveKit for the scribe audio path** — `livekit/livekit`, `livekit/egress`, `livekit/agents`, all **Apache-2.0** | The `agents` framework is purpose-built for a server-side participant that receives the audio stream and pipes it to your ASR. Works with a custom frontend. **You already run LiveKit boxes.** | **Recommended** |
| Custom audio-tap participant in Jitsi | A headless participant joining the room and forwarding audio to your ASR service | Workable, more code, all yours to maintain |

This is not a reversal of D2 — it is recognising that *media transport* and *programmable audio access* are different jobs, and Jitsi is only good at the first.

---

## 2. The licence policy — one rule, four tiers

This is the rule that decides every adoption below. Write it into the engineering handbook.

> **The kernel and every first-party plugin stay proprietary. Copyleft code may run in the system, but only as a separate process reached over a network protocol — never linked, never forked into your build, never sharing a container.**

| Tier | Licences | What you may do | Examples in this plan |
|---|---|---|---|
| **T1 — Free to embed** | MIT, Apache-2.0, BSD, PostgreSQL Licence | Link, vendor, fork, ship inside your own binaries | Medplum, HAPI FHIR, NHA ABDM-wrapper, Keycloak, LiteLLM, pgvector, NeuroKit2, ONNX Runtime, IndicTrans2, Sarvam-M, Whisper, LiveKit |
| **T2 — Embed with file-level obligations** | MPL-2.0 | Embed and keep your own files proprietary; publish changes to *their* files | OpenMRS, OpenELIS Global 2, OpenHIM |
| **T3 — Arms-length only** | GPL-3.0, AGPL-3.0 | Separate container, separate process, REST/DICOM only. No linking, no shared build, no forking into your repo | Orthanc, Bahmni |
| **T4 — Do not adopt** | SSPL, BSL, TSL-as-product, proprietary-after-fork, unmaintained | — | Restate (BSL), ParadeDB (AGPL in your datastore), Mirth 4.6+ (closed), MinIO (archived + AGPL) |

**Three traps worth naming explicitly, because they catch teams:**
1. **Gating is not licensing.** IndicConformer and pyannote weights are commercially usable (MIT and CC-BY-4.0) but sit behind HuggingFace click-through gates. Your CI cannot pull them anonymously. **Mirror every model weight into your own artifact store on day one.**
2. **The licence that matters is the one on the weights, not the toolkit.** NVIDIA NeMo is Apache-2.0; its checkpoints frequently are not.
3. **An AGPL Postgres extension is a question mark on your core datastore.** There is genuine legal debate about whether querying it taints your app. "Arguably safe under AGPL" is not a position to hold during due diligence or an acquisition.

---

## 3. Feature gaps from the competitive analysis — and who fills them

Ten vendors in the landscape ship things the architecture did not cover. Here is each gap, and whether it is bought, adopted or built.

| # | Missing feature | Who has it | Fill |
|---|---|---|---|
| 1 | **LIS / lab workflow + analyser integration** | MocDoc, DocPulse, KareXpert, CrelioHealth, Attune | **Adopt OpenELIS Global 2** (MPL-2.0, FHIR R4, Docker) as a `clinical-module` plugin |
| 2 | **RIS / PACS / DICOM imaging** | KareXpert, Plus91, Attune | **Adopt Orthanc** (T3, arms-length over REST/DICOM) as an `integration` plugin |
| 3 | **Pharmacy + inventory + GST billing** | MocDoc, DocPulse, Healthray, Eka Care | **Build.** Indian GST invoicing and clinic pharmacy flows are small, local and specific — Odoo (via Bahmni) is far more machinery than the job needs |
| 4 | **IPD / ward / OT management** | KareXpert, Healthray, MocDoc, Bahmni | **Defer.** This is the hospital segment; do not enter it in v1. If forced, OpenMRS or CARE as a plugin |
| 5 | **Insurance / TPA claims + NHCX** | MocDoc, DocPulse, Attune (ClaimBook) | **Build against NHCX** — live since June 2026; NHA publishes Postman collections at `NHA-ABDM/nhcx`. Phase 7 |
| 6 | **e-Rx in Indian languages** | HealthPlix (14 langs), Arogyam.ai (4) | **Build + adopt IndicTrans2** (MIT, code *and* weights) for medication-instruction rendering |
| 7 | **WhatsApp / IVR booking** | DocPulse, MocDoc, Eka Care | **Build as `integration` plugins.** You already run Aetos One Chat — it becomes the WhatsApp plugin |
| 8 | **Specialty templates** (dental, ophthalmology, IVF, derm) | MocDoc, Attune, Clinicea | **Build as declarative `clinical-module` packs.** Mine OpenMRS concept dictionaries and Bahmni's clinical modelling for structure |
| 9 | **Terminology: SNOMED CT, LOINC, ICD-10** | Eka Care (codification APIs) | **Adopt Snowstorm** (Apache-2.0 software, FHIR terminology API, Docker) + **LOINC** content. See §5 for the content-licence trap |
| 10 | **Analytics dashboards** (bed occupancy, OPD revenue) | Healthray, MocDoc, KareXpert | **Build as declarative `report-pack` plugins** over RLS views |
| 11 | **Corporate / insurer OPD benefits channel** | MediBuddy, Visit Health, mfine | **Product decision, not a component.** This is where private teleconsult volume actually monetises |
| 12 | **Offline clinic operation** | Bahmni (by design) | **Build.** Your Android apps are already offline-first; extend the pattern to the clinic console |
| 13 | **DPDP Consent Manager** | Nobody open-source | **Build.** Binding **14 Nov 2026**. Nothing deployable exists — see §6 |
| 14 | **Queue / token management** | MocDoc, Eka Care, Arogyam.ai | **Build.** Trivial, and Arogyam's urgency-prioritised queue is the better idea worth copying |

---

## 4. The adopted open-source catalogue — as plugins

Each entry states the licence, the plugin type from the plugin architecture, the isolation tier, and the integration pattern.

### 4.1 Clinical data and interop

**Medplum** — https://github.com/medplum/medplum — **Apache-2.0** (verified), TypeScript 87.4%, Postgres, v5.1.21 (Jun 2026), FHIR R4 REST + GraphQL, published Docker images and IaC.

*This is the single best architectural match for your stack in the entire open-source landscape, and it deserves an explicit decision rather than a silent adoption.*

| Option | Consequence |
|---|---|
| **A — Medplum as the clinical data layer (in-core)** | You inherit a mature FHIR-native, multi-tenant-aware, Apache-2.0 TypeScript backend on Postgres. Saves months. **But their data model becomes yours**, and your org/branch/care-relationship RBAC — the part the competitive analysis says is *not* your differentiator but *is* your correctness surface — has to be expressed in their access-policy system |
| **B — Own core, Medplum as the FHIR interop plugin** *(recommended)* | Your kernel keeps the tenancy, RBAC, care-relationship and device model it was designed for. Medplum runs as a containerised plugin providing the FHIR R4 surface, ABDM-facing resource shapes and the bulk-export path. Lower coupling, and you can change your mind |

**Recommendation: B, after a one-week spike on A.** The spike is cheap and the answer is genuinely not obvious from the outside — if Medplum's access policies turn out to express your care-relationship model cleanly, A saves a quarter of work. Decide from code, not from a document.

**HAPI FHIR** — https://github.com/hapifhir/hapi-fhir — **Apache-2.0** (verified), Java, v8.10.1 (Jul 2026). The reference FHIR implementation, and its **Consent Interceptors** (`IConsentService`, `ConsentOutcome`) are the only production-grade, permissively-licensed FHIR consent *enforcement* framework available. **Adopt as the fallback FHIR store and the consent-enforcement reference**, containerised — do not co-locate Java with the NestJS core.

**CARE / Open Healthcare Network** — https://github.com/ohcnetwork/care — **MIT** (verified), Python/Django, 394★, 5,176 commits, CARE Core v3.0.0 re-architected FHIR-aligned. Stewarded by the OHC Foundation, an Indian nonprofit, DPG-registered, **deployed in Indian government settings** (TeleICU, palliative, primary care), with ABDM integration in the changelog.

**The most under-appreciated project in this list.** Indian, MIT, actively developed, government-proven. **Adopt as a reference implementation to study — and as a credible `clinical-module` plugin if a government deal needs a full EMR.** Do not fork it; run it as a service.

**OpenMRS** — `openmrs-core` **MPL-2.0 w/ Healthcare Disclaimer** (verified), releases 2.8.0 and 2.7.6 both shipped within the last month. `openmrs-module-fhir2` **MPL-2.0**, v4.2.0 (Jul 2026). **`openmrs-esm-core` (the O3 frontend) is MPL-2.0 and TypeScript 92.5%, v10.0.0 (Jun 2026)** — micro-frontend architecture. **Adopt with wrapper**; O3's micro-frontends are the one piece that plugs naturally into your stack, and the concept dictionary is worth mining for specialty templates even if you never deploy the server.

**Bahmni** — the answer to your specific question. **Its licence is mixed and the core is AGPL:** `bahmni-core` **AGPL-3.0** (verified), `openmrs-distro-bahmni` **AGPL-3.0** (verified), `openmrs-module-bahmniapps` **MPL-2.0** (verified), `helm-charts` MIT, `crater` (Bahmni Lite invoicing) AGPLv3. It bundles OpenMRS + OpenELIS + Odoo + dcm4chee. Active: v1.3.0 (Oct 2025), 46 Docker images with recent updates.

**Verdict: reference only — and, optionally, arms-length as a separately deployed product.** Not a plugin inside your runtime. Three reasons: the AGPL core is a network-copyleft hazard on a commercial SaaS; a four-product Java/AngularJS/Odoo bundle is far too heavy to sit inside a NestJS plugin architecture; and its value to you is **architectural, not operational** — Bahmni's ABDM-HIP integration is documented and worked, and its clinical domain modelling is a decade of hard-won structure you can learn from for free. **Mine it. Do not embed it.** If a customer specifically wants Bahmni, deploy it beside your platform and integrate over FHIR — that is legal, clean, and honest.

**OpenHIE architecture** — https://guides.ohie.org — the layer map is a genuinely good blueprint for an ABDM-shaped system, and the mapping is almost one-to-one: **ABHA ≈ Client Registry, HFR ≈ Facility Registry, HPR ≈ Health Worker Registry, ABDM Gateway/HIE-CM ≈ the interoperability layer, Shared Health Record ≈ the longitudinal record.** **Reference only** — borrow the shape, write your own mediator in NestJS. `openhim-core-js` itself is MPL-2.0 Node but its last release was v8.5.0 (Sep 2024) and momentum is visibly slowing.

### 4.2 ABDM

**NHA ABDM-wrapper** — https://github.com/NHA-ABDM/ABDM-wrapper — **Apache-2.0** (verified from the raw LICENSE at `master/LICENSE`; one research pass could not fetch it, so **re-confirm before committing code**). Java 17 / Spring Boot / MongoDB, ships `docker-compose.yml` with a mock gateway and sample HIP/HIU apps. Implements ABHA create/verify, care-context linking, consent request/grant, data push/pull, **Scan & Share**, and FHIR conversion — i.e. **Milestones 1, 2 and 3**.

**Adopt with wrapper — as a sidecar container behind a NestJS adapter.** It is government-authored, so it tracks gateway changes you would otherwise chase. Treat its FHIR conversion as a starting point, not a finished NRCeS-compliant mapper. Its Java/Mongo footprint sits awkwardly beside Node/Postgres, which is exactly why it is a sidecar and not a library.

**Also in `NHA-ABDM`:** **UHI** (CC0-1.0, Dart, teleconsultation discovery/booking protocol — *directly relevant if you ever join the UHI network*), **nhcx** (Postman collections for the claims exchange, live June 2026), **DHP-Specs** (MIT, stale since Dec 2021), **ABDM-ABHA-APP** (skeletal).

**Third-party ABDM SDKs: avoid.** The ecosystem is thin and mostly abandoned — `abdm-ruby` stale since Oct 2024, `ABDM-Gateway-SDK` at 0★ and 6 commits. Three 2026-active projects worth watching once their licences are verified: `FHIR-Mapper` (NRCeS-standard mapping), `krama-core`, `hi-profiles` (TypeScript React components for ABDM health-information profiles). ⚠️ **licences unverified.**

### 4.3 Labs, imaging, terminology

| Component | Licence | Tier | Pattern |
|---|---|---|---|
| **OpenELIS Global 2** — `I-TECH-UW/OpenELIS-Global-2` | **MPL-2.0** (verified) | T2 | `clinical-module` plugin. Java/Spring + React, **FHIR R4 native**, Docker, releases monthly (3.2.2.0, Aug 2026). Building a real LIS yourself is months you don't need to spend |
| **Orthanc** | Core **GPLv3+**, Postgres and WebViewer plugins **AGPLv3+** | **T3** | `integration` plugin, **strictly arms-length over REST/DICOM, own container**. Commercial dual-licensing **ended permanently in Jan 2024** and UCLouvain states it never will be again. **Which plugins you enable is a legal decision, not just an ops one** |
| **dcm4chee-arc-light** | MPL **1.1** | — | **Reference only.** Enterprise-grade but a WildFly/Java-EE archive with LDAP config is too much operational surface for a small team. Pick Orthanc |
| **Snowstorm** — `IHTSDO/snowstorm` | **Apache-2.0** (badge; ⚠️ LICENSE file not read directly) | T1 | Terminology service container. v10.11.2 (Apr 2026), Docker Hub, **exposes an HL7 FHIR terminology API** over SNOMED, LOINC and ICD-10 |
| **Mirth Connect** for HL7 v2 | ⚠️ **T4** | — | **Avoid. NextGen moved Mirth to a closed commercial licence from v4.6 (19 March 2025).** The last open release, 4.5.2 (Sep 2024), will receive **no further security updates**. Write HL7 v2 handling into your own NestJS pipeline |

### 4.4 AI and biosignal

| Component | Licence | Verdict | Note |
|---|---|---|---|
| **IndicTrans2** | **MIT — code *and* weights** | **Adopt** | Cleanest Indic licence available; CTranslate2 inference path is your production route. Drives Indian-language Rx instructions and patient messaging |
| **IndicConformer 600M** | **MIT**, ⚠️ **gated on HuggingFace** | **Adopt with caution** | Best Telugu/Hindi ASR under MIT. Gate breaks unattended CI — **mirror the weights**. Serving repo (`indic-asr-api-backend`, MIT) is only 8 commits: budget engineering for the inference layer |
| **Whisper / faster-whisper / whisper.cpp** | **MIT** (code and weights) | **Adopt** | English and code-mixed English-Hindi. **Whisper's Telugu WER is poor — route Telugu to IndicConformer.** whisper.cpp runs on Android, which matters for offline |
| **Sarvam-M (24B), Sarvam 30B / 105B** | **Apache-2.0**, ungated | **Adopt** | Indic-tuned LLMs with no strings. For structured extraction into a JSON schema, these will beat rule-based medical NLP on code-mixed Indian consultation speech |
| **Sarvam Saaras ASR / Bulbul TTS** | **API-only, no open weights** | Not an OSS component | A paid vendor dependency with a data-residency question — fine, but price it as such |
| **Sarvam Shuka-1** | ⚠️ **Llama 3 Community Licence** | Caution | Not OSI-open: acceptable-use policy, 700M MAU clause, "Built with Meta Llama 3" attribution. Needs legal sign-off. It is audio-QA, not ASR |
| **pyannote.audio** (diarisation) | MIT code / **CC-BY-4.0 gated weights** | **Adopt with caution** | Commercial use permitted **with attribution — a requirement, not a courtesy**. The open model is deliberately the weaker tier below a paid product. **For a two-speaker doctor/patient consult you may not need diarisation at all** — channel separation removes this dependency entirely |
| **scispaCy** | **Apache-2.0 including the models** | **Adopt** | Rare and valuable — Apache-2.0 on weights. Use as a deterministic validation layer, not the primary pipeline |
| **medspaCy** | MIT | Caution | Useful negation/section primitives; no release since Nov 2024. Rule-based, so maintainable by you if upstream stalls |
| **Apache cTAKES** | Apache-2.0 | **Avoid** | No release since Sep 2023, Java/UIMA, plus a UMLS licence burden |
| **NeuroKit2** | **MIT**, v0.2.13 (Mar 2026) | **Adopt** | Your ECG signal-processing default. Implements Pan-Tompkins, Hamilton, Christov, Engzee |
| **py-ecg-detectors** | 🚨 **GPL-3.0** | **Avoid — act on this** | Copyleft in a closed backend is a breach. **NeuroKit2 is a drop-in replacement for the same detector families.** Make sure nobody writes this in |
| **BioSPPy** (BSD-3), **wfdb-python** (MIT), **torch_ecg** (MIT) | permissive | Adopt | torch_ecg ships **no weights** — you train |
| **ECG-FM** — `bowang-lab/ecg-fm` | **MIT, ungated** | Caution | The only credible open ECG foundation model with published weights, peer-reviewed 2025. Cannot be loaded via `transformers` — custom path. ⚠️ **training-data provenance not stated on the model card — verify before commercial deployment** |
| **ONNX Runtime + ONNX Runtime Android** | **MIT** | **Adopt** | Maven Central, no gating. Shortest PyTorch→Android path for a 1-D ECG model. This is your on-device Signal Quality agent |
| **LiteRT** (ex-TFLite) | Apache-2.0 | Caution | Fine licence, but rename churn through 2026 and it pulls you toward a TF training stack |
| **MediaPipe** | Apache-2.0, ⚠️ model bundles separate | **Avoid** | Built for vision graphs; adds nothing for 1-D biosignals |

**PhysioNet training datasets — all commercially usable, all requiring attribution:**

| Dataset | Licence | Commercial | Content |
|---|---|---|---|
| **PTB-XL v1.0.3** | **CC BY 4.0** | ✅ | 21,799 records, 18,869 patients, 10s 12-lead @500 Hz, 71 SCP-ECG statements |
| **MIT-BIH Arrhythmia** | **ODC-By v1.0** | ✅ | 48 half-hour records, ~110,000 beat annotations |
| **PhysioNet/CinC Challenge 2020 v1.0.2** | **CC BY 4.0** | ✅ | Bundles CPSC, CPSC-Extra, PTB, PTB-XL, Georgia, INCART |

Neither licence is share-alike, so **your trained weights are yours** — no copyleft flows through. But attribution is a real, enforceable obligation teams routinely forget: **ship a `DATA_ATTRIBUTION.md` with the product.** Use the Challenge-2020 redistribution rather than standalone CPSC, whose original terms are unverified.

⚠️ **Bigger than the licensing:** all of these are Western and Chinese cohorts. Indian ECG morphology, lead-placement practice and device noise profiles differ. Train on them, but **you will need Indian validation data before any clinical claim** — and under the CDSCO MDSW guidance of 21 July 2026, a diagnostic claim is what pulls the Rhythm Screener into Class C.

### 4.5 Platform infrastructure

| Component | Licence | Verdict | Why |
|---|---|---|---|
| **Keycloak 26.7.0** | **Apache-2.0**, released 9 Jul 2026 | **Adopt — reverses the earlier "build our own auth" lean** | The **Organizations** feature now covers multi-tenancy natively: `manage-organizations` / `view-organizations` roles for **delegated per-tenant admin without granting `manage-realm`**, org groups with role inheritance into token claims, subdomain-based IdP matching, user-selectable org at login. You need OIDC/SAML federation anyway — hospitals will demand it. Rolling your own is 6–12 engineer-months where every bug is a breach; Keycloak is ~2–4 weeks to production. Under DPDP an auditable identity layer is itself a compliance asset. Cost: a JVM service with its own database and quarterly, occasionally breaking upgrades |
| **DBOS Transact TS** | **MIT** | **Adopt — this replaces both BullMQ-plus-state-table and Temporal** | TypeScript-native durable execution **as a library backed by your existing Postgres**. No extra cluster, no control plane, no new on-call surface. Exactly right for "transcribe → structure → clinician review → persist" pipelines |
| **Temporal** | **MIT**, v1.31.2 (Jul 2026) | Caution — defer | Mature and correct at scale, but self-hosting means Cassandra/Postgres + Elasticsearch + four service types. Adopt when workflow complexity forces it, not headcount |
| **Restate** | 🚨 **BSL 1.1** | **Avoid** | Source-available, not open source. The Additional Use Grant likely covers you, but "arguably inside the grant" is not a position to defend in diligence when MIT alternatives exist |
| **LiveKit + egress + agents** | **Apache-2.0 throughout** | **Adopt for the scribe audio path** | The `agents` framework is purpose-built for a server-side participant piping audio to your ASR. Works with a custom frontend. **You already run LiveKit infrastructure** |
| **LiteLLM** | **MIT** (enterprise extras paid) | **Adopt as the model gateway** | Virtual keys, **budget controls and spend tracking**, caching, guardrails, load balancing, fallback routing and the admin dashboard are **all in the MIT tier** — which is precisely the gateway the AI architecture specified. ⚠️ **Audit logs are enterprise-only** — for a DPDP-regulated platform, log key issuance and changes at your application layer, or buy the licence. Plan for it rather than discovering it at audit |
| **pgvector v0.8.6** | PostgreSQL Licence (⚠️ not read from source; uncontroversial) | **Adopt** | HNSW + IVFFlat, **halfvec** (~50% storage, up to 4,000 dims), **sparsevec**, binary quantization with re-ranking. Comfortably handles clinical-note retrieval at your scale without a separate vector database |
| **ParadeDB / pg_search** | 🚨 **AGPL-3.0** | **Avoid** | Better BM25 than `tsvector`, but not worth an AGPL question mark **inside your core datastore**. If hybrid search proves insufficient, use a permissive engine *outside* the database |
| **TimescaleDB** | Apache-2.0 **or TSL** | **Adopt with caution** — see §1.2 | Every feature you chose it for is TSL |
| **MinIO** | 🚨 AGPLv3, **archived** | **Avoid** — see §1.1 | Unmaintained storage for patient data is indefensible |
| **SeaweedFS** | **Apache-2.0** | Adopt if self-hosting is mandatory | The permissive object-store option |

---

## 5. Content licences are not software licences

Three cases where the code is free and the *content* is not. Each needs a signature before you ship, not after.

| Content | Terms | Action |
|---|---|---|
| **SNOMED CT** | India is a **SNOMED International member**; NRCeS (C-DAC) is the national release centre and provides free tools, SDKs and licences; affiliate licences issue via `mlds.ihtsdotools.org/#/landing/IN`. ⚠️ **The precise commercial-vendor terms for an Indian SaaS were not verified** | **Get an affiliate licence confirmed in writing before shipping SNOMED codes.** Snowstorm the software is Apache-2.0; the terminology inside it is not |
| **LOINC** | **Free for commercial and non-commercial use, no fees or royalties**, explicitly permits embedding in software and mobile apps. Conditions: reproduce the Regenstrief copyright notice (`LOINC_short_license.txt` or on your terms page); keep extracted content bound to its LOINC codes and display names; **do not modify the LOINC Table** — local additions must use an `X` prefix | Adopt. Put the notice in the product and honour the `X` prefix rule |
| **UMLS** (reached via medspaCy linking, scispaCy, cTAKES) | Requires a **free but signed UMLS Licence Agreement**, and SNOMED content within it is separately licensed per country | Sign the UMLS agreement, or avoid the linking features entirely |

---

## 6. What nobody has built, so you must

**There is no deployable open-source DPDP Consent Manager.** Commercial vendors exist (ConsentOS, Digio, OpenIAM); `ConsentStack/cmp` surfaced but its licence, maintenance and India fit are all ⚠️ unverified. *(Note: `appnexus/cmp` is an advertising-industry IAB consent platform — irrelevant to health data, do not be misled by the name.)*

**Consent Manager registration binds 14 November 2026 — about two months away** — and Consent Managers must be **companies incorporated in India**. Enterprises must demonstrate granular, revocable, auditable consent, **with notice in the Eighth Schedule languages — Telugu and Hindi are both among them.**

**Design the consent ledger now.** It is small, and it is not a place to wait for an open-source project to appear:

```
consent_record (append-only, never updated)
  id · patient_id · purpose · scope_json · granted_at · expires_at
  notice_version · notice_language · notice_text_hash
  evidence_object_key · granted_via (app|abdm|paper|ivr)
  revoked_at · revocation_propagated_at
```

Requirements the Rules impose that a naive design misses: **which version of the notice, in which language, was actually served**; revocation must **propagate** and be demonstrably enforced downstream; and every record must be **exportable per tenant**. HAPI FHIR's **Consent Interceptors** are the right enforcement pattern to copy for the read/write gate.

---

## 7. Revised architecture — what changes

| Doc | Change |
|---|---|
| **Main §7.5** | **MinIO → managed S3-compatible (ap-south-1) by default; SeaweedFS (Apache-2.0) where self-hosting is mandatory.** Note TimescaleDB's TSL boundary and document the plain-Postgres fallback |
| **Main §5 / identity** | **Keycloak 26.7 Organizations replaces the hand-rolled identity module.** The kernel keeps tenancy, membership and care-relationship; Keycloak owns authentication, federation, MFA, sessions and delegated tenant admin |
| **Main §8.2** | Scribe audio tap does **not** go through Jibri/Jigasi. LiveKit `agents` (Apache-2.0) or a custom audio-tap participant. Jitsi keeps the media plane |
| **Main §8.5** | Add: **Jibri is one recording per instance and incompatible with a custom frontend.** Reinforces recording-off-by-default and audio-only |
| **AI doc §1.4** | **BullMQ + `workflow_run` → DBOS Transact TS (MIT).** Same Postgres, no new infrastructure, TypeScript-native. Temporal stays the deferred destination |
| **AI doc §1.5** | Model gateway is **LiteLLM (MIT)**, not hand-built. Add the audit-log gap to the application-layer logging plan |
| **AI doc §3** | ASR row: **IndicConformer (MIT, gated — mirror weights) for Telugu/Hindi; Whisper family (MIT) for English and code-mixed.** Sarvam open weights are Apache-2.0; Saaras is API-only |
| **AI doc §2.4** | Signal Quality and Rhythm Screener: **NeuroKit2 (MIT) + ONNX Runtime Android (MIT)**. Explicitly ban py-ecg-detectors (GPL-3.0) |
| **Plugin doc §7** | Add the adopted OSS catalogue as first-party plugins, each with its licence tier and isolation requirement |
| **Plugin doc §10** | Add the **licence tier policy** from §2 as a hard rule alongside the existing four |
| **New** | `DATA_ATTRIBUTION.md` shipped with the product (PhysioNet, LOINC, pyannote) |

### Revised phase plan

| Phase | Was | Now |
|---|---|---|
| **0** | Build auth, tenancy, RBAC | **Keycloak 26.7 + Organizations**; kernel keeps tenancy, care-relationship, audit. **Storage decision made here — no MinIO** |
| **1** | Clinical spine | Unchanged. **One-week Medplum spike** to settle core-vs-plugin |
| **2** | Telemetry | **NeuroKit2 + ONNX Runtime Android.** Device-packs as declarative plugins |
| **3** | Live consult | Jitsi media plane; **LiveKit agents for the scribe audio tap** |
| **4** | Prescribing | **IndicTrans2** for Indian-language Rx; **Snowstorm + LOINC** terminology; drug rules built |
| **5** | Adherence and alerts | **DBOS Transact TS** for durable flows; **LiteLLM** gateway in place from phase 2 |
| **6** | Clinician Android | Unchanged |
| **7** | Compliance and scale | **NHA ABDM-wrapper sidecar** for M1/M2/M3 + Scan & Share; **OpenELIS** labs plugin; **Orthanc** imaging plugin; **NHCX** claims; **DPDP consent ledger — pull this forward, it binds 14 Nov 2026** |

**Net effect on the 23-week estimate:** Keycloak, ABDM-wrapper, OpenELIS, Orthanc, LiteLLM and DBOS together remove roughly **10–14 weeks of build**. Against that, add the ABDM certification gate (paid empanelled functional testing plus a Safe-to-Host certificate), the consent ledger, and integration overhead on six external components. **Call it net 4–6 weeks saved and materially less code you own forever** — which is the more valuable half.

---

## 8. Blunt assessment

- **Bahmni is a teacher, not a dependency.** Its AGPL core would put network copyleft on a commercial SaaS, and a Java/AngularJS/Odoo/dcm4chee bundle inside a NestJS plugin runtime is not an architecture, it is a hostage situation. Read its ABDM-HIP integration and its clinical modelling — that is a decade of hard-won structure, free. Then write your own.
- **The MinIO finding is the most valuable thing in this document.** An archived, unpatched, AGPL object store holding patient recordings is the kind of decision that looks fine for eighteen months and then becomes the incident.
- **Keycloak changes the build-vs-buy answer that the original architecture got wrong.** Identity was scoped as a kernel module. With Organizations in 26.7, hand-rolling it is spending six months to build something worse at the exact layer where a bug is a breach.
- **CARE deserves a proper look before you write a line of EMR code.** Indian, MIT, FHIR-aligned, government-deployed, actively re-architected. It is the closest thing to a free head start that exists for your market, and almost nobody outside the Kerala/DPG ecosystem knows it is there.
- **Do not let "adopt open source" become twelve services to operate.** Every component here is one more thing to patch, upgrade and explain at 2am. The ones that earn their keep unambiguously are **Keycloak, ABDM-wrapper, OpenELIS, LiteLLM, DBOS, NeuroKit2 and ONNX Runtime**. Everything else is a decision to make when the customer asking for it has a name.

---

*Prepared for Ramsay, Aetos Tech Labs LLP. Sixth document in the Medical Hub set.*
