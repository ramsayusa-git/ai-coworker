"""LiveKit webhook receiver.

livekit-server POSTs signed events here (configure in livekit.yaml):

    webhook:
      api_key: <same key as the server's keys block>
      urls:
        - http://127.0.0.1:8100/webhooks/livekit

The Authorization header carries a JWT signed with the API secret; we verify
it with the SDK's WebhookReceiver. No session auth — signature IS the auth.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response

from app.services import call_service

logger = logging.getLogger("aetos.webhooks")

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

try:
    from livekit.api import TokenVerifier, WebhookReceiver
    HAVE_SDK = True
except ImportError:  # pragma: no cover
    HAVE_SDK = False


def _receiver(settings) -> "WebhookReceiver | None":
    if not (HAVE_SDK and settings.livekit_api_key and settings.livekit_api_secret):
        return None
    return WebhookReceiver(TokenVerifier(settings.livekit_api_key, settings.livekit_api_secret))


@router.post("/livekit")
async def livekit_webhook(request: Request):
    receiver = _receiver(request.app.state.settings)
    if receiver is None:
        return Response(status_code=503)
    body = await request.body()
    auth = request.headers.get("Authorization", "")
    try:
        event = receiver.receive(body.decode("utf-8"), auth)
    except Exception:
        logger.warning("webhook signature rejected")
        return Response(status_code=401)

    store = request.app.state.redis
    name = event.event
    room = event.room.name if event.room and event.room.name else None
    identity = event.participant.identity if event.participant and event.participant.identity else None

    if not room:
        return {"ok": True}
    if name == "room_started":
        await call_service.upsert_call(store, room)
    elif name == "room_finished":
        await call_service.end_call(store, room)
    elif name == "participant_joined" and identity:
        await call_service.add_participant(store, room, identity)
    return {"ok": True}
