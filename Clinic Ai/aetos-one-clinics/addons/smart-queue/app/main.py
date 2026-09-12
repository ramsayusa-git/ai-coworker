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


class IntakeCompletedEvent(BaseModel):
    organizationId: str
    appointmentId: str
    redFlags: list[str] = []


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "smart-queue", "version": "0.1.0"}


@app.post("/events/intake.completed")
async def on_intake_completed(event: IntakeCompletedEvent):
    score = 90.0 if event.redFlags else 50.0
    headers = {"X-Org-Id": event.organizationId}
    async with httpx.AsyncClient(base_url=API_BASE_URL, headers=headers, timeout=5.0) as client:
        await client.patch(f"/appointments/{event.appointmentId}/triage-score", json={"triageScore": score})
    return {"appointmentId": event.appointmentId, "triageScore": score}


@app.post("/events/appointment.created")
async def on_appointment_created(event: dict):
    # No intake data yet — leave triageScore unset (queue falls back to token order).
    return {"received": True}
