"""
Follow-up Engine add-on. Subscribes to encounter.finished, checks the
diagnosed condition against a care-plan cadence table, and schedules a
WhatsApp recall nudge. Cadence table and WhatsApp send are stubbed.
"""
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Aetos One Clinics — Follow-up Engine Add-on")

# ICD-10 code -> recall interval in days. Seed set; extend from real care plans.
CARE_PLAN_CADENCE_DAYS = {
    "E11": 90,  # Type 2 diabetes mellitus
    "I10": 90,  # Essential hypertension
    "J45": 30,  # Asthma
}


class EncounterFinishedEvent(BaseModel):
    organizationId: str
    encounterId: str
    conditionCodes: list[str] = []


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "follow-up", "version": "0.1.0"}


@app.post("/events/encounter.finished")
async def on_encounter_finished(event: EncounterFinishedEvent):
    scheduled = []
    for code in event.conditionCodes:
        prefix = code[:3]
        if prefix in CARE_PLAN_CADENCE_DAYS:
            scheduled.append({"code": code, "recallInDays": CARE_PLAN_CADENCE_DAYS[prefix]})
    # TODO: persist scheduled recalls and send WhatsApp nudges when due.
    return {"encounterId": event.encounterId, "scheduled": scheduled}
