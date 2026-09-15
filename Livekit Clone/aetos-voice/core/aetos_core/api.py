"""/api/v1 — agents, sessions, analytics, telephony, components, system.

Every route here is authenticated and tenant-scoped. Two rules hold throughout:

  * a query against a tenant-owned table always filters on ctx.tenant_id
  * a row belonging to another tenant returns 404, never 403 — a 403 would
    confirm the id exists

Reads require `viewer`, state changes `operator`, configuration `admin`.
"""
from __future__ import annotations

import datetime as dt

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func

from . import CONTRACTS, VERSION, events, licensing
from .db import Agent, Audit, Number, Rule, Session, Session_, Trunk, now
from .deps import Ctx, audit as write_audit, get_ctx, get_or_404, require
from .schemas import *  # noqa: F403  (AgentIn, AgentPatch, Turn, ...)
from .settings import AETOSD_URL, TZ

v1 = APIRouter(prefix="/api/v1")


def db():
    s = Session()
    try:
        yield s
    finally:
        s.close()


def _guard_writes(s) -> None:
    """Expired licence => read-only. Existing calls are never interrupted."""
    licensing.enforce_readonly(licensing.current(s))


# ----------------------------------------------------------------- agents ---

def _agent(a: Agent) -> dict:
    return {"id": a.id, "name": a.name, "kind": a.kind, "status": a.status,
            "prompt": a.prompt, "pipeline": a.pipeline, "tools": a.tools,
            "kb": a.kb,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None}


