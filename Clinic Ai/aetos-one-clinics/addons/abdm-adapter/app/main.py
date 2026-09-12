"""
ABDM Adapter add-on (HIP/HIU) — see docs/architecture.md 3.4.

This process is the seam described in the project proposal's Bahmni evaluation:
it exposes a stable internal API (/abha/*, /consent/*, /fhir-bundle/*) to the
core, and internally either (a) proxies to a Bahmni BahmniIndiaDistro HIP/HIU
deployment, or (b) implements NHA's ABDM-wrapper callbacks directly. Neither
integration is wired in this scaffold — see docs/build-status.md — but the
contract below is stable so the rest of the product can be built against it now.
"""
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Aetos One Clinics — ABDM Adapter Add-on")


class CreateAbhaRequest(BaseModel):
    organizationId: str
    patientId: str
    aadhaarOrMobile: str


class LinkCareContextRequest(BaseModel):
    organizationId: str
    patientId: str
    abhaAddress: str
    encounterId: str


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "abdm-adapter", "version": "0.1.0"}


@app.post("/abha/create-or-verify")
async def create_or_verify_abha(req: CreateAbhaRequest):
    # TODO: NHA M1 flow — OTP verification via Aadhaar/mobile, or QR-based
    # PHR app linking. Return the real ABHA number/address once implemented.
    raise NotImplementedError("Wire to BahmniIndiaDistro HIP service or NHA ABDM-wrapper (M1).")


@app.post("/consent/link-care-context")
async def link_care_context(req: LinkCareContextRequest):
    # TODO: NHA M2 (HIP) — register this encounter as a care context so the
    # patient's PHR app can request and consent to sharing it.
    raise NotImplementedError("Wire to BahmniIndiaDistro HIP service or NHA ABDM-wrapper (M2).")


@app.get("/health-records/{patient_id}")
async def fetch_longitudinal_history(patient_id: str):
    # TODO: NHA M3 (HIU) — fetch consented longitudinal history from other
    # providers via the ABDM gateway.
    raise NotImplementedError("Wire to BahmniIndiaDistro HIU service or NHA ABDM-wrapper (M3).")
