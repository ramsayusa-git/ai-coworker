"""
Aetos One Clinics — AI Scribe add-on.

POST /generate takes { organizationId, encounterId, input } where `input` is
either a raw transcript string or a reference (URL/object key) to recorded
consultation audio. In this scaffold, ASR is stubbed (see _transcribe) — wire
it to the configured provider (Sarvam / AI4Bharat / Vertex Chirp, per
addon.yaml's asr_provider config) before enabling in production. The LLM
structuring step is real and runs against Anthropic.

The output is always a *draft*: the API stores it on Encounter.soapNoteJson
with generatedBy: "ai-scribe" and the web UI must show it in a diff/review
view before a doctor can finalize the encounter — see docs/architecture.md
3.3 "AI Scribe" row, safety control column.
"""
import os
import json
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Aetos One Clinics — AI Scribe Add-on")


class GenerateRequest(BaseModel):
    organizationId: str
    encounterId: str
    input: str  # transcript text, or "audio-ref:<key>" for recorded audio


class SoapNote(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str


class DraftCondition(BaseModel):
    codeSystem: str
    code: str
    display: str


class DraftMedication(BaseModel):
    medicationCode: str
    medicationName: str
    dosageText: str


class GenerateResponse(BaseModel):
    soapNote: SoapNote
    draftConditions: list[DraftCondition]
    draftMedications: list[DraftMedication]


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "ai-scribe", "version": "0.1.0"}


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    transcript = await _transcribe_if_audio(req.input)
    return await _structure_with_llm(transcript)


async def _transcribe_if_audio(input_value: str) -> str:
    if not input_value.startswith("audio-ref:"):
        return input_value
    # TODO: call the configured ASR provider (ASR_PROVIDER / ASR_API_KEY env vars,
    # set from this add-on's config — see addon.yaml). Sarvam and AI4Bharat both
    # expose a simple REST transcription endpoint; Vertex uses Chirp.
    raise NotImplementedError(
        "Audio transcription is not wired in this scaffold — configure an ASR "
        "provider and implement _transcribe_if_audio, or pass a transcript string directly."
    )


async def _structure_with_llm(transcript: str) -> GenerateResponse:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        # Config not set yet (add-on installed but not configured) — return an
        # empty-but-valid draft so the UI flow can still be exercised end to end.
        return GenerateResponse(
            soapNote=SoapNote(subjective=transcript, objective="", assessment="", plan=""),
            draftConditions=[],
            draftMedications=[],
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    prompt = f"""Structure this doctor-patient consultation transcript into a SOAP note and
draft clinical entities. Respond with ONLY a JSON object matching this shape:
{{
  "soapNote": {{"subjective": "...", "objective": "...", "assessment": "...", "plan": "..."}},
  "draftConditions": [{{"codeSystem": "icd10", "code": "...", "display": "..."}}],
  "draftMedications": [{{"medicationCode": "...", "medicationName": "...", "dosageText": "..."}}]
}}
Only include a medication if the doctor explicitly names one being prescribed — never infer one.

Transcript:
{transcript}"""

    message = client.messages.create(
        model="claude-3-5-sonnet-latest",
        max_tokens=1200,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(block.text for block in message.content if block.type == "text")
    data = json.loads(text)
    return GenerateResponse(**data)
