"""
Command Center add-on. Named as one of Aetos One Clinics' 9 AI agents but
had zero implementation before this pass. Scope: pull together numbers that
already exist across the core API into one "how is my clinic doing right
now" summary, rather than making the owner open three separate screens.

This add-on calls back into the core API with the caller's own org context
(same pattern as revenue-integrity and smart-queue) — it holds no state of
its own.
"""
import os
from datetime import datetime, timezone
from fastapi import FastAPI
from pydantic import BaseModel
import httpx

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3001")

app = FastAPI(title="Aetos One Clinics — Command Center Add-on")


class SummaryRequest(BaseModel):
    organizationId: str


@app.get("/health")
async def health():
    return {"status": "ok", "addon": "command-center", "version": "0.1.0"}


@app.post("/summary")
async def summary(req: SummaryRequest):
    headers = {"X-Org-Id": req.organizationId, "X-Role": "OWNER"}
    async with httpx.AsyncClient(base_url=API_BASE_URL, headers=headers, timeout=8.0) as client:
        queue_resp, invoices_resp, addons_resp = await client.get("/appointments/queue"), None, None
        try:
            invoices_resp = await client.get("/invoices")
        except httpx.HTTPError:
            pass
        try:
            addons_resp = await client.get("/addons")
        except httpx.HTTPError:
            pass

    queue = queue_resp.json() if queue_resp.status_code == 200 else []
    invoices = invoices_resp.json() if invoices_resp is not None and invoices_resp.status_code == 200 else []
    addons = addons_resp.json() if addons_resp is not None and addons_resp.status_code == 200 else []

    waiting = [a for a in queue if a.get("status") == "booked"]
    revenue_today = sum(
        float(inv.get("totalAmount", 0))
        for inv in invoices
        if inv.get("status") == "paid" and _is_today(inv.get("paidAt"))
    )
    unpaid = [inv for inv in invoices if inv.get("status") != "paid"]
    addon_health = [
        {"slug": a["manifest"]["slug"], "enabled": a["state"]["enabled"], "healthy": a["state"].get("lastHealthOk")}
        for a in addons
    ]
    enabled_unhealthy = [a for a in addon_health if a["enabled"] and a["healthy"] is False]

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "queue": {"waitingCount": len(waiting), "totalToday": len(queue)},
        "revenue": {"collectedToday": revenue_today, "unpaidInvoiceCount": len(unpaid)},
        "addons": {"enabledCount": sum(1 for a in addon_health if a["enabled"]), "unhealthyCount": len(enabled_unhealthy)},
        "alerts": (
            [f"{len(enabled_unhealthy)} enabled add-on(s) failing health checks" for _ in [0] if enabled_unhealthy]
            + [f"{len(unpaid)} unpaid invoice(s)" for _ in [0] if unpaid]
        ),
    }


def _is_today(iso_ts: str | None) -> bool:
    if not iso_ts:
        return False
    try:
        ts = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    except ValueError:
        return False
    now = datetime.now(timezone.utc)
    return ts.date() == now.date()
