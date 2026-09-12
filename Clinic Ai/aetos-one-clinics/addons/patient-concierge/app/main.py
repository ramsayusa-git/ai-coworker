"""
Patient Concierge add-on. Named as one of Aetos One Clinics' 9 AI agents but
had zero implementation before this pass. Scope: draft a reply to a routine
patient question (hours, directions, prep instructions, billing status) for
a staff member to review and send — never auto-sent, never clinical advice.
This mirrors arogyam.ai's CarePro rule ("any clinical question is deferred
to the doctor") rather than trying to answer everything.
"""
import os
from fastapi import FastAPI
from pydantic import BaseModel

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

app = FastAPI(title="Aetos One Clinics — Patient Concierge Add-on")

CLINICAL_KEYWORDS = [
    "pain", "symptom", "dose", "dosage", "side effect", "diagnosis",
    "prescription", "medicine", "medication", "fever", "bleeding",
]


class InquiryEvent(BaseModel):
    organizationId: str
    patientId: str
    question: str
    clinicName: str = "the clinic"


class DraftReply(BaseModel):
    reply: str
    requiresStaffReview: bool
    deferredToClinical: bool


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "patient-concierge", "version": "0.1.0"}


def _looks_clinical(question: str) -> bool:
    lowered = question.lower()
    return any(kw in lowered for kw in CLINICAL_KEYWORDS)


async def _draft_with_llm(question: str, clinic_name: str) -> str:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    prompt = (
        f"You are a front-desk assistant for {clinic_name}, an Indian outpatient clinic. "
        "Draft a short, warm reply to this patient question. Only answer logistics "
        "(hours, directions, appointment/billing status, prep instructions). "
        "Do not give any medical advice.\n\nQuestion: " + question
    )
    resp = await client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in resp.content if hasattr(block, "text")).strip()


def _draft_heuristic(question: str, clinic_name: str) -> str:
    return (
        f"Thanks for reaching out to {clinic_name}. A staff member will follow up on "
        "your question shortly."
    )


@app.post("/events/patient.inquiry")
async def on_patient_inquiry(event: InquiryEvent) -> DraftReply:
    if _looks_clinical(event.question):
        return DraftReply(
            reply="This looks like a clinical question — please route it to the doctor rather than sending an automated reply.",
            requiresStaffReview=True,
            deferredToClinical=True,
        )

    if ANTHROPIC_API_KEY:
        reply = await _draft_with_llm(event.question, event.clinicName)
    else:
        reply = _draft_heuristic(event.question, event.clinicName)

    return DraftReply(reply=reply, requiresStaffReview=True, deferredToClinical=False)
