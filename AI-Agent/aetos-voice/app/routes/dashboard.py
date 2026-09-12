"""Main dashboard page (requires login)."""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse

from app.security.auth import current_user
from app.services import agent_service, call_service, system_service

router = APIRouter(tags=["dashboard"])


@router.get("/", response_class=HTMLResponse)
async def index(request: Request, session: dict = Depends(current_user)):
    store = request.app.state.redis
    health = await system_service.health_snapshot(store)
    try:
        agents = await agent_service.list_agents(store)
        call_stats = await call_service.call_stats_today(store)
    except Exception:
        agents, call_stats = [], {"total": 0, "active": 0, "total_minutes": 0}
    return request.app.state.templates.TemplateResponse(
        request,
        "dashboard/index.html.j2",
        {
            "session": session,
            "health": health,
            "agents_total": len(agents),
            "agents_active": len([a for a in agents if a.active]),
            "call_stats": call_stats,
            "insecure_defaults": request.app.state.settings.insecure_defaults,
            "active_nav": "dashboard",
        },
    )
