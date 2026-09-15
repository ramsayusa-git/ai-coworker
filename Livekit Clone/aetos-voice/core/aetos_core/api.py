from __future__ import annotations
import datetime as dt, httpx
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import func, select
from .db import Session, Agent, Session_, Trunk, Number, Rule, Audit, now
from .schemas import *
from . import events, VERSION, CONTRACTS
from .settings import AETOSD_URL, TZ

v1 = APIRouter(prefix="/api/v1")
def db():
    s = Session()
    try: yield s
    finally: s.close()
def _audit(s, action, detail=""): s.add(Audit(action=action, detail=detail))

# ---------- agents ----------
def _agent(a: Agent):
    return {"id":a.id,"name":a.name,"kind":a.kind,"status":a.status,"prompt":a.prompt,"pipeline":a.pipeline,"tools":a.tools,"kb":a.kb,
            "updated_at":a.updated_at.isoformat() if a.updated_at else None}
@v1.get("/agents")
def list_agents(s=Depends(db)):
    out=[]
    for a in s.query(Agent).order_by(Agent.created_at).all():
        since = now()-dt.timedelta(hours=24)
        q = s.query(Session_).filter(Session_.agent_id==a.id, Session_.started_at>=since)
        calls = q.count(); mins = int((q.with_entities(func.sum(Session_.duration_s)).scalar() or 0)/60)
        ok = q.filter(Session_.outcome=="completed").count(); ttfb = q.filter(Session_.ttfb_ms>0).with_entities(func.avg(Session_.ttfb_ms)).scalar()
        out.append({**_agent(a), "stats24h":{"calls":calls,"minutes":mins,"ttfb_ms":int(ttfb or 0),"resolved_pct":int(100*ok/calls) if calls else 0}})
    return out
@v1.post("/agents", status_code=201)
def create_agent(body: AgentIn, s=Depends(db)):
    if s.query(Agent).filter_by(name=body.name).first(): raise HTTPException(409, "name exists")
    a = Agent(name=body.name, kind=body.kind, prompt=body.prompt, pipeline=body.pipeline.model_dump(), tools=body.tools, kb=body.kb)
    s.add(a); _audit(s,"agent.create",a.name); s.commit(); events.publish("agent.updated", agent_id=a.id, change="created"); return _agent(a)
@v1.get("/agents/{aid}")
def get_agent(aid: str, s=Depends(db)):
    a = s.get(Agent, aid) or _404(); return _agent(a)
@v1.patch("/agents/{aid}")
def patch_agent(aid: str, body: AgentPatch, s=Depends(db)):
    a = s.get(Agent, aid) or _404()
    for k, v in body.model_dump(exclude_none=True).items(): setattr(a, k, v if k!="pipeline" else v)
    _audit(s,"agent.update",aid); s.commit(); events.publish("agent.updated", agent_id=aid, change="patched"); return _agent(a)
@v1.post("/agents/{aid}/{action}")
def agent_action(aid: str, action: str, s=Depends(db)):
    a = s.get(Agent, aid) or _404()
    if action not in ("publish","pause"): raise HTTPException(400, "publish|pause")
    a.status = "online" if action=="publish" else "paused"; _audit(s,f"agent.{action}",aid); s.commit()
    events.publish("agent.updated", agent_id=aid, change=action); return _agent(a)
@v1.delete("/agents/{aid}", status_code=204)
def delete_agent(aid: str, s=Depends(db)):
    a = s.get(Agent, aid) or _404(); s.delete(a); _audit(s,"agent.delete",aid); s.commit()
def _404(): raise HTTPException(404)

# ---------- sessions ----------
def _ses(x: Session_, full=False):
    d = {"id":x.id,"agent_id":x.agent_id,"agent":x.agent.name if x.agent else None,"channel":x.channel,"caller":x.caller,
         "started_at":x.started_at.isoformat(),"ended_at":x.ended_at.isoformat() if x.ended_at else None,"outcome":x.outcome,
         "duration_s":x.duration_s,"cost":x.cost,"ttfb_ms":x.ttfb_ms,"summary":x.summary}
    if full: d["turns"]=x.turns
    return d
@v1.get("/sessions")
def list_sessions(limit: int = Query(50, le=500), agent_id: str|None=None, outcome: str|None=None, s=Depends(db)):
    q = s.query(Session_).order_by(Session_.started_at.desc())
    if agent_id: q = q.filter_by(agent_id=agent_id)
    if outcome: q = q.filter_by(outcome=outcome)
    return [_ses(x) for x in q.limit(limit).all()]
@v1.post("/sessions", status_code=201)
def start_session(body: SessionStart, s=Depends(db)):
    if not s.get(Agent, body.agent_id): raise HTTPException(404, "agent")
    x = Session_(agent_id=body.agent_id, channel=body.channel, caller=body.caller); s.add(x); s.commit()
    events.publish("session.started", session_id=x.id, agent_id=x.agent_id, channel=x.channel, caller=x.caller); return _ses(x)
@v1.get("/sessions/{sid}")
def get_session(sid: str, s=Depends(db)): return _ses(s.get(Session_, sid) or _404(), full=True)
@v1.post("/sessions/{sid}/turns")
def add_turn(sid: str, t: Turn, s=Depends(db)):
    x = s.get(Session_, sid) or _404(); x.turns = [*x.turns, t.model_dump()]
    if t.who=="agent" and t.tts_ms and not x.ttfb_ms: x.ttfb_ms = t.eot_ms+t.stt_ms+t.llm_ms+t.tts_ms
    s.commit(); events.publish("turn.completed", session_id=sid, n=len(x.turns), **t.model_dump()); return {"n": len(x.turns)}
