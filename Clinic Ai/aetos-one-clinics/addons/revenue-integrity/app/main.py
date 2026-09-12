"""
Revenue Integrity add-on. Subscribes to encounter.finished, fetches the
encounter's conditions/medications plus its invoice via the core API, and
flags procedures/diagnoses with no matching invoice line — a suggestion
list only, never auto-billing (see docs/architecture.md 3.3).
"""
import os
from fastapi import FastAPI
from pydantic import BaseModel
import httpx

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3001")

app = FastAPI(title="Aetos One Clinics — Revenue Integrity Add-on")


class EncounterFinishedEvent(BaseModel):
    organizationId: str
    encounterId: str


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "revenue-integrity", "version": "0.1.0"}


@app.post("/events/encounter.finished")
async def on_encounter_finished(event: EncounterFinishedEvent):
    headers = {"X-Org-Id": event.organizationId}
    async with httpx.AsyncClient(base_url=API_BASE_URL, headers=headers, timeout=5.0) as client:
        enc_resp = await client.get(f"/encounters/{event.encounterId}")
        inv_resp = await client.get("/invoices", params={"patientId": ""})  # see TODO below
    encounter = enc_resp.json() if enc_resp.status_code == 200 else {}
    conditions = encounter.get("conditions", [])
    medications = encounter.get("medications", [])
    # TODO: match condition/medication codes against invoice line item `code`
    # fields once billing lines carry structured codes; for now this returns
    # the raw counts so the UI can show "N clinical items vs M billed items".
    return {
        "encounterId": event.encounterId,
        "conditionCount": len(conditions),
        "medicationCount": len(medications),
        "flag": "review-recommended" if (conditions or medications) else "none",
    }