@v1.get("/agents")
def list_agents(ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    out = []
    since = now() - dt.timedelta(hours=24)
    for a in s.query(Agent).filter(Agent.tenant_id == ctx.tenant_id
                                   ).order_by(Agent.created_at).all():
        q = s.query(Session_).filter(Session_.tenant_id == ctx.tenant_id,
                                     Session_.agent_id == a.id,
                                     Session_.started_at >= since)
        calls = q.count()
        mins = int((q.with_entities(func.sum(Session_.duration_s)).scalar() or 0) / 60)
        ok = q.filter(Session_.outcome == "completed").count()
        ttfb = q.filter(Session_.ttfb_ms > 0).with_entities(
            func.avg(Session_.ttfb_ms)).scalar()
        out.append({**_agent(a), "stats24h": {
            "calls": calls, "minutes": mins, "ttfb_ms": int(ttfb or 0),
            "resolved_pct": int(100 * ok / calls) if calls else 0}})
    return out


@v1.post("/agents", status_code=201)
def create_agent(body: AgentIn, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard_writes(s)
    if s.query(Agent).filter(Agent.tenant_id == ctx.tenant_id,
                             Agent.name == body.name).first():
        raise HTTPException(409, "An agent with that name already exists")
    a = Agent(tenant_id=ctx.tenant_id, name=body.name, kind=body.kind,
              prompt=body.prompt, pipeline=body.pipeline.model_dump(),
              tools=body.tools, kb=body.kb)
    s.add(a)
    write_audit(s, ctx, "agent.create", a.id, a.name)
    s.commit()
    events.publish("agent.updated", agent_id=a.id, change="created")
    return _agent(a)


@v1.get("/agents/{aid}")
def get_agent(aid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return _agent(get_or_404(s, Agent, aid, ctx.tenant_id))


@v1.patch("/agents/{aid}")
def patch_agent(aid: str, body: AgentPatch,
                ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard_writes(s)
    a = get_or_404(s, Agent, aid, ctx.tenant_id)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(a, k, v)
    write_audit(s, ctx, "agent.update", aid)
    s.commit()
    events.publish("agent.updated", agent_id=aid, change="patched")
    return _agent(a)


@v1.post("/agents/{aid}/{action}")
def agent_action(aid: str, action: str,
                 ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard_writes(s)
    a = get_or_404(s, Agent, aid, ctx.tenant_id)
    if action not in ("publish", "pause"):
        raise HTTPException(400, "action must be publish or pause")
    a.status = "online" if action == "publish" else "paused"
    write_audit(s, ctx, f"agent.{action}", aid, a.name)
    s.commit()
    events.publish("agent.updated", agent_id=aid, change=action)
    return _agent(a)


@v1.delete("/agents/{aid}", status_code=204)
def delete_agent(aid: str, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard_writes(s)
    a = get_or_404(s, Agent, aid, ctx.tenant_id)
    write_audit(s, ctx, "agent.delete", aid, a.name)
    s.delete(a)
    s.commit()


# --------------------------------------------------------------- sessions ---

def _ses(x: Session_, full: bool = False) -> dict:
    d = {"id": x.id, "agent_id": x.agent_id,
         "agent": x.agent.name if x.agent else None,
         "channel": x.channel, "caller": x.caller,
         "started_at": x.started_at.isoformat(),
         "ended_at": x.ended_at.isoformat() if x.ended_at else None,
         "outcome": x.outcome, "duration_s": x.duration_s, "cost": x.cost,
         "ttfb_ms": x.ttfb_ms, "summary": x.summary}
    if full:
        d["turns"] = x.turns
    return d


@v1.get("/sessions")
def list_sessions(limit: int = Query(50, le=500), offset: int = 0,
                  agent_id: str | None = None, outcome: str | None = None,
                  ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    q = s.query(Session_).filter(Session_.tenant_id == ctx.tenant_id)
    if agent_id:
        q = q.filter(Session_.agent_id == agent_id)
    if outcome:
        q = q.filter(Session_.outcome == outcome)
    total = q.count()
    rows = q.order_by(Session_.started_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset,
            "items": [_ses(x) for x in rows]}


@v1.post("/sessions", status_code=201)
def start_session(body: SessionStart,
                  ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    state = licensing.current(s)
    licensing.enforce_readonly(state)
    cap = state.get("concurrent_sessions_max")
    if cap is not None:
        live = s.query(Session_).filter(
            Session_.tenant_id == ctx.tenant_id,
            Session_.ended_at.is_(None)).count()
        if live >= cap:
            raise HTTPException(
                402, f"Licence allows {cap} concurrent sessions ({live} active).")

    get_or_404(s, Agent, body.agent_id, ctx.tenant_id)
    x = Session_(tenant_id=ctx.tenant_id, agent_id=body.agent_id,
                 channel=body.channel, caller=body.caller)
    s.add(x)
    s.commit()
    events.publish("session.started", session_id=x.id, agent_id=x.agent_id,
                   channel=x.channel, caller=x.caller)
    return _ses(x)


@v1.get("/sessions/{sid}")
def get_session(sid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return _ses(get_or_404(s, Session_, sid, ctx.tenant_id), full=True)


@v1.post("/sessions/{sid}/turns")
def add_turn(sid: str, t: Turn, ctx: Ctx = Depends(require("operator")),
             s=Depends(db)):
    x = get_or_404(s, Session_, sid, ctx.tenant_id)
    x.turns = [*x.turns, t.model_dump()]
    if t.who == "agent" and t.tts_ms and not x.ttfb_ms:
        x.ttfb_ms = t.eot_ms + t.stt_ms + t.llm_ms + t.tts_ms
    s.commit()
    events.publish("turn.completed", session_id=sid, n=len(x.turns),
                   **t.model_dump())
    return {"n": len(x.turns)}


@v1.post("/sessions/{sid}/end")
def end_session(sid: str, body: SessionEnd,
                ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    x = get_or_404(s, Session_, sid, ctx.tenant_id)
    x.ended_at = now()
    x.outcome = body.outcome
    x.cost = body.cost
    x.summary = body.summary
    started = x.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=dt.timezone.utc)
    x.duration_s = int((x.ended_at - started).total_seconds())
    s.commit()
    events.publish("session.ended", session_id=sid, outcome=x.outcome,
                   duration_s=x.duration_s, cost=x.cost)
    return _ses(x)


# -------------------------------------------------------------- analytics ---

@v1.get("/analytics/overview")
def overview(hours: int = Query(24, ge=1, le=720),
             ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    since = now() - dt.timedelta(hours=hours)
    q = s.query(Session_).filter(Session_.tenant_id == ctx.tenant_id,
                                 Session_.started_at >= since)
    total = q.count()
    mins = int((q.with_entities(func.sum(Session_.duration_s)).scalar() or 0) / 60)
    cost = round(q.with_entities(func.sum(Session_.cost)).scalar() or 0, 2)
    ttfb = int(q.filter(Session_.ttfb_ms > 0).with_entities(
        func.avg(Session_.ttfb_ms)).scalar() or 0)

    per_hour = [0] * hours
    for (st,) in q.with_entities(Session_.started_at).all():
        if st.tzinfo is None:
            st = st.replace(tzinfo=dt.timezone.utc)
        h = int((now() - st).total_seconds() // 3600)
        if 0 <= h < hours:
            per_hour[hours - 1 - h] += 1

    by_outcome = dict(q.with_entities(Session_.outcome, func.count())
                      .group_by(Session_.outcome).all())

    by_agent = []
    for aid, name, n in (s.query(Agent.id, Agent.name, func.count(Session_.id))
                         .join(Session_, Session_.agent_id == Agent.id)
                         .filter(Agent.tenant_id == ctx.tenant_id,
                                 Session_.started_at >= since)
                         .group_by(Agent.id).all()):
        by_agent.append({"agent_id": aid, "agent": name, "calls": n})

    return {"window_h": hours, "calls": total, "minutes": mins, "cost": cost,
            "ttfb_ms": ttfb, "per_hour": per_hour, "by_outcome": by_outcome,
            "by_agent": by_agent, "tz": TZ}


# -------------------------------------------------------------- telephony ---

@v1.get("/telephony/trunks")
def trunks(ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return [{"id": t.id, "name": t.name, "carrier": t.carrier,
             "direction": t.direction, "address": t.address, "state": t.state}
            for t in s.query(Trunk).filter(Trunk.tenant_id == ctx.tenant_id).all()]


@v1.post("/telephony/trunks", status_code=201)
def add_trunk(b: TrunkIn, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard_writes(s)
    if s.query(Trunk).filter(Trunk.tenant_id == ctx.tenant_id,
                             Trunk.name == b.name).first():
        raise HTTPException(409, "A trunk with that name already exists")
    t = Trunk(tenant_id=ctx.tenant_id, **b.model_dump())
    s.add(t)
    write_audit(s, ctx, "trunk.create", t.id, b.name)
    s.commit()
    return {"id": t.id}


@v1.get("/telephony/numbers")
def numbers(ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return [{"id": n.id, "e164": n.e164, "region": n.region,
             "direction": n.direction, "trunk_id": n.trunk_id}
            for n in s.query(Number).filter(Number.tenant_id == ctx.tenant_id).all()]


@v1.post("/telephony/numbers", status_code=201)
def add_number(b: NumberIn, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard_writes(s)
    if s.query(Number).filter(Number.tenant_id == ctx.tenant_id,
                              Number.e164 == b.e164).first():
        raise HTTPException(409, "That number is already registered")
    n = Number(tenant_id=ctx.tenant_id, **b.model_dump())
    s.add(n)
    write_audit(s, ctx, "number.create", n.id, b.e164)
    s.commit()
    return {"id": n.id}


@v1.get("/telephony/rules")
def rules(ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    out = []
    for r in (s.query(Rule).filter(Rule.tenant_id == ctx.tenant_id)
              .order_by(Rule.priority).all()):
        a = s.get(Agent, r.agent_id)
        agent_name = a.name if a and a.tenant_id == ctx.tenant_id else None
        out.append({"id": r.id, "priority": r.priority, "name": r.name,
                    "number": r.number, "agent_id": r.agent_id,
                    "agent": agent_name, "schedule": r.schedule})
    return out


@v1.post("/telephony/rules", status_code=201)
def add_rule(b: RuleIn, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard_writes(s)
    get_or_404(s, Agent, b.agent_id, ctx.tenant_id)   # no cross-tenant routing
    r = Rule(tenant_id=ctx.tenant_id, **b.model_dump())
    s.add(r)
    write_audit(s, ctx, "rule.create", r.id, b.name)
    s.commit()
    return {"id": r.id}


@v1.get("/telephony/dispatch")
def dispatch(number: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    """Which agent answers this number right now. First matching rule wins."""
    for r in (s.query(Rule).filter(Rule.tenant_id == ctx.tenant_id,
                                   Rule.number == number)
              .order_by(Rule.priority).all()):
        a = s.get(Agent, r.agent_id)
        if a and a.tenant_id == ctx.tenant_id and a.status == "online":
            return {"agent_id": a.id, "agent": a.name,
                    "pipeline": a.pipeline, "rule": r.name}
    raise HTTPException(404, "No online agent for that number")


# ------------------------------------------------------------- components ---
# Proxied to aetosd — Core knows nothing about docker or venvs.

async def _aetosd(method: str, path: str, **kw):
    try:
        async with httpx.AsyncClient(base_url=AETOSD_URL, timeout=20) as c:
            r = await c.request(method, path, **kw)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"aetosd unreachable: {e}")


@v1.get("/components")
async def components(ctx: Ctx = Depends(require("viewer"))):
    return await _aetosd("GET", "/components")


@v1.get("/components/store")
async def store(ctx: Ctx = Depends(require("viewer"))):
    return await _aetosd("GET", "/store")


@v1.post("/components/{name}/{action}")
async def component_action(name: str, action: str,
                           ctx: Ctx = Depends(require("admin"))):
    if action not in ("start", "stop", "restart", "upgrade", "rollback", "install"):
        raise HTTPException(400, "Unsupported action")
    # Components are host-wide infrastructure, so only the platform tenant may
    # change them — otherwise one tenant could restart another's providers.
    if not ctx.is_platform:
        raise HTTPException(403, "Component management is platform-only")
    r = await _aetosd("POST", f"/components/{name}/{action}")
    with Session() as s:
        write_audit(s, ctx, f"component.{action}", name)
        s.commit()
    events.publish("component.updated", name=name, action=action,
                   ok=r.get("ok", True))
    return r


# ----------------------------------------------------------------- system ---

@v1.get("/system/events")
def sys_events(n: int = Query(50, le=500), ctx: Ctx = Depends(require("viewer"))):
    return events.tail(n)


@v1.get("/system/audit")
def audit_log(n: int = Query(100, le=1000), action: str | None = None,
              ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    q = s.query(Audit).filter(Audit.tenant_id == ctx.tenant_id)
    if action:
        q = q.filter(Audit.action.like(f"{action}%"))
    return [{"ts": a.ts.isoformat(), "who": a.who, "actor_type": a.actor_type,
             "ip": a.ip, "action": a.action, "target": a.target,
             "detail": a.detail}
            for a in q.order_by(Audit.id.desc()).limit(n).all()]


@v1.get("/system/info")
def info(ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return {"version": VERSION, "contracts": CONTRACTS, "tz": TZ,
            "tenant": {"id": ctx.tenant.id, "slug": ctx.tenant.slug,
                       "name": ctx.tenant.name},
            "licence": licensing.current(s)}
