"""
Pre-visit Intake add-on. Subscribes to appointment.created (see addon.yaml)
and drives a WhatsApp conversation to collect complaints/duration/vitals,
publishing intake.completed back to the bus when done. WhatsApp send/receive
webhooks are stubbed here — wire the Meta Cloud API (or a BSP) using
whatsapp_business_token from this add-on's config.
"""
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Aetos One Clinics — Pre-visit Intake Add-on")


class AppointmentCreatedEvent(BaseModel):
    organizationId: str
    appointmentId: str


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "intake", "version": "0.1.0"}


@app.post("/events/appointment.created")
async def on_appointment_created(event: AppointmentCreatedEvent):
    # TODO: look up patient phone via the core API, send the WhatsApp intake
    # flow, and on completion POST intake results + publish "intake.completed".
    return {"received": True, "appointmentId": event.appointmentId}
