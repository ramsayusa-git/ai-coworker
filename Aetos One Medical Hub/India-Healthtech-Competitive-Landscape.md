# Indian Healthtech — Top 20 Providers, Feature Comparison & Competitive Gap Analysis

**Prepared for:** Aetos One Medical Hub
**Date:** 13 September 2026
**Method:** Every provider below was researched by fetching its live website and, where available, app-store listings, filings coverage and regulator/press sources. **Marked `NV` = not verified** — I could not confirm it either way and did not assume. Company scale figures are **self-reported by the vendor** unless a third-party source is named; several vendors publish mutually contradictory numbers on their own surfaces, which is itself worth knowing.

---

## 0. How to read this

Aetos One Medical Hub straddles **three markets that in India are still largely separate companies**:

| Segment | What they sell | Who the ~20 are |
|---|---|---|
| **A. Teleconsult platforms** | Consultations to patients | eSanjeevani, Practo, Apollo 24\|7, MediBuddy, Tata 1mg, mfine, Visit Health |
| **B. Clinic / hospital SaaS (EMR + PM)** | Software to doctors and clinics | Eka Care, HealthPlix, Practo Ray/Insta, KareXpert, MocDoc, DocPulse, Healthray, Medixcel/Plus91, Arogyam.ai, Clinicea, Bahmni |
| **C. Connected medical devices / RPM** | Devices + AI + monitoring | Dozee, Tricog (+ Cardiotrack, Sunfox, Cloudphysician, HealthCube in the appendix) |

**The headline finding is in that table.** Almost nobody spans all three. The device companies have no ABDM integration and no public APIs. The clinic-SaaS companies have no device layer. The teleconsult platforms have neither. **Live device readings streamed into a live consult — the core loop in your architecture — is not a product anyone in this list ships.**

---

## 1. The twenty — profiles

### A. Teleconsult platforms

---

**1. eSanjeevani** — https://esanjeevani.mohfw.gov.in
*Government of India (MoHFW), built and run by C-DAC Mohali.*
The elephant. **Over 43 crore (430 million) teleconsultations as of 23 November 2025**, across 28 states and 8 UTs — roughly an order of magnitude more than every private platform combined. Two modules: **AB-HWC** (doctor-to-doctor, health-worker-assisted, hub-and-spoke from Ayushman Bharat centres — structurally the same nurse-assisted flow in your architecture) and **OPD** (patient direct from home). Free. Deepest ABDM integration of anything in this list by design: HPR, HFR, ABHA, FHIR-based interoperable EHR. E-prescription is a documented output.
*No medicine delivery, no lab booking, no marketplace. Site returns 403 to automated fetchers — figures are from ministry/press sources.*
**Why it matters to you:** this is the benchmark for the assisted-consult model, and it is free. Any state or public-health deal competes with it. It is also proof the nurse-assisted pattern works at national scale.

---

**2. Practo** — https://www.practo.com
Founded 2008 (Shashank ND, Abhinav Lal). ~$228.85M raised over 6 rounds. Inc42 (Feb 2026): in talks for a **$100–125M pre-IPO round at ~$700M post-money, IPO pushed to 2027**; **FY25 ₹15 Cr operating EBITDA on ₹234 Cr revenue** (from a ₹17 Cr loss in FY24), 35% YoY growth in FY26.
Doctor-discovery marketplace → 24×7 consults, diagnostics, medicine delivery, plus the B2B software line (entry 3).
**Doctor-count claims are inconsistent across its own surfaces: 20,000 / 100,000 / 200,000 on three different pages.** Treat all as marketing.
Pricing: consults **from ₹199**; specialties ₹600–₹800. **Practo Plus ₹1,199/mo, ₹2,499/qtr, ₹2,999/yr** — unlimited consults across 22+ specialties, capped 5/day and 15/month, 3 family members; labs and medicines excluded.
ABDM: **provider-side only** (Ray), not the consumer app.

---

**3. Practo Ray + Insta** — https://www.practo.com/providers/clinics/ray · https://www.instahms.com
The B2B twin: **Ray** = clinic practice management/EHR; **Insta** = hospital HMS (OP + IP). Claims 50,000+ doctors, 25M+ appointments, 5 countries; Insta at 500+ clients across 1,200+ facilities.
**Published pricing — one of only four vendors that publishes at all:**
- Ray **CM Atom ₹999/mo** (3,000 SMS, 5 GB, up to 50 doctors, 2% payment fee)
- Ray **Clinic Management ₹1,999/mo** (₹1,499 on 1-yr, **₹999 on 4-yr**; 8,000 SMS, 20 GB, unlimited doctors, 1.8% fee)
- Insta **Out-Patient ₹1,000/user/mo**, min 5 users · Insta **In-Patient ₹1,200/user/mo**, min 10 users
ABDM compliant (UHI, PHR upload) — **milestone level not stated**. API access advertised. Hosted on AWS.

---

