"""Agent versions — save a designer graph, publish it, roll back, diff.

The designer edits a GRAPH (nodes, edges, positions). The runtime consumes a
flat PIPELINE. Both are stored on every version so a rollback restores exactly
what the author saw, not a lossy reconstruction.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func

from . import events, licensing
from .db import Agent, AgentVersion, Session, now
from .deps import Ctx, audit, get_or_404, require

# Carries its own prefix and is mounted on the app BEFORE the v1 router.
# api.py defines POST /agents/{aid}/{action}, whose wildcard would otherwise
# swallow /agents/{aid}/versions — FastAPI matches in registration order.
router = APIRouter(prefix="/api/v1", tags=["agent-versions"])

NODE_TYPES = {"entry", "stt", "llm", "tts", "tool", "branch",
              "transfer", "hangup", "webhook"}


class VersionIn(BaseModel):
    graph: dict = Field(default_factory=dict)
    prompt: str = ""
    tools: list = Field(default_factory=list)
    note: str = ""
    publish: bool = False


def compile_graph(graph: dict) -> tuple[dict, list[dict]]:
    """Validate a graph and flatten it to the runtime Pipeline.

    Returns (pipeline, problems). Problems carry a node id where one applies so
    the canvas can mark the offending node instead of showing one vague modal.
    """
    problems: list[dict] = []
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []

    if not isinstance(nodes, list) or not isinstance(edges, list):
        return {}, [{"msg": "Graph must have 'nodes' and 'edges' arrays."}]

    ids = set()
    for n in nodes:
        nid = n.get("id")
        if not nid:
            problems.append({"msg": "A node is missing its id."})
            continue
        if nid in ids:
            problems.append({"node": nid, "msg": "Duplicate node id."})
        ids.add(nid)
        if n.get("type") not in NODE_TYPES:
            problems.append({"node": nid, "msg": f"Unknown node type '{n.get('type')}'."})

    entries = [n for n in nodes if n.get("type") == "entry"]
    if len(entries) == 0:
        problems.append({"msg": "There is no Entry node — the call has nowhere to start."})
    elif len(entries) > 1:
        problems.append({"msg": "More than one Entry node. Exactly one is allowed."})

    for e in edges:
        if e.get("from") not in ids:
            problems.append({"msg": f"Edge from unknown node '{e.get('from')}'."})
        if e.get("to") not in ids:
            problems.append({"msg": f"Edge to unknown node '{e.get('to')}'."})

    linked = {e.get("from") for e in edges} | {e.get("to") for e in edges}
    if len(nodes) > 1:
        for n in nodes:
            if n.get("id") not in linked:
                problems.append({"node": n.get("id"),
                                 "msg": f"{n.get('type')} node is not connected to anything."})

    pipeline: dict = {}
    for n in nodes:
        cfg = n.get("config") or {}
        t = n.get("type")
        if t in ("stt", "llm", "tts"):
            if not cfg.get("component"):
                problems.append({"node": n.get("id"),
                                 "msg": f"{t} node has no provider selected."})
            else:
                pipeline[t] = cfg["component"]
        if t == "tts" and cfg.get("voice"):
            pipeline["voice"] = cfg["voice"]
        if t == "stt" and cfg.get("language"):
            pipeline["language"] = cfg["language"]
        if t == "llm" and cfg.get("temperature") is not None:
            pipeline["temperature"] = cfg["temperature"]
        if t == "tool" and not cfg.get("name"):
            problems.append({"node": n.get("id"), "msg": "Tool node has no tool name."})

    return pipeline, problems


def _out(v: AgentVersion, with_graph: bool = False) -> dict:
    d = {"id": v.id, "version": v.version, "status": v.status, "note": v.note,
         "pipeline": v.pipeline, "prompt": v.prompt, "tools": v.tools,
         "created_by": v.created_by, "created_at": v.created_at}
    if with_graph:
        d["graph"] = v.graph
    return d


@router.get("/agents/{aid}/versions")
def list_versions(aid: str, ctx: Ctx = Depends(require("viewer"))):
    with Session() as s:
        get_or_404(s, Agent, aid, ctx.tenant_id)
        rows = (s.query(AgentVersion)
                .filter(AgentVersion.tenant_id == ctx.tenant_id,
                        AgentVersion.agent_id == aid)
                .order_by(AgentVersion.version.desc()).all())
        return [_out(v) for v in rows]


@router.get("/agents/{aid}/versions/latest")
def latest_version(aid: str, ctx: Ctx = Depends(require("viewer"))):
    """What the designer opens on. 404 means 'seed from the flat pipeline'."""
    with Session() as s:
        get_or_404(s, Agent, aid, ctx.tenant_id)
        v = (s.query(AgentVersion)
             .filter(AgentVersion.tenant_id == ctx.tenant_id,
                     AgentVersion.agent_id == aid)
             .order_by(AgentVersion.version.desc()).first())
        if not v:
            raise HTTPException(404, "No saved versions yet")
        return _out(v, with_graph=True)


@router.get("/agents/{aid}/versions/{vid}")
def get_version(aid: str, vid: str, ctx: Ctx = Depends(require("viewer"))):
    with Session() as s:
        get_or_404(s, Agent, aid, ctx.tenant_id)
        v = s.get(AgentVersion, vid)
        if not v or v.tenant_id != ctx.tenant_id or v.agent_id != aid:
            raise HTTPException(404, "Not found")
        return _out(v, with_graph=True)


@router.post("/agents/{aid}/versions", status_code=201)
def create_version(aid: str, body: VersionIn,
                   ctx: Ctx = Depends(require("admin"))):
    """Save a new version. `publish: true` also makes it the live pipeline."""
    with Session() as s:
        licensing.enforce_readonly(licensing.current(s))
        agent = get_or_404(s, Agent, aid, ctx.tenant_id)

        pipeline, problems = compile_graph(body.graph)
        if body.publish and problems:
            raise HTTPException(422, {"message": "Graph is not valid",
                                      "problems": problems})

        nxt = (s.query(func.max(AgentVersion.version))
               .filter(AgentVersion.agent_id == aid).scalar() or 0) + 1

        v = AgentVersion(
            tenant_id=ctx.tenant_id, agent_id=aid, version=nxt,
            graph=body.graph, pipeline=pipeline, prompt=body.prompt,
            tools=body.tools, note=body.note,
            status="published" if body.publish else "draft",
            created_by=ctx.actor_id,
        )
        s.add(v)

        if body.publish:
            # Only one published version at a time.
            (s.query(AgentVersion)
             .filter(AgentVersion.agent_id == aid,
                     AgentVersion.status == "published")
             .update({"status": "archived"}))
            v.status = "published"
            agent.pipeline = pipeline
            agent.prompt = body.prompt or agent.prompt
            agent.tools = body.tools
            agent.status = "online"

        audit(s, ctx, "agent.version.publish" if body.publish else "agent.version.save",
              aid, f"v{nxt} {body.note}".strip())
        s.commit()

        if body.publish:
            events.publish("agent.updated", agent_id=aid, change="published",
                           version=nxt)
        return {**_out(v, with_graph=True), "problems": problems}


@router.post("/agents/{aid}/versions/{vid}/rollback")
def rollback(aid: str, vid: str, ctx: Ctx = Depends(require("admin"))):
    """Re-publish an earlier version verbatim."""
    with Session() as s:
        licensing.enforce_readonly(licensing.current(s))
        agent = get_or_404(s, Agent, aid, ctx.tenant_id)
        v = s.get(AgentVersion, vid)
        if not v or v.tenant_id != ctx.tenant_id or v.agent_id != aid:
            raise HTTPException(404, "Not found")

        (s.query(AgentVersion)
         .filter(AgentVersion.agent_id == aid, AgentVersion.status == "published")
         .update({"status": "archived"}))
        v.status = "published"
        agent.pipeline = v.pipeline
        agent.prompt = v.prompt or agent.prompt
        agent.tools = v.tools

        audit(s, ctx, "agent.version.rollback", aid, f"to v{v.version}")
        s.commit()
        events.publish("agent.updated", agent_id=aid, change="rollback",
                       version=v.version)
        return _out(v, with_graph=True)


@router.get("/agents/{aid}/versions/{vid}/diff")
def diff(aid: str, vid: str, against: str | None = None,
         ctx: Ctx = Depends(require("viewer"))):
    """Field-level diff between two versions. `against` defaults to the previous."""
    with Session() as s:
        get_or_404(s, Agent, aid, ctx.tenant_id)
        a = s.get(AgentVersion, vid)
        if not a or a.tenant_id != ctx.tenant_id or a.agent_id != aid:
            raise HTTPException(404, "Not found")

        if against:
            b = s.get(AgentVersion, against)
            if not b or b.tenant_id != ctx.tenant_id or b.agent_id != aid:
                raise HTTPException(404, "Comparison version not found")
        else:
            b = (s.query(AgentVersion)
                 .filter(AgentVersion.agent_id == aid,
                         AgentVersion.version < a.version)
                 .order_by(AgentVersion.version.desc()).first())

        if not b:
            return {"from": None, "to": a.version, "changes": [],
                    "note": "This is the first version — nothing to compare against."}

        changes = []

        keys = set(a.pipeline or {}) | set(b.pipeline or {})
        for k in sorted(keys):
            old, new = (b.pipeline or {}).get(k), (a.pipeline or {}).get(k)
            if old != new:
                changes.append({"field": f"pipeline.{k}", "from": old, "to": new})

        if (a.prompt or "") != (b.prompt or ""):
            changes.append({"field": "prompt", "from": b.prompt, "to": a.prompt})

        old_tools, new_tools = set(b.tools or []), set(a.tools or [])
        for t in sorted(new_tools - old_tools):
            changes.append({"field": "tools", "from": None, "to": t})
        for t in sorted(old_tools - new_tools):
            changes.append({"field": "tools", "from": t, "to": None})

        an = {n.get("id"): n for n in (a.graph or {}).get("nodes", [])}
        bn = {n.get("id"): n for n in (b.graph or {}).get("nodes", [])}
        for nid in sorted(set(an) - set(bn)):
            changes.append({"field": "node", "from": None,
                            "to": f"{an[nid].get('type')} added"})
        for nid in sorted(set(bn) - set(an)):
            changes.append({"field": "node", "from": f"{bn[nid].get('type')} removed",
                            "to": None})

        return {"from": b.version, "to": a.version, "changes": changes}


@router.post("/agents/{aid}/compile")
def compile_only(aid: str, body: VersionIn, ctx: Ctx = Depends(require("viewer"))):
    """Validate without saving — what the designer calls as you edit."""
    with Session() as s:
        get_or_404(s, Agent, aid, ctx.tenant_id)
    pipeline, problems = compile_graph(body.graph)
    return {"pipeline": pipeline, "problems": problems, "valid": not problems}
