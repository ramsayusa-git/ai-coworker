"""Rooms overview: active LiveKit rooms + participants + host health."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse

from app.security.auth import current_user
from app.services import livekit_service, system_service

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_class=HTMLResponse)
async def rooms_page(request: Request, session: dict = Depends(current_user)):
    settings = request.app.state.settings
    overview = await livekit_service.rooms_overview(settings)
    health = await system_service.health_snapshot(request.app.state.redis)
    return request.app.state.templates.TemplateResponse(
        request,
        "rooms/index.html.j2",
        {
            "session": session,
            "active_nav": "rooms",
            "overview": overview,
            "health": health,
            "livekit_url": settings.livekit_url,
        },
    )