**4. Apollo 24|7** — https://www.apollo247.com
Apollo Healthco Ltd, subsidiary of listed Apollo Hospitals (APOLLOHOSP). **HealthCo demerger targeting a Q4 FY27 listing** with a stated ₹25,000 Cr revenue ambition (reported guidance, not audited). Apollo group FY26 revenue reported ₹25,228 Cr, +16%.
Its real moat is physical: **2,000+ diagnostics collection centres, 100+ labs, 75,000+ medicines, 19-minute delivery in four metros**, plus in-person booking across Apollo Hospitals/Clinics/Spectra/Cradle/Fertility/Sugar/Dental.
Doctor counts again inconsistent: 2,200 / 4,000 / 6,674 across three surfaces. Consult fees observed **₹399–₹2,500**.
**The one genuinely serious clinical AI in the consumer segment:** the **Clinical Intelligence Engine (CIE)**, launched Feb 2023 — ML decision support over 1,300+ conditions and 800+ symptoms, built with 100+ engineers and 500+ clinicians, used by 4,000+ Apollo doctors. It is **doctor-facing**, and built on Google Cloud MedLM with RAG.
ABDM: **no claim found on any page fetched.**

---

**5. MediBuddy** — https://www.medibuddy.in
Founded 2013 (Enbasekar Dinadayalane, Satish Kannan — the DocsApp lineage). **DocsApp–MediBuddy merger completed June 2020**; DocsApp is retired as a brand. $206.65M raised over 8 rounds, latest debt round May 2024. **FY25 revenue ₹505.3 Cr, +35.35%**, ~1,930 employees.
Claims 180,000+ doctors, **25,000 consults/day**, 20,000+ clinics/hospitals, 96% pin-code delivery.
**Two things make it the most interesting private player for you:**
- **ABHA integration is real and prominent** — the iOS app is literally titled *"MediBuddy-Dr Labs Meds ABHA"*. Only private platform with verified patient-side ABHA.
- **16 Indian languages** — the only platform in this survey that states a number.
Business model is **corporate/insurer-funded OPD benefits**, not consumer pay-per-consult, which is why no pricing is published.
*Caveat: App Store reviews (3.8★, 735 ratings) repeatedly cite video-call failures and session logouts.*

---

**6. Tata 1mg** — https://www.1mg.com
Tata Digital majority-owned since June 2021. **FY26 consolidated revenue ₹2,936 Cr, +23%; net loss narrowed to ₹287 Cr** (Entrackr). 1,800+ cities, 1 crore+ downloads, 4.6★ from 866,000+ reviews.
E-pharmacy first. **Consults are chat-based — video is not stated on any page fetched** — and are positioned as **free** ("at no cost"), i.e. a funnel into medicine and lab revenue, not a product line. Family health records, "AI-powered Health Insights Hub". ISO/IEC 27001.
ABDM: **not verified.**

---

**7. mfine** — https://www.mfine.co
Merged with **LifeCell's diagnostics business in July 2022** ($80M raised alongside), after firing over half its staff; combined entity branded LifeWell, which later raised $22M from OrbiMed. **lifewell.in is now a parked domain** — the live product is still mfine-branded. Current corporate structure NV.
Now an **insurer-channel** play: explicit partnerships with **Care Health, Acko, GoDigit, Niva Bupa, Magma**. 600+ NABL/NABH labs, chronic care programmes, dental and vision.
**Read this as a restructured distressed asset, not a growth competitor** — but the insurer channel it landed on is instructive.

---

**8. Visit Health** — https://getvisitapp.com
B2B employee-health-benefits platform: **1,000+ corporate clients, 50 lakh+ app users, 3 lakh+ claims/year**, benefit deployment in as little as 72 hours. Teleconsult is one module inside an OPD/wellness/EAP stack. No consumer pricing. ABDM, languages, AI: NV.
**The channel worth noting:** corporate OPD is where private teleconsult volume actually monetises in India.

---

### B. Clinic / hospital SaaS and EMR

---

**9. Eka Care** — https://www.eka.care · **developer docs: https://developer.eka.care**
**Your single most serious competitor, by a distance.** "AI-Native Ambient Digital Health Platform."
Scale: **33,000+ clinics, 90,000+ doctors, 20M+ ABHA IDs created, 140M medical records, 1M EkaScribe sessions, 8M MedAssist conversations.**
- **EkaScribe** — ambient voice-to-note in **15+ Indian languages**. This is the feature you identified as your killer app; they already ship it at a million sessions.
- **MedAssist** agent, CDSS with drug-interaction alerts, Medical Records Analyzer.
- **ABDM: NHA-approved, FHIR-compliant**, ABHA creation/verification, consent + HIP/HIU flows documented in public APIs.
- **Public developer platform with OAuth 2.0/OIDC, webhooks, SNOMED CT / LOINC / ICD-10-CM codification APIs — and an MCP server for EMR integration.** Nobody else in this market is close on API maturity.
- Multi-branch, RBAC, billing, own-pharmacy real-time inventory at point of prescribing, e-lab (Metropolis, Orange), WhatsApp Rx delivery.
**Published pricing (two sets):** monthly ₹2,999 / ₹5,999 / ₹9,999 / ₹27,999 (top tier bundles an iPad); annual **Eka Doc Plus ₹16,999/yr**, **Doc Pro ₹18,749/yr**, **Clinic Pro ₹1,00,000/yr** (5 doctors + 15 staff). All + 18% GST.
*Device integration: only Pillo Health listed. **This is the gap.***

