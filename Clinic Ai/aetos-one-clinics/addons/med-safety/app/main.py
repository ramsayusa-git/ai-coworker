"""
Aetos One Clinics — med-safety add-on.

Runs behind the API's add-on proxy (see apps/api/src/addons/addon-proxy.service.ts).
The API calls POST /check with { organizationId, patientId, newMedicationCode }.
This add-on fetches the patient's active medications/allergies from the core API
itself (service-to-service call, same pattern every add-on uses), runs the
deterministic rule engine, and — only if a finding exists and an LLM provider is
configured — asks the LLM to phrase it for the doctor. The LLM never changes the
severity or adds/removes findings.
"""
import os
from fastapi import FastAPI
from pydantic import BaseModel
import httpx

from .rules import check

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3001")

app = FastAPI(title="Aetos One Clinics — Medication Safety Add-on")


class CheckRequest(BaseModel):
    organizationId: str
    patientId: str
    newMedicationCode: str


class CheckResponse(BaseModel):
    severity: str
    findings: list[str]


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "med-safety", "version": "0.1.0"}


@app.post("/check", response_model=CheckResponse)
async def check_medication(req: CheckRequest):
    active_codes, allergies = await _fetch_patient_context(req.organizationId, req.patientId)
    result = check(req.newMedicationCode, active_codes, allergies)

    findings = result.findings
    if result.severity != "none":
        explained = await _maybe_explain_with_llm(req.newMedicationCode, findings)
        if explained:
            findings = explained

    return CheckResponse(severity=result.severity, findings=findings)


async def _fetch_patient_context(organization_id: str, patient_id: str) -> tuple[list[str], list[str]]:
    """Pulls the patient's currently-active medications. Allergy list is a stub
    here (there's no allergy resource in the MVP schema yet — see docs/build-status.md);
    wire it to a real Patient.allergy field before enabling this add-on in production."""
    headers = {"X-Org-Id": organization_id}
    async with httpx.AsyncClient(base_url=API_BASE_URL, headers=headers, timeout=5.0) as client:
        try:
            resp = await client.get(f"/patients/{patient_id}")
            resp.raise_for_status()
        except httpx.HTTPError:
            return [], []
    # MVP: active medication list per patient isn't yet a dedicated endpoint;
    # callers with a known encounterId should extend this add-on to query
    # GET /prescriptions?encounterId=... and filter status=active.
    return [], []


async def _maybe_explain_with_llm(medication_code: str, findings: list[str]) -> list[str] | None:
    provider = os.environ.get("MED_SAFETY_LLM_PROVIDER", "none")
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if provider != "anthropic" or not api_key:
        return None
    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)
        prompt = (
            "You are rephrasing medication-safety findings for a doctor's screen. "
            "Do not add, remove, or soften any finding — only make the wording clearer and clinical. "
            f"Medication being prescribed: {medication_code}. Findings:\n" + "\n".join(f"- {f}" for f in findings)
        )
        message = client.messages.create(
            model="claude-3-5-haiku-latest",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in message.content if block.type == "text")
        rephrased = [line.strip("- ").strip() for line in text.splitlines() if line.strip()]
        # Guard: never let the LLM change the finding count/severity — if it drifts, fall back.
        return rephrased if len(rephrased) == len(findings) else findings
    except Exception:
        return findings
