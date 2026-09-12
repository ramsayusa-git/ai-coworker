"""Unauthenticated health endpoint (for systemd/uptime checks)."""
from fastapi import APIRouter, Request

from app.services import system_service

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz(request: Request) -> dict:
    return await system_service.health_snapshot(request.app.state.redis)