---

**10. HealthPlix** — https://www.healthplix.com
Founded 2014 (Sandeep Gudibanda). **Series C $22M, March 2023** — Avataar Venture Partners + SIG, with Lightspeed, JSW Ventures, Kalaari, Chiratae, BlackSoil.
**14,000+ doctors, 60M+ patients, 370+ cities.** Core pitch: **"Rx in 30 seconds", prescriptions in 14 languages**. Doctor-first EMR, teleconsult, patient app, ABDM/ABHA compliant. ISO 27001:2022, HIPAA, NABH, RSSDI.
**Pricing not published anywhere** — `/pricing`, `/emr-software`, `/abdm` all 404. AI claims are marketing-level; no named scribe or CDSS product verified.

---

**11. KareXpert** — https://www.karexpert.com
**Reliance Jio-backed** (2018, amount undisclosed), founder Nidhi Jain, Gurugram. Enterprise/hospital only — **500+ hospitals in 6 countries, 30,000+ beds, 27M+ patients, 60+ modules**, "go-live in a day or two."
**The only vendor in this entire survey that explicitly claims "ABDM M1, M2, M3 Certified."**
Full HIMS: EMR, LIMS, RIS/PACS, pharmacy, billing, virtual care, BI, **Medical IoT and connected-ambulance device integration**. Single data lake architecture, fully managed cloud. Intel and Microsoft partnerships.
Pricing: quote-only.

---

**12. MocDoc** — https://mocdoc.com
1,500+ customers, 15M+ patient records, 30,000+ doctors, 10+ countries (India, Fiji, Maldives, Nigeria, Oman, Rwanda). HMS, clinic/polyclinic, LIMS, pharmacy, plus dental / ophthalmology / ART-IVF verticals.
**Explicitly states RBAC**, multi-branch, ABDM/ABHA (+ PMJAY, NPHIES for Gulf), SMS/Email/**WhatsApp**, machine interfaces for lab device integration, insurance settlements. HIPAA, ISO 27001.
Pricing not on site; Techjockey lists ₹15,000 excl. tax for Clinic Management (term unspecified — treat cautiously).

---

**13. DocPulse** — https://www.docpulse.com
13+ years, 400+ facilities, 3,000+ active doctors, **10M+ appointments/year**, 99.9% uptime SLA. Solo practitioner → hospital OPD/IPD → clinic chains.
**e-Rx with drug-interaction alerts**, scheduling via online/**IVR**/WhatsApp/walk-in, GST billing + insurance/TPA claims, pharmacy auto-dispense, **LIMS with lab machine integration**, HD video teleconsult, multi-branch central dashboards.
**Rare and notable: explicitly claims DPDP Act 2023 compliance** alongside ABDM certification, ISO 27001, HIPAA. Pricing: "transparent, modular" but no figures published.

---

**14. Healthray** — https://healthray.com
"AI-powered, ABDM-compliant HMS trusted by 1,000+ Indian hospitals." 2,500+ facilities, 5M+ patient records, 4M+ prescriptions, **1M+ ABHA IDs created**, 30+ specialties.
OPD/IPD HIMS, specialty EMR templates, pharmacy with GST invoicing, LIMS, **RBAC with audit trails**, ABHA creation at registration, real-time OPD revenue and bed-occupancy analytics. AI = smart templates and automated documentation (not a scribe). Pricing not published.

---

**15. Medixcel / Plus91 Technologies** — https://www.medixcel.in · https://www.plus91.in
Plus91 founded 2009; Pune/Patna/Agartala/Chandigarh, claims presence in 26 countries. Strong in **government health systems**.
**The most verifiable ABDM implementation evidence of anyone**: public KB documenting Milestone 1 (ABHA linking, new and existing patients), Milestone 2 (consent), Milestone 3 (PHR app consent approval) and **Scan & Share** workflows, with a separate ABDM portal.
Products: MediXcel HIS/EMR, MediXcel LIMS, **BHAIRAV Clinical AI** (CDSS + AI-assisted documentation), TeleHealth Connect, Early Warning System (disease surveillance), RIS/PACS/VNA.
Pricing: enterprise quote.

---

