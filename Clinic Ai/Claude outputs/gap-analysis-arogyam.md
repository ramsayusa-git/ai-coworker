# Aetos One Clinics vs Arogyam.ai — Gap Analysis

Source: arogyam.ai public marketing site (homepage, /patient-features, /carepro, /portal, /pricing), since the trial-account login and WhatsApp OTP signup both failed on their side (Firebase invalid-credential error; OTP never delivered to a live number). No help center or in-depth demo video exists publicly — their YouTube channel (@Arogyam-1) has only two ~30-second teaser clips, no walkthroughs. This analysis is built from what arogyam.ai documents about itself, not from operating their app.

## 1. Feature-by-feature comparison

| Area | Arogyam.ai (claimed) | Aetos One Clinics (current) | Gap |
|---|---|---|---|
| EHR / charting | Voice consult → SOAP note in ~2 min (AI Scribe) | `ai-scribe` add-on structures **text** transcripts via Claude; ASR (voice-to-text) is a stub (`NotImplementedError`) | No real voice input path |
| 1-Click Visit Templates | 20+ OPD condition templates, auto-fill chief complaint/ICD-10/meds/tests/advice, AI can draft new templates from a 2-line description, prints on clinic letterhead in patient's language | **Not present at all** | Full feature missing |
| Medication safety | Real-time interaction screening vs. "2.5 lakh+ Indian medication directory" | `med-safety` add-on has a real deterministic rule engine, but the drug set is a small hardcoded dict (4 interaction pairs, 1 allergy cross-reactivity rule), not a directory | Engine exists; data set is a toy subset |
| Smart queue | Prioritizes waiting room by clinical urgency | `smart-queue` add-on writes `triageScore` back to appointments; no actual scoring model, just plumbing | Scoring logic missing |
| Revenue integrity | Flags unbilled work / missed charges | `revenue-integrity` add-on is an empty event-handler skeleton | Not implemented |
| Follow-up engine | Automated recalls across WhatsApp/SMS/in-app | `follow-up` add-on is a skeleton; no actual message sending anywhere in the codebase | Not implemented |
| Pre-visit intake | Collects history/symptoms/vitals before the consult, WhatsApp-driven | `intake` add-on skeleton; smart-queue reads a `triageScore` PATCH from it, but nothing populates real intake data | Not implemented |
| **Command Center** | Named as one of the 9 agents — ops oversight | **Not present** | Missing add-on + no ops dashboard endpoint |
| **Lab Insights** | Named as one of the 9 agents — lab result analysis | **Not present** | Missing add-on entirely; no lab-report ingestion path |
| **Patient Concierge** | Named as one of the 9 agents — patient support | **Not present** | Missing add-on |
| CarePro (WhatsApp front desk) | Own WhatsApp Business number answers 24/7: booking/reschedule/cancel, new-patient registration in-chat, no-show recovery, review requests, EN/HI/TE | **Not present.** Our `intake` add-on is unrelated in scope | No WhatsApp channel integration exists anywhere in the stack |
| Multi-channel messaging | WhatsApp + SMS + in-app, unified thread | Add-ons *reference* channels in manifests; zero actual send integration (no Twilio/WhatsApp Business API/SMS gateway wired up) | Entirely unimplemented |
| Billing | UPI + Razorpay built-in, auto-reconcile | `Invoice` model + basic CRUD (`/invoices`); no payment gateway integration, no reconciliation logic | Payments not wired |
| Patient portal | Web portal for booking/records | **Not present** — our web app is clinic-staff-only | Entire portal missing |
| **Patient mobile app** | Full separate consumer app: lab-report OCR + marker extraction, trend charts, "Arogyam Score", daily health story in plain language, medication reminders + adherence streak, Apple Health/Google Health Connect sync, "add a visit with any doctor" (works even without using the clinic), caregiver mode (planned), AI health coach chat (planned) | **Not present in any form** | This is a whole second product; nothing in our scaffold touches it |
| Multi-tenancy / RBAC / white-label | Not detailed publicly beyond "multi-clinic dashboard, centralized billing" | We have Organization→Location RLS, 4-role RBAC, full white-labeling (logo/favicon/footer/subdomain/custom domain) | **We are ahead here** — arogyam.ai doesn't advertise white-labeling at all |
| Add-on architecture | Not exposed publicly (monolithic product from the outside) | Full Home-Assistant-style add-on manifest/registry/supervisor system, MCP server for remote management | **We are ahead here** — this is architecture arogyam.ai doesn't have |
| ABDM readiness | "ABDM-ready" claimed | `abdm-adapter` add-on is contract-only stubs | Both are effectively unimplemented; parity |
| Multi-language | Templates/prescriptions in Hindi (live), Telugu (live), Tamil/Kannada (coming) | English only, everywhere | Not implemented |
| Practice analytics | Named as included in paid tiers | No analytics/reporting endpoint or page at all | Not implemented |
| Compliance page | ISO 27001:2022 + 9001:2015 certified, AES-256, India data residency, dedicated `/hipaa-compliance` page | RLS + tenancy is real engineering; no equivalent documentation page (not urgent — we're pre-launch, they're marketing to buyers) | Documentation-only gap |
| Pricing/plan gating | 3 tiers (₹1,099 / ₹1,599 / ₹2,699) gate specific add-ons per plan | Add-on enable/disable exists per-org, but nothing ties it to a subscription/plan/billing state | Plan-to-add-on mapping missing |

## 2. What this session could not verify

Arogyam.ai's actual in-app screens (dashboard, appointment book, chart UI, billing screen, add-on/settings UI) were never seen — both the provided login (`ramsay.usa@gmail.com` / `AI@12345`, Firebase "invalid-credential") and a fresh trial signup (blocked: their WhatsApp OTP never arrived at the number provided, twice, after resend) failed. Everything above comes from their public marketing copy, which describes *what* each feature does but not *how the screen looks or behaves*. Anything about exact field layouts, click-paths, or in-app copy is unverified.

## 3. Priority ranking for what to build next

1. **1-Click Visit Templates** — explicitly named, high visible value, no dependency on external services. Buildable now.
2. **Lab Insights add-on** — currently a complete gap (not even a stub existed); add the add-on skeleton + an `Observation` ingestion contract so it has somewhere to land later.
3. **Command Center** — ops-oversight aggregation is cheap to build against data we already have (today's appointments, revenue, add-on health) and was a named agent with literally nothing behind it.
4. **Patient Concierge** — add the add-on skeleton (matches the same pattern as the other 6 add-ons) so the "9 agents" claim has 9 real placeholders instead of 6.
5. **Practice analytics endpoint** — cheap, high-value, was completely absent.
6. CarePro / real WhatsApp channel integration, the patient mobile app, and payment-gateway wiring are **not** attempted in this pass — each is a substantial separate build (a WhatsApp Business API account + webhook infra, a second mobile app/codebase, and a Razorpay merchant integration respectively) and shouldn't be scaffolded speculatively without those accounts/credentials in hand.

Items 1–5 above were implemented in this session — see `docs/build-status.md` in the repo for the up-to-date stub/implemented list.
