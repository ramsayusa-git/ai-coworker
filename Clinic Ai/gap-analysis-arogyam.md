# Aetos One Clinics vs Arogyam.ai — Gap Analysis

Source: arogyam.ai public marketing site (homepage, /patient-features, /carepro, /portal, /pricing), since the trial-account login and WhatsApp OTP signup both failed on their side (Firebase invalid-credential error; OTP never delivered to a live number). No help center or in-depth demo video exists publicly — their YouTube channel (@Arogyam-1) has only two ~30-second teaser clips, no walkthroughs. This analysis is built from what arogyam.ai documents about itself, not from operating their app.

## 1. Feature-by-feature comparison

| Area | Arogyam.ai (claimed) | Aetos One Clinics (current) | Gap |
|---|---|---|---|
| EHR / charting | Voice consult → SOAP note in ~2 min (AI Scribe) | `ai-scribe` add-on structures **text** transcripts via Claude; ASR (voice-to-text) is a stub (`NotImplementedError`) | No real voice input path |
| 1-Click Visit Templates | 20+ OPD condition templates, auto-fill chief complaint/ICD-10/meds/tests/advice, AI can draft new templates from a 2-line description, prints on clinic letterhead in patient's language | **Built this session** — see below | Closed |
| Medication safety | Real-time interaction screening vs. "2.5 lakh+ Indian medication directory" | `med-safety` add-on has a real deterministic rule engine, but the drug set is a small hardcoded dict (4 interaction pairs, 1 allergy cross-reactivity rule), not a directory | Engine exists; data set is a toy subset |
| Smart queue | Prioritizes waiting room by clinical urgency | `smart-queue` add-on writes `triageScore` back to appointments; no actual scoring model, just plumbing | Scoring logic missing |
| Revenue integrity | Flags unbilled work / missed charges | `revenue-integrity` add-on is an empty event-handler skeleton | Not implemented |
| Follow-up engine | Automated recalls across WhatsApp/SMS/in-app | `follow-up` add-on is a skeleton; no actual message sending anywhere in the codebase | Not implemented |
| Pre-visit intake | Collects history/symptoms/vitals before the consult, WhatsApp-driven | `intake` add-on skeleton; smart-queue reads a `triageScore` PATCH from it, but nothing populates real intake data | Not implemented |
| **Command Center** | Named as one of the 9 agents — ops oversight | **Built this session** — see below | Closed |
| **Lab Insights** | Named as one of the 9 agents — lab result analysis | **Built this session** — see below | Closed |
| **Patient Concierge** | Named as one of the 9 agents — patient support | **Built this session** — see below | Closed |
| CarePro (WhatsApp front desk) | Own WhatsApp Business number answers 24/7: booking/reschedule/cancel, new-patient registration in-chat, no-show recovery, review requests, EN/HI/TE | **Not present.** Our `intake` add-on is unrelated in scope | No WhatsApp channel integration exists anywhere in the stack |
| Multi-channel messaging | WhatsApp + SMS + in-app, unified thread | Add-ons *reference* channels in manifests; zero actual send integration (no Twilio/WhatsApp Business API/SMS gateway wired up) | Entirely unimplemented |
| Billing | UPI + Razorpay built-in, auto-reconcile | `Invoice` model + basic CRUD (`/invoices`); no payment gateway integration, no reconciliation logic | Payments not wired |
| Patient portal | Web portal for booking/records | **Not present** — our web app is clinic-staff-only | Entire portal missing |
| **Patient mobile app** | Full separate consumer app: lab-report OCR + marker extraction, trend charts, "Arogyam Score", daily health story in plain language, medication reminders + adherence streak, Apple Health/Google Health Connect sync, "add a visit with any doctor" (works even without using the clinic), caregiver mode (planned), AI health coach chat (planned) | **Not present in any form** | This is a whole second product; nothing in our scaffold touches it |
| Multi-tenancy / RBAC / white-label | Not detailed publicly beyond "multi-clinic dashboard, centralized billing" | We have Organization→Location RLS, 4-role RBAC, full white-labeling (logo/favicon/footer/subdomain/custom domain) | **We are ahead here** — arogyam.ai doesn't advertise white-labeling at all |
| Add-on architecture | Not exposed publicly (monolithic product from the outside) | Full Home-Assistant-style add-on manifest/registry/supervisor system, MCP server for remote management | **We are ahead here** — this is architecture arogyam.ai doesn't have |
| ABDM readiness | "ABDM-ready" claimed | `abdm-adapter` add-on is contract-only stubs | Both are effectively unimplemented; parity |
| Multi-language | Templates/prescriptions in Hindi (live), Telugu (live), Tamil/Kannada (coming) | English only, everywhere | Not implemented |
| Practice analytics | Named as included in paid tiers | **Built this session** — see below | Closed |
| Compliance page | ISO 27001:2022 + 9001:2015 certified, AES-256, India data residency, dedicated `/hipaa-compliance` page | RLS + tenancy is real engineering; no equivalent documentation page (not urgent — we're pre-launch, they're marketing to buyers) | Documentation-only gap |
| Pricing/plan gating | 3 tiers (₹1,099 / ₹1,599 / ₹2,699) gate specific add-ons per plan | Add-on enable/disable exists per-org, but nothing ties it to a subscription/plan/billing state | Plan-to-add-on mapping missing |