**16. Arogyam.ai** — https://arogyam.app
*The product you originally referenced. Worth being precise about what it actually is.*
**SV Global Pvt Ltd, Visakhapatnam. Early-stage** — the pricing page says "founding pricing as of 12 August 2026" and references early-access clinics. Treat all claims as unproven.
Positioning: "AI isn't an add-on. It's the operating layer of care." Target: 1–6 doctor clinics.
**AI charting — voice-to-SOAP in under 2 minutes**; e-Rx against a 2.5 lakh+ Indian medication directory with output in Hindi/Telugu/Tamil/Kannada; **queue prioritised by clinical urgency**; nine named agents (Pre-Visit Intake, Medication Safety Check, Follow-Up Engine…); WhatsApp + SMS + in-app; UPI/Razorpay billing; **"ABDM-ready"** (a readiness claim, not a certified milestone).
**Pricing — the most aggressive AI-native pricing found anywhere in this survey: ₹1,099 / ₹1,599 / ₹2,699 per month + GST**, the top tier covering up to 6 doctors across branches. 48-hour onboarding.

---

**17. Clinicea** — https://www.clinicea.com
Founded Nov 2012, Kolkata origin, sold globally in USD, runs on Azure. Serves solo doctors → **clinic chains up to 90+ locations**, 20+ specialties with a strong **aesthetics/derm** lean.
Highly customisable EMR, configurable Rx layouts, **video consult inside the chart**, packages, loyalty/referral, annotated before/after imaging and a **Compare Visit** progress tool. Integrations: Google/Outlook/Apple Calendar, Instagram, Facebook, RazorPay, Stripe, PayPal, Flutterwave.
**Pricing (USD): $59 / $69 / $89 per practitioner per month.** Add-ons: custom EMR forms $799–$2,299 one-time; lab $19/mo; pharmacy $19/mo; patient portal $89/mo per clinic.
**ABDM: not stated anywhere.**

---

**18. Bahmni** — https://www.bahmni.org
Free and open-source hospital system (originated at ThoughtWorks, now governed by the **Bahmni Coalition**; **SNOMED International recently joined as a partner**). **500+ sites, 50+ countries, 20M+ patient records.**
OpenMRS (EMR) + OpenELIS (lab) + OpenERP/Odoo (inventory, billing, accounting) + PACS/DICOM. **Designed to run offline at hospital sites**, on-premise by default, full OpenMRS REST/FHIR APIs.
**This is your build-vs-buy baseline.** Any customer with an engineering team can deploy it for zero licence cost. Your answer has to be better than "we wrote our own OpenMRS."
*ABDM not mentioned on the site; third-party connectors exist but were not verified.*

---

### C. Connected devices / RPM

---

**19. Dozee** — https://www.dozeehealth.ai
Turtle Shell Technologies (Mudit Dandwate). **Contactless vitals via ballistocardiography** — a sensor sheet under the mattress reading micro-vibrations; cloud AI derives HR, RR, contactless BP, SpO2, ECG, temperature, plus a deterioration early-warning score (DEWS). Claims 200+ hospitals, 15,500+ beds.
**US FDA 510(k) clearance confirmed (Dec 2022)** — but note the cleared scope as reported is **HR, RR and body movement**, narrower than the full marketed vitals list. CE Mark reported 2025; site also asserts CDSCO, ISO 13485:2016, SOC 2, HIPAA.
$6M Series A2 (April 2023): SBI, J&A Partners Family, Dinesh Mody Ventures, with Prime Venture Partners, 3one4, YourNest.
**ABDM integration and open API: not verified.**

---

**20. Tricog Health** — https://tricog.com
Founded by Dr Charit Bhograj (cardiologist). AI cardiac diagnostics with **human expert overread** — InstaECG, InstaEcho, VCardia, KeeboHealth. Claims 40M+ patients diagnosed.
**Displays CE marking, CDSCO approval and ISO/IEC 13485** — the cleanest regulatory posture of the ECG-AI cohort.
Sells to clinics, hospitals, diagnostic chains, public health centres, home health, pharma **and insurers** — named customers include Apollo, Fortis, Manipal, MAX, Neuberg, Metropolis, Vijaya Diagnostics, plus state health departments.
**ABDM and open API: not verified.**

---

## 2. Feature comparison matrix

**Y** = stated on a page fetched · **P** = partial · **N** = explicitly absent · **NV** = not verified (could not confirm either way — *not* the same as "no")

### 2.1 Clinical platform capabilities

