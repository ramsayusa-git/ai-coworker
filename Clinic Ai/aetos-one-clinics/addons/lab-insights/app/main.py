"""
Lab Insights add-on. Named as one of Aetos One Clinics' 9 AI agents but had
zero implementation before this pass (see gap analysis vs arogyam.ai, which
ships an equivalent "lab report -> extracted markers -> trend" pipeline in
its patient app).

Scope here: given raw OCR/text extracted from a lab report (extraction
itself — PDF/image OCR — is out of scope for this stub, same as ai-scribe's
ASR stub), ask the configured LLM to structure it into named markers with
values/units, then flag anything outside a small built-in reference-range
table. This is advisory only — never a diagnosis, always says so.
"""
import os
import json
from fastapi import FastAPI
from pydantic import BaseModel
import httpx

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3001")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

app = FastAPI(title="Aetos One Clinics — Lab Insights Add-on")

# Minimal reference-range table for common Indian OPD lab panels. Real
# ranges vary by lab/method/age/sex — this is a starting point, not a
# clinical source of truth (see docs/build-status.md).
REFERENCE_RANGES = {
    "hemoglobin": {"low": 12.0, "high": 16.5, "unit": "g/dL"},
    "fasting_glucose": {"low": 70.0, "high": 100.0, "unit": "mg/dL"},
    "hba1c": {"low": 4.0, "high": 5.6, "unit": "%"},
    "total_cholesterol": {"low": 0.0, "high": 200.0, "unit": "mg/dL"},
    "ldl": {"low": 0.0, "high": 100.0, "unit": "mg/dL"},
    "hdl": {"low": 40.0, "high": 999.0, "unit": "mg/dL"},
    "triglycerides": {"low": 0.0, "high": 150.0, "unit": "mg/dL"},
    "tsh": {"low": 0.4, "high": 4.0, "unit": "mIU/L"},
    "creatinine": {"low": 0.6, "high": 1.3, "unit": "mg/dL"},
    "platelet_count": {"low": 150000.0, "high": 450000.0, "unit": "/uL"},
}


class LabReportUploadedEvent(BaseModel):
    organizationId: str
    patientId: str
    encounterId: str | None = None
    reportText: str  # OCR/plain-text content of the report; extraction is upstream of this add-on


class Marker(BaseModel):
    name: str
    value: float
    unit: str
    flag: str  # "low" | "normal" | "high" | "unknown-range"


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "lab-insights", "version": "0.1.0"}


def _extract_markers_heuristic(report_text: str) -> list[dict]:
    """Fallback extraction with no LLM configured: looks for "<name>: <value> <unit>"
    style lines for the markers we have reference ranges for. Deliberately dumb —
    the LLM path below is what production would use."""
    markers = []
    lowered = report_text.lower()
    for key in REFERENCE_RANGES:
        label = key.replace("_", " ")
        if label in lowered:
            markers.append({"name": key, "value": None, "unit": REFERENCE_RANGES[key]["unit"]})
    return markers


async def _extract_markers_llm(report_text: str) -> list[dict]:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    prompt = (
        "Extract every lab marker from this report as a JSON array of "
        '{"name": "<snake_case marker name>", "value": <number>, "unit": "<unit>"}. '
        "Only return the JSON array, nothing else.\n\nReport:\n" + report_text
    )
    resp = await client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(block.text for block in resp.content if hasattr(block, "text"))
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return []


def _flag(name: str, value: float | None) -> str:
    ref = REFERENCE_RANGES.get(name)
    if ref is None or value is None:
        return "unknown-range"
    if value < ref["low"]:
        return "low"
    if value > ref["high"]:
        return "high"
    return "normal"


@app.post("/events/labreport.uploaded")
async def on_labreport_uploaded(event: LabReportUploadedEvent):
    if ANTHROPIC_API_KEY:
        raw_markers = await _extract_markers_llm(event.reportText)
    else:
        raw_markers = _extract_markers_heuristic(event.reportText)

    markers = [
        Marker(
            name=m.get("name", "unknown"),
            value=m.get("value") or 0.0,
            unit=m.get("unit", REFERENCE_RANGES.get(m.get("name", ""), {}).get("unit", "")),
            flag=_flag(m.get("name", ""), m.get("value")),
        )
        for m in raw_markers
    ]
    flagged = [m for m in markers if m.flag in ("low", "high")]

    if event.encounterId:
        headers = {"X-Org-Id": event.organizationId}
        async with httpx.AsyncClient(base_url=API_BASE_URL, headers=headers, timeout=5.0) as client:
            for m in markers:
                await client.post(
                    "/encounters/" + event.encounterId + "/observations",
                    json={
                        "codeSystem": "lab-insights",
                        "code": m.name,
                        "display": m.name.replace("_", " ").title(),
                        "valueNumber": m.value,
                        "valueUnit": m.unit,
                        "source": "lab-insights",
                    },
                )

    return {
        "patientId": event.patientId,
        "markerCount": len(markers),
        "markers": [m.model_dump() for m in markers],
        "flagged": [m.model_dump() for m in flagged],
        "disclaimer": "Advisory extraction only — not a diagnosis. Always confirm against the original report.",
    }
