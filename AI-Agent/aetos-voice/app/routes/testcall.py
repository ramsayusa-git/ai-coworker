"""Browser test call: sandbox page + join-token endpoint.

The page joins a LiveKit room named ``test-<agent_id>-<suffix>`` using the
livekit-client JS SDK; the agent worker picks the agent config from the room
name. Audio only.
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

from app.security.auth import current_user, require_csrf
from app.services import agent_service, livekit_service

router = APIRouter(prefix="/test-call", tags=["test-call"])


@router.get("", response_class=HTMLResponse)
async def testcall_page(request: Request, session: dict = Depends(current_user)):
    settings = request.app.state.settings
    agents = await agent_service.list_agents(request.app.state.redis)
    return request.app.state.templates.TemplateResponse(
        request,
        "testcall/index.html.j2",
        {
            "session": session,
            "active_nav": "testcall",
            "agents": [a for a in agents if a.active],
            "livekit_ready": livekit_service.configured(settings),
            "livekit_url": settings.livekit_url,
        },
    )


@router.post("/token")
async def testcall_token(
    request: Request,
    agent_id: str = Form(...),
    csrf_token: str = Form(""),
    session: dict = Depends(current_user),
):
    require_csrf(request, session, csrf_token)
    settings = request.app.state.settings
    if not livekit_service.configured(settings):
        raise HTTPException(status_code=503, detail="LiveKit is not configured")
    try:
        agent = await agent_service.get_agent(request.app.state.redis, agent_id)
    except agent_service.AgentNotFound:
        raise HTTPException(status_code=404, detail="Agent not found")

    room = f"test-{agent.id}-{secrets.token_hex(3)}"
    identity = f"tester-{session.get('u', 'admin')}"
    token = livekit_service.build_join_token(settings, room=room, identity=identity)
    return JSONResponse(
        {"room": room, "token": token, "url": settings.livekit_url, "agent": agent.name}
    )