| # | Provider | EMR | e-Rx | Multi-branch | RBAC | Teleconsult | Patient app | Billing | Pharmacy/Inv | LIMS/Lab |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | eSanjeevani | Y (ABDM) | Y | Y | NV | Y | P | N | N | N |
| 2 | Practo (consumer) | P | Y | — | — | Y | Y | Y | Y | Y |
| 3 | Practo Ray/Insta | Y | Y | P | NV | P | Y | Y | Y | NV |
| 4 | Apollo 24\|7 | Y | Y | — | — | Y | Y | Y | Y | Y |
| 5 | MediBuddy | Y | NV | — | — | Y | Y | Y | Y | Y |
| 6 | Tata 1mg | Y | NV | — | — | P (chat) | Y | Y | Y | Y |
| 7 | mfine | P | NV | — | — | Y | Y | Y | Y | Y |
| 8 | Visit Health | NV | NV | — | — | Y | Y | Y | Y | Y |
| 9 | **Eka Care** | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** |
| 10 | HealthPlix | Y | Y (14 lang) | NV | P | Y | Y | NV | NV | NV |
| 11 | KareXpert | Y | P | Y | NV | Y | P | Y | Y | Y |
| 12 | MocDoc | Y | Y | **Y** | **Y** | Y | Y | Y | Y | Y |
| 13 | DocPulse | Y | Y (+interactions) | Y | NV | Y | Y | Y | Y | Y |
| 14 | Healthray | Y | Y | Y | **Y** | NV | NV | Y | Y | Y |
| 15 | Medixcel/Plus91 | Y | NV | NV | NV | Y | NV | Y | Y | Y |
| 16 | Arogyam.ai | Y | Y (4 lang) | Y | P | NV | Y | Y | NV | NV |
| 17 | Clinicea | Y | Y | Y | NV | Y | Y | Y | Y (add-on) | Y (add-on) |
| 18 | Bahmni | Y | P | P | P | NV | NV | Y | Y | Y |
| 19 | Dozee | N | N | — | NV | N | Y | N | N | N |
| 20 | Tricog | N | N | — | NV | P | NV | N | N | N |

### 2.2 The dimensions that decide your competitive position

| # | Provider | ABDM status | AI depth | Device / BLE vitals | **Live vitals in consult** | Open API | On-prem | Published price |
|---|---|---|---|---|---|---|---|---|
| 1 | eSanjeevani | **Deepest — HPR, HFR, ABHA, FHIR** | NV | NV | **N** | NV | Gov infra | Free |
| 2 | Practo | Provider-side only | P (vague) | NV | N | NV | N | ₹199+; Plus ₹2,999/yr |
| 3 | Practo Ray/Insta | Compliant, level NV | NV | NV | N | Y | N | **₹999–₹1,999/mo; Insta ₹1,000–1,200/user** |
| 4 | Apollo 24\|7 | **No claim found** | **Y — CIE, 1,300 conditions** | P (glucose) | N | NV | N | ₹399–₹2,500 |
| 5 | MediBuddy | **Y — ABHA in app** | P | NV | N | NV | N | Not published |
| 6 | Tata 1mg | NV | P | NV | N | NV | N | Consults free |
| 7 | mfine | NV | NV | NV | N | NV | N | Not published |
| 8 | Visit Health | NV | NV | NV | N | NV | N | B2B quote |
| 9 | **Eka Care** | **Y — NHA-approved, FHIR, HIP/HIU** | **Y — EkaScribe 15+ langs, MedAssist, CDSS** | **P — Pillo only** | **N** | **Y — OAuth, webhooks, SNOMED/LOINC, MCP server** | NV | **₹2,999–₹27,999/mo; ₹16,999–₹1L/yr** |
| 10 | HealthPlix | Y (level NV) | P | NV | N | P (PlixConnect) | NV | **Not published** |
| 11 | KareXpert | **Y — "M1, M2, M3 Certified"** | P | **Y — Medical IoT** | NV | NV | N (managed cloud) | Quote |
| 12 | MocDoc | Y (+PMJAY, NPHIES) | NV | Y (machine interfaces) | N | P | NV | Third-party only |
| 13 | DocPulse | Y certified + **DPDP claim** | NV | Y (lab machines) | N | NV | NV | Not published |
| 14 | Healthray | Y (1M+ ABHA) | P | NV | N | NV | NV | Not published |
| 15 | Medixcel/Plus91 | **Y — M1/M2/M3 workflows documented** | **Y — BHAIRAV CDSS** | NV | N | NV | NV | Quote |
| 16 | Arogyam.ai | "ABDM-ready" (not certified) | Y — 9 agents, voice-to-SOAP | NV | N | NV | N | **₹1,099–₹2,699/mo** |
| 17 | Clinicea | **Not stated** | P | NV | N | Y | N | **$59–$89/practitioner/mo** |
| 18 | Bahmni | Not stated | N | NV | N | **Y — OpenMRS REST/FHIR** | **Y — default** | **Free (OSS)** |
| 19 | Dozee | NV | Y — DEWS | **Y — contactless, FDA 510(k)** | P (monitoring, not consult) | NV | NV | Not published |
| 20 | Tricog | NV | **Y — ECG/echo AI + overread** | **Y — CE + CDSCO** | N | NV | NV | Not published |

---

## 3. What the matrix actually tells you

**1. The white space is real and it is exactly your architecture's core loop.**
Look down the *"Live vitals in consult"* column. It is **N or NV for all twenty**. Device companies (Dozee, Tricog, Cardiotrack, Sunfox) monitor and diagnose but have no consult platform and no clinic EMR. Clinic SaaS companies (Eka Care, HealthPlix, MocDoc) run the consult and the record but integrate lab machines at best — **no BLE patient-side vitals**. Teleconsult platforms have neither. Nobody ships "nurse takes a BP reading on a phone and the doctor watches the number arrive mid-consult."
**That is your wedge, and it is the only one in this analysis that isn't already occupied.**

