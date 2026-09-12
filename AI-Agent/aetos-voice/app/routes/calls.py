"""Calls: history list with filters + transcript detail view."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse

from app.security.auth import current_user
from app.services import agent_service, call_service

router = APIRouter(prefix="/calls", tags=["calls"])


@router.get("", response_class=HTMLResponse)
async def calls_list(request: Request, session: dict = Depends(current_user)):
    store = request.app.state.redis
    agent_id = request.query_params.get("agent") or None
    date = request.query_params.get("date") or None
    direction = request.query_params.get("direction") or None
    calls = await call_service.list_calls(store, agent_id=agent_id, date=date, direction=direction)
    stats = await call_service.call_stats_today(store)
    agents = await agent_service.list_agents(store)
    return request.app.state.templates.TemplateResponse(
        request,
        "calls/list.html.j2",
        {
            "session": session,
            "active_nav": "calls",
            "calls": calls,
            "stats": stats,
            "agents": agents,
            "filter_agent": agent_id,
            "filter_date": date,
            "filter_direction": direction,
        },
    )


@router.get("/{call_id}", response_class=HTMLResponse)
async def call_detail(request: Request, call_id: str, session: dict = Depends(current_user)):
    store = request.app.state.redis
    call = await call_service.get_call(store, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    transcript = await call_service.get_transcript(store, call_id)
    return request.app.state.templates.TemplateResponse(
        request,
        "calls/detail.html.j2",
        {"session": session, "active_nav": "calls", "call": call, "transcript": transcript},
    )
