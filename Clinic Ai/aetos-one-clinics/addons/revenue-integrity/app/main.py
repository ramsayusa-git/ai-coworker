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


def _mentioned_in_line_items(name: str, line_items: list[dict]) -> bool:
    """A clinical item counts as billed if any invoice line item's `code` matches
    it exactly, or its free-text `description` mentions it (case-insensitive
    substring — line items are hand-typed free text today, see billing.service.ts;
    this is intentionally loose until line items carry structured codes)."""
    needle = name.strip().lower()
    if not needle:
        return True
    for item in line_items:
        code = str(item.get("code") or "").strip().lower()
        description = str(item.get("description") or "").strip().lower()
        if code and code == needle:
            return True
        if needle in description:
            return True
    return False


@app.post("/events/encounter.finished")
async def on_encounter_finished(event: EncounterFinishedEvent):
    headers = {"X-Org-Id": event.organizationId}
    async with httpx.AsyncClient(base_url=API_BASE_URL, headers=headers, timeout=5.0) as client:
        resp = await client.get(f"/invoices/unbilled-candidates/{event.encounterId}")
    if resp.status_code != 200:
        return {"encounterId": event.encounterId, "error": f"core API returned {resp.status_code}", "flagged": []}

    data = resp.json()
    encounter = data.get("encounter") or {}
    invoices = data.get("invoices") or []
    line_items: list[dict] = []
    for inv in invoices:
        line_items.extend(inv.get("lineItemsJson") or [])

    conditions = encounter.get("conditions", [])
    medications = encounter.get("medications", [])

    flagged = []
    for c in conditions:
        display = c.get("display") or c.get("code") or ""
        if not _mentioned_in_line_items(display, line_items) and not _mentioned_in_line_items(c.get("code", ""), line_items):
            flagged.append({"type": "condition", "code": c.get("code"), "display": display})
    for m in medications:
        name = m.get("medicationName") or m.get("medicationCode") or ""
        if not _mentioned_in_line_items(name, line_items) and not _mentioned_in_line_items(m.get("medicationCode", ""), line_items):
            flagged.append({"type": "medication", "code": m.get("medicationCode"), "display": name})

    return {
        "encounterId": event.encounterId,
        "invoiceCount": len(invoices),
        "lineItemCount": len(line_items),
        "conditionCount": len(conditions),
        "medicationCount": len(medications),
        "flagged": flagged,
        "flag": "review-recommended" if flagged else ("no-billable-items" if not (conditions or medications) else "none"),
    }