**2. Eka Care has already built your second-best idea.**
EkaScribe — ambient voice-to-SOAP in 15+ Indian languages — at 1M sessions, with NHA-approved ABDM, 20M ABHA IDs, and a public developer platform including an **MCP server**. Your AI architecture identified Scribe as the killer feature; they shipped it first and are further along than the plan assumed. **Adjust: Scribe is table stakes, not differentiation.** Differentiation is Scribe *plus* device telemetry in one record.

**3. ABDM certification is the sharpest sorting mechanism, and most vendors are vague about it.**
Only **KareXpert** names M1+M2+M3 certification. Only **Medixcel/Plus91** publishes actual per-milestone workflow documentation. **Eka Care** is NHA-approved with public ABDM APIs. Everyone else says "ABDM compliant" with no milestone. **CrelioHealth, Clinicea, Attune, Bahmni, and the entire device cohort say nothing at all.** Getting M1–M3 certified and *saying which* puts you ahead of 15 of these 20 on a procurement checklist.

**4. Pricing is a near-total information vacuum — and that is an opportunity.**
Only four vendors publish figures on their own site: Practo, Eka Care, Arogyam.ai, Clinicea. Everyone enterprise-facing is quote-only. The solo/small-clinic band is **₹999–₹2,999/month**. Eka Care's mid-tiers (₹5,999–₹9,999) and Clinicea (~₹5,000–7,500 equivalent) sit well above. **Arogyam.ai is undercutting the whole market at ₹1,099–₹2,699 with AI included** — which is precisely the trap your own scalability review flagged: at those prices, ₹10–20 of AI per consult does not survive.

**5. The corporate/insurer channel is where private teleconsult volume actually monetises.**
MediBuddy, Visit Health, mfine and Cardiotrack all converged on employer- or insurer-funded models. Consumer pay-per-consult is a hard business; Tata 1mg gives consults away entirely as a pharmacy funnel. If the Medical Hub needs volume, that channel matters more than a consumer app.

**6. Nobody serious is doing on-premise except Bahmni.**
Every commercial vendor is cloud-only. Bahmni is on-prem by default and free. For a government or a hospital with data-residency demands, Bahmni is the incumbent answer and your plugin architecture's `IdentityProvider` / on-prem connector path is the honest counter.

---

## 4. Regulatory findings that change your architecture

Three things surfaced in research that are **newer than the assumptions in your architecture documents**. These are material.

### 4.1 🔴 CDSCO issued FINAL Medical Device Software guidance on 21 July 2026

**Doc No. CDSCO/MD/GD/MDSW/01/2026**, signed by DCGI Dr Rajeev Raghuvanshi, under the Medical Devices Rules 2017.

- Scope expressly covers **AI/ML solutions, IoT, digital therapeutics and advanced data analytics** — standalone and embedded.
- **Abandons the SaMD/SiMD split** for a broader **function-based approach**.
- Four risk classes **A / B / C / D**, with standalone-software class driven by **how critical the healthcare decision is** (critical / serious / non-serious) combined with the significance of the information to that decision.
- **Out of scope:** general wellness/fitness/education software, and software doing **only data transfer, storage or communication** with no independent medical application.
- Standards referenced: IEC 62304, ISO 14971, IEC 82304-1, ISO 13485. Requires **cybersecurity, SBOM, continuous performance monitoring**.
- **AI-specific and commercially the most important provision: the Algorithm Change Protocol (ACP)** — pre-declared, bounded modification rules let you push **minor algorithm updates without a fresh licence application**, with post-market drift monitoring.

**What this does to your design:**

| Your component | Likely status |
|---|---|
| Storing and displaying an ECG waveform | **Out of scope** — data transfer/storage/display, no independent medical application |
| Signal Quality agent (artifact / lead-off classification, prompts a retake) | **Arguably out of scope**, but sits near the line — it does not interpret for a clinical decision |
| Vitals Interpreter (turns numbers into clinical language with trend context) | **In scope** — clinical decision support |
| **Rhythm Screener (AF, ectopy, brady/tachy detection)** | **In scope, and should be assumed Class C or higher** — an ECG AI that flags acute MI or life-threatening arrhythmia is a critical-situation, high-significance use |
| Rx Safety agent | In scope as CDSS; class depends on whether it blocks or advises |

*Caveat, stated plainly: CDSCO has published no worked example assigning a class to ECG interpretation software. The Class C reading above is reasoned application of the guidance's own criteria — analysis, not a sourced determination. Confirm with CDSCO or a regulatory consultant before relying on it.*

**Actions:** (a) design the **ACP before first submission**, not after — it is worth more than any other single compliance decision; (b) keep the Rhythm Screener behind a feature flag and out of v1 unless you are prepared to license it; (c) the "screening, not diagnostic" label in your AI doc is necessary but **no longer sufficient** — the guidance classifies by function, not by disclaimer.

### 4.2 🟠 DPDP dates are now firm — and later than you'd think

MeitY notified the Act and the **DPDP Rules 2025** in the Gazette on **14 November 2025**, phased:

| Date | What binds |
|---|---|
| 14 Nov 2025 | Commencement; **Data Protection Board established** |
| **14 November 2026** | **Consent Manager registration** (~2 months away) — Consent Managers must be **companies incorporated in India** |
| **14 May 2027** | **The substantive regime**: notice and consent, breach reporting, security safeguards, children's data, Significant Data Fiduciary obligations, Data Principal rights |

**Two things your architecture assumed wrongly:**
1. **DPDP does not create a separate "sensitive personal data" category.** Health data is ordinary personal data under the general regime — unlike the outgoing SPDI Rules which singled out medical records. Your design is *stricter* than required, which is fine, but the justification changes.
2. **Breach notification is individual-level and immediate** — notify every affected person *without delay*, in plain language, with impact and remediation. Not thresholded. Your `audit_log` and `access_log` design has to be able to answer "exactly whose records were exposed" fast. It can — that is one more reason §7.6 matters.

A platform at your target scale is a plausible **Significant Data Fiduciary** candidate (independent audits, DPIAs, possible restrictions on transferring specified data outside India). SDF designations **remain pending** as of mid-2026.

### 4.3 🟢 Telemedicine guidelines — your architecture assumed correctly

The **2020 MoHFW Telemedicine Practice Guidelines remain the operative framework**, as Appendix 5 to the IMC (Professional Conduct) Regulations 2002 — meaning breach is **professional misconduct against the practitioner**, not the platform.

The NMC's attempted replacement — the **Registered Medical Practitioner (Professional Conduct) Regulations 2023**, carrying updated 2022 telemedicine guidelines — **was placed in abeyance** and is not operative. *Anyone building to the 2022 draft is building to a document that is not in force.*

List O / A / B / Prohibited categories are confirmed as your architecture describes them. One secondary source mentions exceptions for Clobazam, Clonazepam and Phenobarbitone under specific NMC guidance — **single-source, confirm independently before coding it.**

**Also confirmed:** there is **no standalone licensing regime for telemedicine platforms** in India. Regulation attaches to the practitioner. Platform/TSP liability is legally unclear — but digital health software is a **"product" under the Consumer Protection Act 2019**, which brings product-liability exposure.

### 4.4 ABDM — the certification path, priced and gated

**Scale (PIB/NHA, 22 May 2026): 100 crore health records linked to ABHA**, 450+ integrated solutions, ~900 million health accounts. Top states: UP 15.03 crore, AP 11.95, Bihar 7.37, Rajasthan 6.32, Gujarat 4.77.

**Milestones, officially:**
- **M1** — ABHA number create/capture/verify in patient registration; obtain link token
- **M2** — **HIP**: link and export health data to the ABHA app, five major report types including diagnostic reports and discharge summaries
- **M3** — **HIU**: raise consent requests and import longitudinal records from other applications
*(An "M4" appears in vendor blogs but not in any official NHA source — treat as unverified.)*

**Sandbox exit is a paid, four-step gate:**
1. **Functional testing by an NHA-empanelled agency** — **FIME India, Suma Soft, Tata Communications** — on a **paid** basis
2. **"Safe-to-Host" security certificate** from an **STQC- or CERT-In-empanelled** agency
3. NHA committee review of test reports and documentation
4. Production credentials issued

**Prerequisite: partnering facilities must be HFR-registered before ABDM production.** Sandbox approval feedback is typically 3–4 days; the exit process is the long pole. **Budget money and lead time for both the functional testing and the Safe-to-Host certificate** — these were not in your phase-7 estimate.

**Also newly live:** **National Health Claims Exchange (NHCX) went live June 2026** — relevant if insurance/TPA claims ever enter scope. National Drug Registry, Common LOINC Codes and Bharat Health Terminology Service are also live. NHA launched **SAHI** (Strategy for AI in Healthcare) and **BODH** (validation platform) in February 2026.

---

## 5. Where Aetos One Medical Hub actually differentiates

Ranked by how defensible each is, given the twenty above:

| Rank | Differentiator | Why it holds |
|---|---|---|
| **1** | **BLE device readings streamed live into a consult, landing in the clinical record** | Not shipped by anyone in this list. Device vendors have no consult layer; clinic SaaS has no patient-side BLE. You already have working ECG2 and BP decoders on real hardware |
| **2** | **Device Protocol Packs — new device support as config, not an app release** | No competitor has anything like it. Hardware breadth is where device vendors are slow and clinic SaaS is absent entirely |
| **3** | **HA-style clinic automations** (trigger → condition → action, authored by the clinic) | Nobody offers programmable clinical protocols to non-engineers. Genuinely novel in this market |
| **4** | **Named ABDM M1/M2/M3 certification** | Beats 15 of 20 on a procurement checklist — but it is a certification, not a moat. KareXpert and Medixcel already have it |
| **5** | **Open API + MCP server** | Strong against 18 of 20 — **but Eka Care already ships an MCP server.** Parity, not lead |
| **6** | Ambient scribe in Indian languages | **Eka Care shipped it first at 1M sessions. Table stakes.** Necessary to compete; not a reason to win |
| **7** | Teleconsult, EMR, e-Rx, multi-branch, RBAC | Fully commoditised. Ten vendors do all of it. Do not position on this |