## 2. What this session could not verify

Arogyam.ai's actual in-app screens (dashboard, appointment book, chart UI, billing screen, add-on/settings UI) were never seen — both the provided login (`ramsay.usa@gmail.com` / `AI@12345`, Firebase "invalid-credential") and a fresh trial signup (blocked: their WhatsApp OTP never arrived at the number provided, twice, after resend) failed. Everything above comes from their public marketing copy, which describes *what* each feature does but not *how the screen looks or behaves*. Anything about exact field layouts, click-paths, or in-app copy is unverified.

## 3. What was built this session (12 Sep 2026)

1. **1-Click Visit Templates** — new `VisitTemplate` Prisma model + RLS policy, 21 seeded Indian OPD condition templates (chief complaint, ICD-10, meds, tests, advice), `POST /visit-templates/draft` (AI drafts a new template from a 2-line description), `POST /visit-templates/:id/apply/:encounterId` (applies meds/tests to an encounter atomically), and a new "Visit Templates" page in the web app.
2. **Lab Insights add-on** — new FastAPI add-on (port 8108): `/events/labreport.uploaded` extracts named lab markers against reference ranges (LLM + heuristic fallback) and writes `Observation` rows back to the core API. New core-API endpoints `POST /encounters/:id/lab-report` and `POST /encounters/:id/observations`.
3. **Command Center add-on** — new FastAPI add-on (port 8109): `/summary` aggregates today's queue depth, revenue collected, and add-on health. New core-API endpoint `GET /command-center/summary`.
4. **Patient Concierge add-on** — new FastAPI add-on (port 8110): `/events/patient.inquiry` drafts patient-facing replies (LLM + heuristic fallback), with a keyword guard that refuses clinical questions and defers to staff. New core-API endpoint `POST /patient-concierge/draft-reply`.
5. **Practice analytics** — new `GET /analytics/overview?days=N` endpoint (appointments/no-shows, completed encounters, revenue collected, top-5 diagnoses) + a new "Analytics" page in the web app.

All five were verified against the running native dev servers (API on :3001, web on :5173) via curl and page-load checks — real seeded/computed data returned, no compile or HMR errors. The three new Python add-ons (lab-insights, command-center, patient-concierge) are not yet running as live processes in this native (non-Docker) dev setup, so `AddonProxyService` calls into them will fail with a connection error until they're started standalone or containerized.

## 4. Deliberately not attempted

CarePro / real WhatsApp Business API integration, the separate patient mobile app, and Razorpay payment-gateway wiring — each is a substantial separate build requiring external accounts/credentials the team doesn't yet have in hand, and none should be scaffolded speculatively.
