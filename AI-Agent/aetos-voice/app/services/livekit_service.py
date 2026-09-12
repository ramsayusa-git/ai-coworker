"""LiveKit server access: rooms overview + access tokens for test calls.

Uses the ``livekit-api`` SDK. Everything degrades gracefully when the local
livekit-server is down or credentials are missing — pages render with an
"offline" banner instead of erroring.
"""
from __future__ import annotations

import datetime
import time
from dataclasses import dataclass, field

from app.config import Settings

try:  # optional import so the app boots even without the SDK installed
    from livekit import api as lk_api
    HAVE_SDK = True
except ImportError:  # pragma: no cover
    lk_api = None
    HAVE_SDK = False


@dataclass
class RoomsOverview:
    available: bool = False
    error: str | None = None
    rooms: list[dict] = field(default_factory=list)


def configured(settings: Settings) -> bool:
    return bool(HAVE_SDK and settings.livekit_url and settings.livekit_api_key and settings.livekit_api_secret)


def _http_url(ws_url: str) -> str:
    return ws_url.replace("ws://", "http://").replace("wss://", "https://")


async def rooms_overview(settings: Settings) -> RoomsOverview:
    if not HAVE_SDK:
        return RoomsOverview(error="livekit-api SDK not installed")
    if not configured(settings):
        return RoomsOverview(error="LiveKit not configured (APP_LIVEKIT_URL / _API_KEY / _API_SECRET)")
    client = lk_api.LiveKitAPI(
        url=_http_url(settings.livekit_url),
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret,
    )
    try:
        resp = await client.room.list_rooms(lk_api.ListRoomsRequest())
        rooms = []
        for room in resp.rooms:
            participants = await client.room.list_participants(
                lk_api.ListParticipantsRequest(room=room.name)
            )
            rooms.append(
                {
                    "name": room.name,
                    "num_participants": room.num_participants,
                    "created_at": room.creation_time,
                    "age_seconds": max(0, int(time.time() - room.creation_time)),
                    "participants": [
                        {"identity": p.identity, "name": p.name, "is_agent": p.kind == 4}
                        for p in participants.participants
                    ],
                }
            )
        return RoomsOverview(available=True, rooms=rooms)
    except Exception as exc:  # server down, bad creds, ...
        return RoomsOverview(error=f"LiveKit server unreachable: {exc.__class__.__name__}")
    finally:
        await client.aclose()


def build_join_token(settings: Settings, room: str, identity: str, name: str | None = None) -> str:
    """Mint a short-lived join token for the browser test call."""
    if not configured(settings):
        raise RuntimeError("LiveKit not configured")
    token = (
        lk_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_name(name or identity)
        .with_ttl(datetime.timedelta(hours=1))
        .with_grants(
            lk_api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
    )
    return token.to_jwt()