**The honest strategic read:** you are not entering an empty market — you are entering a crowded one with **one genuinely unoccupied position**. The Hub wins if it is *"the platform where the readings come from the devices in the room"*, and loses if it is *"another AI clinic EMR"*, because the second one is a fight with Eka Care (90,000 doctors, NHA-approved, ₹2,999/mo) and Arogyam.ai (₹1,099/mo) at the same time.

**One more thing worth saying plainly:** eSanjeevani gives away, free, the nurse-assisted consult flow that your architecture treats as a core feature — at 43 crore consults. Do not compete with it on that flow alone. Compete on what it does not do: **live device data, private multi-branch org management, and a record that spans home monitoring and clinic visits.**

---

## 6. Appendix — twelve more, verified

| Provider | URL | What it is | Note |
|---|---|---|---|
| Cardiotrack (Uber Diagnostics) | cardiotrack.io | 12-lead handheld ECG + 5-model consensus AI | **Insurer-led** (Tata AIA, Bajaj Life, Canara HSBC), 1,938 labs. **States no CDSCO/CE/FDA device clearance** — a live exposure under the new MDSW guidance |
| Sunfox (Spandan) | sunfox.in | Pocket ECG — Legacy 4.0, Neo, Pro, Ultra 12L | **CDSCO approved**; FDA wording is soft, not a 510(k). ₹15 Cr Pre-Series A (Aug 2024); all five sharks on Shark Tank S1 |
| Agatsa (SanketLife) | agatsa.com | Touch-based pocket ECG, MultiVital, Health360 | Regulatory status **not stated on site** |
| HealthCube | healthcubed.com | 55+ parameter point-of-care device incl. ECG | **CE + DCGI/CDSCO + ISO 13485**; sells to **governments and insurers**, rural/tier-3 |
| Cloudphysician | cloudphysician.ai | Tele-ICU — RADAR platform, 4 named AI assistants | 300+ hospitals. **No device clearance claimed** (services+software). $10.5M Series B, June 2024, Peak XV |
| CrelioHealth | creliohealth.com | LIMS for labs, 2,500+ labs, 30+ countries | AI-TRF scanning, open API, analyzer integration. **ABDM not stated** |
| Attune Technologies | attunelive.com | HIS + LIS; "3 of top 5 Indian labs" | $10M Series B 2015 (Qualcomm, Norwest). Most verifiable milestones are ~10 years old |
| Halemind | halemind.com | EHR + PM, clinic/hospital/pharmacy/lab | **States RBAC.** Techjockey lists ₹999/₹2,499/₹4,999 per month (not on vendor site) |
| Docon | docon.co.in | Clinic digitisation, 25M+ prescriptions | **PharmEasy/API Holdings subsidiary, not Reliance.** FY21 ₹2.25 Cr income vs ₹31.7 Cr costs; ops wound down 2022. **Cautionary tale** |
| PharmEasy | pharmeasy.in | E-pharmacy + Thyrocare diagnostics | Consult layer is tiny: **40+ doctors, 50K lifetime consults**. DRHP withdrawn; ₹3,500 Cr rights issue; Ranjan Pai largest shareholder |
| Netmeds | netmeds.com | Reliance Retail e-pharmacy, 26M+ customers | Consult product status unclear — three consult URLs 404'd |
| Bahmni ecosystem | bahmni.org | OSS baseline (see entry 18) | SNOMED International now a coalition partner |

**Checked and excluded:** **Qure.ai** (medical imaging AI — FDA-cleared, 5,500+ sites, but not clinic workflow) · **Nintee** (**shut down April 2024**) · **Lybrate** (consumer marketplace, not B2B SaaS) · **Even Healthcare** (**repositioned to IRDAI-licensed insurance distribution — no RPM offering at all**) · **Fitterfly** (now described as a division of **PB Health**/Policybazaar) · **"Dr. Palve"** (not a software vendor — a Pune hospital) · **Healthians**, **Amazon Clinic India**, **Flipkart Health+** (could not verify current status; Amazon retired the Clinic brand in the US).

---

## 7. Caveats on this research

- **Self-reported numbers are unreliable and often internally inconsistent.** Practo publishes three different doctor counts; Apollo publishes three. Do not treat any vendor figure as comparable to another.
- **`NV` means unverified, not absent.** A vendor may well have a feature and simply not market it on the page fetched.
- Regulatory analysis of **where an ECG interpretation feature lands under CDSCO classes** is reasoned from the guidance's criteria, **not a CDSCO determination**. Confirm before relying on it.
- Several sites (eSanjeevani, Healthians, Amazon.in/clinic, sandbox.abdm.gov.in) return 403/503 to automated fetchers; those entries rely on press and official secondary sources and are marked accordingly.

---

*Prepared for Ramsay, Aetos Tech Labs LLP. Fifth document in the Medical Hub set.*
