"""Agent editor: list, create, edit, delete, prompt history + restore (SSR)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse

from app.models.agent import (
    DEFAULT_MODELS,
    DEFAULT_VOICES,
    LLM_PROVIDERS,
    STT_PROVIDERS,
    TTS_PROVIDERS,
    TURN_DETECTION_MODES,
    AgentConfig,
)
from app.security.auth import current_user, require_csrf
from app.services import agent_service

router = APIRouter(prefix="/agents", tags=["agents"])


def _ctx(request: Request, **extra):
    return {
        "active_nav": "agents",
        "llm_providers": LLM_PROVIDERS,
        "stt_providers": STT_PROVIDERS,
        "tts_providers": TTS_PROVIDERS,
        "turn_modes": TURN_DETECTION_MODES,
        "default_models": DEFAULT_MODELS,
        "default_voices": DEFAULT_VOICES,
        **extra,
    }


def _snapshot_dir(request: Request):
    return request.app.state.settings.data_dir_path


def _form_to_agent_data(form: dict) -> dict:
    return {
        "name": form.get("name", "").strip(),
        "system_prompt": form.get("system_prompt", "").strip(),
        "greeting": form.get("greeting", "").strip(),
        "active": form.get("active") == "on",
        "llm": {
            "provider": form.get("llm_provider", "openai"),
            "model": form.get("llm_model", "").strip() or DEFAULT_MODELS["llm"].get(form.get("llm_provider", "openai"), ""),
            "temperature": float(form.get("llm_temperature", 0.7) or 0.7),
        },
        "stt": {
            "provider": form.get("stt_provider", "openai"),
            "model": form.get("stt_model", "").strip() or DEFAULT_MODELS["stt"].get(form.get("stt_provider", "openai"), ""),
            "language": form.get("stt_language", "en").strip() or "en",
        },
        "tts": {
            "provider": form.get("tts_provider", "openai"),
            "model": form.get("tts_model", "").strip() or DEFAULT_MODELS["tts"].get(form.get("tts_provider", "openai"), ""),
            "voice": form.get("tts_voice", "").strip() or DEFAULT_VOICES.get(form.get("tts_provider", "openai"), ""),
        },
        "turn": {
            "mode": form.get("turn_mode", "vad"),
            "vad_min_silence": float(form.get("vad_min_silence", 0.55) or 0.55),
            "vad_activation_threshold": float(form.get("vad_activation_threshold", 0.5) or 0.5),
            "allow_interruptions": form.get("allow_interruptions") == "on",
        },
    }


@router.get("", response_class=HTMLResponse)
async def agents_list(request: Request, session: dict = Depends(current_user)):
    agents = await agent_service.list_agents(request.app.state.redis)
    return request.app.state.templates.TemplateResponse(
        request, "agents/list.html.j2", _ctx(request, session=session, agents=agents)
    )


@router.get("/new", response_class=HTMLResponse)
async def agent_new(request: Request, session: dict = Depends(current_user)):
    agent = AgentConfig(id="new-agent-000", name="draft")
    agent.name = ""  # blank field in the form (assignment skips validation)
    return request.app.state.templates.TemplateResponse(
        request,
        "agents/edit.html.j2",
        _ctx(request, session=session, agent=agent, is_new=True, error=None),
    )


@router.post("/new", response_class=HTMLResponse)
async def agent_create(request: Request, session: dict = Depends(current_user)):
    form = dict(await request.form())
    require_csrf(request, session, form.get("csrf_token"))
    try:
        data = _form_to_agent_data(form)
        agent = await agent_service.create_agent(request.app.state.redis, data, _snapshot_dir(request))
    except (ValueError, TypeError) as exc:
        agent = AgentConfig(id="new-agent-000", name="draft")
        agent.name = form.get("name", "")  # show what was typed (assignment skips validation)
        return request.app.state.templates.TemplateResponse(
            request,
            "agents/edit.html.j2",
            _ctx(request, session=session, agent=agent, is_new=True, error=str(exc)),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    return RedirectResponse(f"/agents/{agent.id}", status_code=status.HTTP_303_SEE_OTHER)


@router.get("/{agent_id}", response_class=HTMLResponse)
async def agent_edit(request: Request, agent_id: str, session: dict = Depends(current_user)):
    try:
        agent = await agent_service.get_agent(request.app.state.redis, agent_id)
    except agent_service.AgentNotFound:
        raise HTTPException(status_code=404, detail="Agent not found")
    return request.app.state.templates.TemplateResponse(
        request,
        "agents/edit.html.j2",
        _ctx(request, session=session, agent=agent, is_new=False, error=None,
             saved=request.query_params.get("saved") == "1"),
    )


@router.post("/{agent_id}", response_class=HTMLResponse)
async def agent_update(request: Request, agent_id: str, session: dict = Depends(current_user)):
    form = dict(await request.form())
    require_csrf(request, session, form.get("csrf_token"))
    try:
        data = _form_to_agent_data(form)
        await agent_service.update_agent(request.app.state.redis, agent_id, data, _snapshot_dir(request))
    except agent_service.AgentNotFound:
        raise HTTPException(status_code=404, detail="Agent not found")
    except (ValueError, TypeError) as exc:
        agent = await agent_service.get_agent(request.app.state.redis, agent_id)
        return request.app.state.templates.TemplateResponse(
            request,
            "agents/edit.html.j2",
            _ctx(request, session=session, agent=agent, is_new=False, error=str(exc)),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    return RedirectResponse(f"/agents/{agent_id}?saved=1", status_code=status.HTTP_303_SEE_OTHER)


@router.post("/{agent_id}/delete")
async def agent_delete(
    request: Request,
    agent_id: str,
    csrf_token: str = Form(""),
    session: dict = Depends(current_user),
):
    require_csrf(request, session, csrf_token)
    try:
        await agent_service.delete_agent(request.app.state.redis, agent_id, _snapshot_dir(request))
    except agent_service.AgentNotFound:
        raise HTTPException(status_code=404, detail="Agent not found")
    return RedirectResponse("/agents", status_code=status.HTTP_303_SEE_OTHER)


@router.get("/{agent_id}/history", response_class=HTMLResponse)
async def agent_history(request: Request, agent_id: str, session: dict = Depends(current_user)):
    try:
        agent = await agent_service.get_agent(request.app.state.redis, agent_id)
    except agent_service.AgentNotFound:
        raise HTTPException(status_code=404, detail="Agent not found")
    entries = await agent_service.prompt_history(request.app.state.redis, agent_id)
    entries.reverse()  # newest first
    return request.app.state.templates.TemplateResponse(
        request,
        "agents/history.html.j2",
        _ctx(request, session=session, agent=agent, entries=entries),
    )


@router.post("/{agent_id}/history/{version}/restore")
async def agent_restore(
    request: Request,
    agent_id: str,
    version: int,
    csrf_token: str = Form(""),
    session: dict = Depends(current_user),
):
    require_csrf(request, session, csrf_token)
    try:
        await agent_service.restore_prompt(request.app.state.redis, agent_id, version, _snapshot_dir(request))
    except agent_service.AgentNotFound:
        raise HTTPException(status_code=404, detail="Agent or version not found")
    return RedirectResponse(f"/agents/{agent_id}?saved=1", status_code=status.HTTP_303_SEE_OTHER)