@v1.post("/sessions/{sid}/end")
def end_session(sid: str, body: SessionEnd, s=Depends(db)):
    x = s.get(Session_, sid) or _404(); x.ended_at = now(); x.outcome = body.outcome; x.cost = body.cost; x.summary = body.summary
    x.duration_s = int((x.ended_at - x.started_at.replace(tzinfo=dt.timezone.utc)).total_seconds()) if x.started_at.tzinfo is None else int((x.ended_at-x.started_at).total_seconds())
    s.commit(); events.publish("session.ended", session_id=sid, outcome=x.outcome, duration_s=x.duration_s, cost=x.cost); return _ses(x)

# ---------- analytics ----------
@v1.get("/analytics/overview")
def overview(hours: int = 24, s=Depends(db)):
    since = now()-dt.timedelta(hours=hours)
    q = s.query(Session_).filter(Session_.started_at>=since)
    total=q.count(); mins=int((q.with_entities(func.sum(Session_.duration_s)).scalar() or 0)/60)
    cost=round(q.with_entities(func.sum(Session_.cost)).scalar() or 0,2); ttfb=int(q.filter(Session_.ttfb_ms>0).with_entities(func.avg(Session_.ttfb_ms)).scalar() or 0)
    per_hour=[0]*hours
    for (st,) in q.with_entities(Session_.started_at).all():
        h = int((now()-st.replace(tzinfo=dt.timezone.utc)).total_seconds()//3600)
        if 0<=h<hours: per_hour[hours-1-h]+=1
    by_outcome = dict(q.with_entities(Session_.outcome, func.count()).group_by(Session_.outcome).all())
    return {"window_h":hours,"calls":total,"minutes":mins,"cost":cost,"ttfb_ms":ttfb,"per_hour":per_hour,"by_outcome":by_outcome,"tz":TZ}

# ---------- telephony ----------
@v1.get("/telephony/trunks")
def trunks(s=Depends(db)): return [{"id":t.id,"name":t.name,"carrier":t.carrier,"direction":t.direction,"address":t.address,"state":t.state} for t in s.query(Trunk).all()]
@v1.post("/telephony/trunks", status_code=201)
def add_trunk(b: TrunkIn, s=Depends(db)):
    t=Trunk(**b.model_dump()); s.add(t); s.commit(); return {"id":t.id}
@v1.get("/telephony/numbers")
def numbers(s=Depends(db)): return [{"id":n.id,"e164":n.e164,"region":n.region,"direction":n.direction,"trunk_id":n.trunk_id} for n in s.query(Number).all()]
@v1.post("/telephony/numbers", status_code=201)
def add_number(b: NumberIn, s=Depends(db)):
    n=Number(**b.model_dump()); s.add(n); s.commit(); return {"id":n.id}
@v1.get("/telephony/rules")
def rules(s=Depends(db)):
    return [{"id":r.id,"priority":r.priority,"name":r.name,"number":r.number,"agent_id":r.agent_id,
             "agent":(s.get(Agent,r.agent_id) or Agent(name="?")).name,"schedule":r.schedule} for r in s.query(Rule).order_by(Rule.priority).all()]
@v1.post("/telephony/rules", status_code=201)
def add_rule(b: RuleIn, s=Depends(db)):
    r=Rule(**b.model_dump()); s.add(r); s.commit(); return {"id":r.id}
@v1.get("/telephony/dispatch")
def dispatch(number: str, s=Depends(db)):
    """Which agent answers this number right now. First matching rule wins. Called by the SIP bridge."""
    for r in s.query(Rule).filter_by(number=number).order_by(Rule.priority).all():
        a = s.get(Agent, r.agent_id)
        if a and a.status=="online": return {"agent_id":a.id,"agent":a.name,"pipeline":a.pipeline,"rule":r.name}
    raise HTTPException(404, "no online agent for number")

# ---------- components (proxied to aetosd — Core knows nothing about docker or venvs) ----------
async def _aetosd(method, path, **kw):
    try:
        async with httpx.AsyncClient(base_url=AETOSD_URL, timeout=20) as c:
            r = await c.request(method, path, **kw); r.raise_for_status(); return r.json()
    except httpx.HTTPError as e: raise HTTPException(502, f"aetosd unreachable: {e}")
@v1.get("/components")
async def components(): return await _aetosd("GET", "/components")
@v1.get("/components/store")
async def store(): return await _aetosd("GET", "/store")
@v1.post("/components/{name}/{action}")
async def component_action(name: str, action: str, s=Depends(db)):
    if action not in ("start","stop","restart","upgrade","rollback","install"): raise HTTPException(400)
    r = await _aetosd("POST", f"/components/{name}/{action}")
    _audit(s, f"component.{action}", name); s.commit(); events.publish("component.updated", name=name, action=action, ok=r.get("ok", True)); return r

# ---------- system ----------
@v1.get("/system/events")
def sys_events(n: int = 50): return events.tail(n)
@v1.get("/system/audit")
def audit(n: int = 100, s=Depends(db)):
    return [{"ts":a.ts.isoformat(),"who":a.who,"action":a.action,"detail":a.detail} for a in s.query(Audit).order_by(Audit.id.desc()).limit(n).all()]
@v1.get("/system/info")
def info(): return {"version": VERSION, "contracts": CONTRACTS, "tz": TZ}
