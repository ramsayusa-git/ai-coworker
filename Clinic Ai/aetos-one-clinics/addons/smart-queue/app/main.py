"""
Smart Queue add-on. Subscribes to intake.completed and appointment.created,
computes a 0-100 triage score, and PATCHes it back onto the appointment via
PATCH /appointments/:id/triage-score on the core API. The appointments queue
endpoint (GET /appointments/queue) already sorts by triageScore desc, so once
this add-on is enabled the queue reorders itself with zero front-end changes.
"""
import os
from fastapi import FastAPI
from pydantic import BaseModel
import httpx

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3001")

app = FastAPI(title="Aetos One Clinics — Smart Queue Add-on")


class Vitals(BaseModel):
    heartRate: float | None = None          # bpm
    spo2: float | None = None               # %
    temperatureC: float | None = None       # Celsius
    systolicBp: float | None = None         # mmHg


class IntakeCompletedEvent(BaseModel):
    organizationId: str
    appointmentId: str
    redFlags: list[str] = []
    vitals: Vitals = Vitals()
    ageYears: float | None = None
    chronicConditionCount: int = 0


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "smart-queue", "version": "0.1.0"}


# Simple additive rule-based triage score (0-100, higher = see sooner). Deliberately
# transparent rules rather than a black-box model, so a front-desk user can see why
# a patient was bumped up the queue. Real thresholds should come from clinical
# review, not engineering guesswork — these are a documented starting point (see
# docs/build-status.md).
def _score_intake(event: "IntakeCompletedEvent") -> tuple[float, list[str]]:
    score = 20.0  # baseline for "checked in, nothing concerning reported yet"
    reasons: list[str] = []

    if event.redFlags:
        score += min(len(event.redFlags), 3) * 20.0
        reasons.append(f"{len(event.redFlags)} red flag(s) reported")

    v = event.vitals
    if v.spo2 is not None and v.spo2 < 92:
        score += 30.0
        reasons.append(f"low SpO2 ({v.spo2}%)")
    if v.heartRate is not None and (v.heartRate > 120 or v.heartRate < 50):
        score += 15.0
        reasons.append(f"abnormal heart rate ({v.heartRate} bpm)")
    if v.temperatureC is not None and v.temperatureC >= 39.0:
        score += 15.0
        reasons.append(f"high fever ({v.temperatureC}°C)")
    if v.systolicBp is not None and (v.systolicBp >= 180 or v.systolicBp < 90):
        score += 20.0
        reasons.append(f"abnormal blood pressure ({v.systolicBp} systolic)")

    if event.ageYears is not None and (event.ageYears >= 70 or event.ageYears <= 2):
        score += 10.0
        reasons.append(f"age {event.ageYears} in higher-priority band")

    if event.chronicConditionCount > 0:
        score += min(event.chronicConditionCount, 3) * 5.0
        reasons.append(f"{event.chronicConditionCount} chronic condition(s) on record")

    return min(score, 100.0), reasons


@app.post("/events/intake.completed")
async def on_intake_completed(event: IntakeCompletedEvent):
    score, reasons = _score_intake(event)
    headers = {"X-Org-Id": event.organizationId}
    async with httpx.AsyncClient(base_url=API_BASE_URL, headers=headers, timeout=5.0) as client:
        await client.patch(f"/appointments/{event.appointmentId}/triage-score", json={"triageScore": score})
    return {"appointmentId": event.appointmentId, "triageScore": score, "reasons": reasons}


@app.post("/events/appointment.created")
async def on_appointment_created(event: dict):
    # No intake data yet — leave triageScore unset (queue falls back to token order).
    return {"received": True}
