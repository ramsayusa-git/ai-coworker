"""Rooms, chat history, recordings, tools, knowledge base, reports, notes,
per-tenant settings groups and the dependency inventory.

Same two rules as api.py, and they are not negotiable:

  * every query against a tenant-owned table filters on ctx.tenant_id
  * a row owned by another tenant answers 404, never 403

Mounted under /api/v1 alongside the other routers. Routes here are declared
with explicit literal prefixes (/rooms, /tools, ...) so none of them can be
swallowed by a wildcard in api.py.
"""
from __future__ import annotations

import datetime as dt
import importlib.metadata as md
import re
import sys

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func

from . import licensing
from .db import (ROLE_RANK, Agent, ChatSession, KbDocument, KnowledgeBase, Note,
                 Recording, Report, Room, Session, Session_, TenantSetting, Tool,
                 now)
from .deps import Ctx, audit as write_audit, get_or_404, require

router = APIRouter(prefix="/api/v1", tags=["console"])


def db():
    s = Session()
    try:
        yield s
    finally:
        s.close()


def _guard(s) -> None:
    licensing.enforce_readonly(licensing.current(s))


def _iso(v) -> str | None:
    return v.isoformat() if v else None


def _aware(v: dt.datetime | None) -> dt.datetime | None:
    """SQLite hands back naive datetimes even though everything is written in
    UTC, and subtracting a naive from an aware one raises. Normalise on read."""
    if v is None:
        return None
    return v if v.tzinfo else v.replace(tzinfo=dt.timezone.utc)


# ------------------------------------------------------------------ rooms ---

class RoomIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = "voice"
    agent_id: str | None = None
    max_participants: int = Field(default=8, ge=1, le=200)
    empty_timeout_s: int = Field(default=300, ge=10, le=86400)
    metadata_json: dict = Field(default_factory=dict)

class RoomPatch(BaseModel):
    name: str | None = None
    agent_id: str | None = None
    max_participants: int | None = Field(default=None, ge=1, le=200)
    empty_timeout_s: int | None = Field(default=None, ge=10, le=86400)
    status: str | None = None
    metadata_json: dict | None = None


def _room(r: Room) -> dict:
    return {"id": r.id, "name": r.name, "kind": r.kind, "status": r.status,
            "agent_id": r.agent_id, "max_participants": r.max_participants,
            "empty_timeout_s": r.empty_timeout_s,
            "participants": r.participants or [],
            "participant_count": len(r.participants or []),
            "metadata": r.metadata_json or {},
            "created_at": _iso(r.created_at), "last_active_at": _iso(r.last_active_at)}


@router.get("/rooms")
def list_rooms(status: str = "", ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    q = s.query(Room).filter(Room.tenant_id == ctx.tenant_id)
    if status:
        q = q.filter(Room.status == status)
    return [_room(r) for r in q.order_by(Room.created_at.desc()).all()]


@router.post("/rooms", status_code=201)
def create_room(body: RoomIn, ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    if s.query(Room).filter(Room.tenant_id == ctx.tenant_id,
                            Room.name == body.name).first():
        raise HTTPException(409, "A room with that name already exists")
    r = Room(tenant_id=ctx.tenant_id, **body.model_dump())
    s.add(r); s.commit()
    write_audit(s, ctx, "room.create", r.id, r.name)
    return _room(r)


@router.get("/rooms/{rid}")
def get_room(rid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return _room(get_or_404(s, Room, rid, ctx.tenant_id))


@router.patch("/rooms/{rid}")
def patch_room(rid: str, body: RoomPatch,
               ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    r = get_or_404(s, Room, rid, ctx.tenant_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(r, k, v)
    s.commit()
    write_audit(s, ctx, "room.update", r.id, r.name)
    return _room(r)


@router.post("/rooms/{rid}/close")
def close_room(rid: str, ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    r = get_or_404(s, Room, rid, ctx.tenant_id)
    r.status = "closed"; r.participants = []
    s.commit()
    write_audit(s, ctx, "room.close", r.id, r.name)
    return _room(r)


@router.delete("/rooms/{rid}", status_code=204)
def delete_room(rid: str, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    r = get_or_404(s, Room, rid, ctx.tenant_id)
    name = r.name
    s.delete(r); s.commit()
    write_audit(s, ctx, "room.delete", rid, name)


# ----------------------------------------------------------- chat history ---

def _chat(c: ChatSession, full: bool = False) -> dict:
    d = {"id": c.id, "agent_id": c.agent_id,
         "agent": c.agent.name if c.agent else "",
         "channel": c.channel, "visitor": c.visitor, "status": c.status,
         "started_at": _iso(c.started_at), "ended_at": _iso(c.ended_at),
         "message_count": c.message_count, "tokens_in": c.tokens_in,
         "tokens_out": c.tokens_out, "cost": round(c.cost, 4),
         "summary": c.summary}
    if full:
        d["messages"] = c.messages or []
    return d


@router.get("/chats")
def list_chats(agent_id: str = "", status: str = "", channel: str = "",
               limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
               ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    q = s.query(ChatSession).filter(ChatSession.tenant_id == ctx.tenant_id)
    if agent_id:
        q = q.filter(ChatSession.agent_id == agent_id)
    if status:
        q = q.filter(ChatSession.status == status)
    if channel:
        q = q.filter(ChatSession.channel == channel)
    total = q.count()
    rows = q.order_by(ChatSession.started_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [_chat(c) for c in rows]}


@router.get("/chats/{cid}")
def get_chat(cid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return _chat(get_or_404(s, ChatSession, cid, ctx.tenant_id), full=True)


@router.post("/chats/{cid}/close")
def close_chat(cid: str, ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    c = get_or_404(s, ChatSession, cid, ctx.tenant_id)
    c.status = "closed"; c.ended_at = now()
    s.commit()
    write_audit(s, ctx, "chat.close", c.id, c.visitor)
    return _chat(c)


# ------------------------------------------------------ recording / egress ---

class RecordingIn(BaseModel):
    session_id: str | None = None
    room_id: str | None = None
    kind: str = "audio"
    destination: str = "local"


def _rec(r: Recording) -> dict:
    return {"id": r.id, "session_id": r.session_id, "room_id": r.room_id,
            "kind": r.kind, "status": r.status, "destination": r.destination,
            "path": r.path, "size_bytes": r.size_bytes,
            "duration_s": r.duration_s, "error": r.error,
            "started_at": _iso(r.started_at), "finished_at": _iso(r.finished_at)}


@router.get("/recordings")
def list_recordings(status: str = "", kind: str = "",
                    limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                    ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    q = s.query(Recording).filter(Recording.tenant_id == ctx.tenant_id)
    if status:
        q = q.filter(Recording.status == status)
    if kind:
        q = q.filter(Recording.kind == kind)
    total = q.count()
    rows = q.order_by(Recording.started_at.desc()).offset(offset).limit(limit).all()
    used = (s.query(func.sum(Recording.size_bytes))
              .filter(Recording.tenant_id == ctx.tenant_id).scalar() or 0)
    return {"total": total, "bytes_used": int(used), "items": [_rec(r) for r in rows]}


@router.post("/recordings", status_code=201)
def start_recording(body: RecordingIn,
                    ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    if not body.session_id and not body.room_id:
        raise HTTPException(400, "Give either session_id or room_id")
    if body.session_id:
        get_or_404(s, Session_, body.session_id, ctx.tenant_id)
    if body.room_id:
        get_or_404(s, Room, body.room_id, ctx.tenant_id)
    r = Recording(tenant_id=ctx.tenant_id, status="recording", **body.model_dump())
    s.add(r); s.commit()
    write_audit(s, ctx, "recording.start", r.id, r.destination)
    return _rec(r)


@router.post("/recordings/{rid}/stop")
def stop_recording(rid: str, ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    r = get_or_404(s, Recording, rid, ctx.tenant_id)
    if r.status != "recording":
        raise HTTPException(409, f"Recording is {r.status}, not recording")
    r.status = "complete"; r.finished_at = now()
    started = _aware(r.started_at)
    if started:
        r.duration_s = max(0, int((r.finished_at - started).total_seconds()))
    s.commit()
    write_audit(s, ctx, "recording.stop", r.id, "")
    return _rec(r)


@router.get("/recordings/{rid}")
def get_recording(rid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return _rec(get_or_404(s, Recording, rid, ctx.tenant_id))


@router.delete("/recordings/{rid}", status_code=204)
def delete_recording(rid: str, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    r = get_or_404(s, Recording, rid, ctx.tenant_id)
    s.delete(r); s.commit()
    write_audit(s, ctx, "recording.delete", rid, "")


# ------------------------------------------------------------------ tools ---

TOOL_KINDS = ("http", "builtin", "mcp")
HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")

class ToolIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: str = "http"
    description: str = ""
    enabled: bool = True
    method: str = "POST"
    url: str = ""
    headers: dict = Field(default_factory=dict)
    parameters: dict = Field(default_factory=dict)
    timeout_s: int = Field(default=10, ge=1, le=120)

class ToolPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    method: str | None = None
    url: str | None = None
    headers: dict | None = None
    parameters: dict | None = None
    timeout_s: int | None = Field(default=None, ge=1, le=120)


def _tool(t: Tool) -> dict:
    return {"id": t.id, "name": t.name, "kind": t.kind,
            "description": t.description, "enabled": t.enabled,
            "method": t.method, "url": t.url, "headers": t.headers or {},
            "parameters": t.parameters or {}, "timeout_s": t.timeout_s,
            "updated_at": _iso(t.updated_at)}


def _check_tool(kind: str, method: str, url: str) -> None:
    if kind not in TOOL_KINDS:
        raise HTTPException(400, f"kind must be one of {', '.join(TOOL_KINDS)}")
    if method.upper() not in HTTP_METHODS:
        raise HTTPException(400, f"method must be one of {', '.join(HTTP_METHODS)}")
    if kind in ("http", "mcp"):
        if not url:
            raise HTTPException(400, f"a {kind} tool needs a url")
        # An agent calls this URL server-side with the tenant's own credentials,
        # so a file:// or gopher:// target would be an SSRF primitive.
        if not re.match(r"^https?://", url, re.I):
            raise HTTPException(400, "url must start with http:// or https://")


@router.get("/tools")
def list_tools(ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    rows = (s.query(Tool).filter(Tool.tenant_id == ctx.tenant_id)
              .order_by(Tool.name).all())
    return [_tool(t) for t in rows]


@router.post("/tools", status_code=201)
def create_tool(body: ToolIn, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    _check_tool(body.kind, body.method, body.url)
    if s.query(Tool).filter(Tool.tenant_id == ctx.tenant_id,
                            Tool.name == body.name).first():
        raise HTTPException(409, "A tool with that name already exists")
    d = body.model_dump(); d["method"] = d["method"].upper()
    t = Tool(tenant_id=ctx.tenant_id, **d)
    s.add(t); s.commit()
    write_audit(s, ctx, "tool.create", t.id, t.name)
    return _tool(t)


@router.get("/tools/{tid}")
def get_tool(tid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return _tool(get_or_404(s, Tool, tid, ctx.tenant_id))


@router.patch("/tools/{tid}")
def patch_tool(tid: str, body: ToolPatch,
               ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    t = get_or_404(s, Tool, tid, ctx.tenant_id)
    d = body.model_dump(exclude_unset=True)
    _check_tool(t.kind, (d.get("method") or t.method), d.get("url", t.url))
    for k, v in d.items():
        if v is not None:
            setattr(t, k, v.upper() if k == "method" else v)
    s.commit()
    write_audit(s, ctx, "tool.update", t.id, t.name)
    return _tool(t)


@router.delete("/tools/{tid}", status_code=204)
def delete_tool(tid: str, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    t = get_or_404(s, Tool, tid, ctx.tenant_id)
    name = t.name
    s.delete(t); s.commit()
    write_audit(s, ctx, "tool.delete", tid, name)


# ------------------------------------------------- knowledge base / memory ---

class KbIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    embedding_model: str = "local-minilm"
    chunk_size: int = Field(default=800, ge=100, le=8000)
    chunk_overlap: int = Field(default=120, ge=0, le=2000)

class KbPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    embedding_model: str | None = None
    chunk_size: int | None = Field(default=None, ge=100, le=8000)
    chunk_overlap: int | None = Field(default=None, ge=0, le=2000)

class DocIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    source: str = "text"
    uri: str = ""
    content: str = ""


def _kb(k: KnowledgeBase) -> dict:
    return {"id": k.id, "name": k.name, "description": k.description,
            "embedding_model": k.embedding_model, "chunk_size": k.chunk_size,
            "chunk_overlap": k.chunk_overlap, "doc_count": k.doc_count,
            "created_at": _iso(k.created_at)}


def _doc(d: KbDocument, full: bool = False) -> dict:
    out = {"id": d.id, "kb_id": d.kb_id, "title": d.title, "source": d.source,
           "uri": d.uri, "status": d.status, "chunks": d.chunks,
           "bytes": d.bytes, "error": d.error, "created_at": _iso(d.created_at)}
    if full:
        out["content"] = d.content
    return out


def _chunk_count(text: str, size: int, overlap: int) -> int:
    """How many chunks this text will produce. Kept here rather than guessed in
    the UI so the count shown is the count the indexer will actually make."""
    step = max(1, size - overlap)
    n = len(text)
    return 0 if n == 0 else max(1, -(-max(0, n - overlap) // step))


@router.get("/knowledge-bases")
def list_kbs(ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    rows = (s.query(KnowledgeBase).filter(KnowledgeBase.tenant_id == ctx.tenant_id)
              .order_by(KnowledgeBase.name).all())
    return [_kb(k) for k in rows]


@router.post("/knowledge-bases", status_code=201)
def create_kb(body: KbIn, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    if body.chunk_overlap >= body.chunk_size:
        raise HTTPException(400, "chunk_overlap must be smaller than chunk_size")
    if s.query(KnowledgeBase).filter(KnowledgeBase.tenant_id == ctx.tenant_id,
                                     KnowledgeBase.name == body.name).first():
        raise HTTPException(409, "A knowledge base with that name already exists")
    k = KnowledgeBase(tenant_id=ctx.tenant_id, **body.model_dump())
    s.add(k); s.commit()
    write_audit(s, ctx, "kb.create", k.id, k.name)
    return _kb(k)


@router.get("/knowledge-bases/{kid}")
def get_kb(kid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return _kb(get_or_404(s, KnowledgeBase, kid, ctx.tenant_id))


@router.patch("/knowledge-bases/{kid}")
def patch_kb(kid: str, body: KbPatch,
             ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    k = get_or_404(s, KnowledgeBase, kid, ctx.tenant_id)
    d = body.model_dump(exclude_unset=True)
    size = d.get("chunk_size", k.chunk_size)
    overlap = d.get("chunk_overlap", k.chunk_overlap)
    if overlap >= size:
        raise HTTPException(400, "chunk_overlap must be smaller than chunk_size")
    for key, v in d.items():
        if v is not None:
            setattr(k, key, v)
    s.commit()
    write_audit(s, ctx, "kb.update", k.id, k.name)
    return _kb(k)


@router.delete("/knowledge-bases/{kid}", status_code=204)
def delete_kb(kid: str, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    k = get_or_404(s, KnowledgeBase, kid, ctx.tenant_id)
    name = k.name
    # Documents are scoped to the same tenant, so this delete cannot reach
    # another tenant's rows even though it is a bulk statement.
    s.query(KbDocument).filter(KbDocument.tenant_id == ctx.tenant_id,
                               KbDocument.kb_id == kid).delete()
    s.delete(k); s.commit()
    write_audit(s, ctx, "kb.delete", kid, name)


@router.get("/knowledge-bases/{kid}/documents")
def list_docs(kid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    get_or_404(s, KnowledgeBase, kid, ctx.tenant_id)
    rows = (s.query(KbDocument)
              .filter(KbDocument.tenant_id == ctx.tenant_id, KbDocument.kb_id == kid)
              .order_by(KbDocument.created_at.desc()).all())
    return [_doc(d) for d in rows]


@router.post("/knowledge-bases/{kid}/documents", status_code=201)
def add_doc(kid: str, body: DocIn,
            ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    k = get_or_404(s, KnowledgeBase, kid, ctx.tenant_id)
    if body.source == "url" and not re.match(r"^https?://", body.uri or "", re.I):
        raise HTTPException(400, "a url document needs an http(s) uri")
    if body.source in ("text", "upload") and not body.content:
        raise HTTPException(400, "no content to index")
    d = KbDocument(tenant_id=ctx.tenant_id, kb_id=kid, **body.model_dump())
    d.bytes = len(body.content.encode())
    d.chunks = _chunk_count(body.content, k.chunk_size, k.chunk_overlap)
    d.status = "indexed" if d.chunks else "pending"
    s.add(d); s.flush()
    k.doc_count = (s.query(KbDocument)
                     .filter(KbDocument.tenant_id == ctx.tenant_id,
                             KbDocument.kb_id == kid).count())
    s.commit()
    write_audit(s, ctx, "kb.document.add", d.id, d.title)
    return _doc(d)


@router.get("/knowledge-bases/{kid}/documents/{did}")
def get_doc(kid: str, did: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    d = get_or_404(s, KbDocument, did, ctx.tenant_id)
    if d.kb_id != kid:
        raise HTTPException(404, "Not found")
    return _doc(d, full=True)


@router.delete("/knowledge-bases/{kid}/documents/{did}", status_code=204)
def delete_doc(kid: str, did: str, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    k = get_or_404(s, KnowledgeBase, kid, ctx.tenant_id)
    d = get_or_404(s, KbDocument, did, ctx.tenant_id)
    if d.kb_id != kid:
        raise HTTPException(404, "Not found")
    title = d.title
    s.delete(d); s.flush()
    k.doc_count = (s.query(KbDocument)
                     .filter(KbDocument.tenant_id == ctx.tenant_id,
                             KbDocument.kb_id == kid).count())
    s.commit()
    write_audit(s, ctx, "kb.document.delete", did, title)


@router.post("/knowledge-bases/{kid}/reindex")
def reindex_kb(kid: str, ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    _guard(s)
    k = get_or_404(s, KnowledgeBase, kid, ctx.tenant_id)
    docs = (s.query(KbDocument)
              .filter(KbDocument.tenant_id == ctx.tenant_id,
                      KbDocument.kb_id == kid).all())
    for d in docs:
        d.chunks = _chunk_count(d.content, k.chunk_size, k.chunk_overlap)
        d.status = "indexed" if d.chunks else "pending"
        d.error = ""
    k.doc_count = len(docs)
    s.commit()
    write_audit(s, ctx, "kb.reindex", k.id, k.name)
    return {"documents": len(docs), "chunks": sum(d.chunks for d in docs)}


# ---------------------------------------------------------------- reports ---

REPORT_KINDS = ("calls", "chats", "spend", "agents", "quality")
WINDOWS = {"24h": 1, "7d": 7, "30d": 30, "90d": 90}
SCHEDULES = ("", "daily", "weekly", "monthly")

class ReportIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = "calls"
    window: str = "7d"
    filters: dict = Field(default_factory=dict)
    schedule: str = ""
    recipients: list[str] = Field(default_factory=list)

class ReportPatch(BaseModel):
    name: str | None = None
    kind: str | None = None
    window: str | None = None
    filters: dict | None = None
    schedule: str | None = None
    recipients: list[str] | None = None


def _report(r: Report) -> dict:
    return {"id": r.id, "name": r.name, "kind": r.kind, "window": r.window,
            "filters": r.filters or {}, "schedule": r.schedule,
            "recipients": r.recipients or [],
            "last_run_at": _iso(r.last_run_at), "created_at": _iso(r.created_at)}


def _check_report(kind: str, window: str, schedule: str) -> None:
    if kind not in REPORT_KINDS:
        raise HTTPException(400, f"kind must be one of {', '.join(REPORT_KINDS)}")
    if window not in WINDOWS:
        raise HTTPException(400, f"window must be one of {', '.join(WINDOWS)}")
    if schedule not in SCHEDULES:
        raise HTTPException(400, "schedule must be empty, daily, weekly or monthly")


@router.get("/reports")
def list_reports(ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    rows = (s.query(Report).filter(Report.tenant_id == ctx.tenant_id)
              .order_by(Report.created_at.desc()).all())
    return [_report(r) for r in rows]


@router.post("/reports", status_code=201)
def create_report(body: ReportIn, ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    _check_report(body.kind, body.window, body.schedule)
    r = Report(tenant_id=ctx.tenant_id, **body.model_dump())
    s.add(r); s.commit()
    write_audit(s, ctx, "report.create", r.id, r.name)
    return _report(r)


@router.get("/reports/{rid}")
def get_report(rid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return _report(get_or_404(s, Report, rid, ctx.tenant_id))


@router.patch("/reports/{rid}")
def patch_report(rid: str, body: ReportPatch,
                 ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    r = get_or_404(s, Report, rid, ctx.tenant_id)
    d = body.model_dump(exclude_unset=True)
    _check_report(d.get("kind", r.kind), d.get("window", r.window),
                  d.get("schedule", r.schedule))
    for k, v in d.items():
        if v is not None:
            setattr(r, k, v)
    s.commit()
    write_audit(s, ctx, "report.update", r.id, r.name)
    return _report(r)


@router.delete("/reports/{rid}", status_code=204)
def delete_report(rid: str, ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    r = get_or_404(s, Report, rid, ctx.tenant_id)
    name = r.name
    s.delete(r); s.commit()
    write_audit(s, ctx, "report.delete", rid, name)


@router.post("/reports/{rid}/run")
def run_report(rid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    """Compute the report now and return its rows. Runs against live tables —
    there is no pre-aggregation, so the numbers can never be stale."""
    r = get_or_404(s, Report, rid, ctx.tenant_id)
    since = now() - dt.timedelta(days=WINDOWS[r.window])
    out: dict = {"report": _report(r), "window": r.window,
                 "generated_at": now().isoformat()}

    if r.kind in ("calls", "spend", "quality", "agents"):
        q = s.query(Session_).filter(Session_.tenant_id == ctx.tenant_id,
                                     Session_.started_at >= since)
        rows = q.all()
        out["totals"] = {
            "calls": len(rows),
            "minutes": round(sum(x.duration_s for x in rows) / 60, 1),
            "spend": round(sum(x.cost for x in rows), 2),
            "avg_ttfb_ms": int(sum(x.ttfb_ms for x in rows) / len(rows)) if rows else 0,
        }
        by: dict[str, dict] = {}
        for x in rows:
            k = x.outcome if r.kind == "quality" else x.agent_id
            b = by.setdefault(k, {"key": k, "calls": 0, "minutes": 0.0, "spend": 0.0})
            b["calls"] += 1
            b["minutes"] += x.duration_s / 60
            b["spend"] += x.cost
        if r.kind == "agents":
            names = {a.id: a.name for a in
                     s.query(Agent).filter(Agent.tenant_id == ctx.tenant_id).all()}
            for b in by.values():
                b["label"] = names.get(b["key"], b["key"])
        out["rows"] = [{**b, "minutes": round(b["minutes"], 1),
                        "spend": round(b["spend"], 2)}
                       for b in sorted(by.values(), key=lambda x: -x["calls"])]

    elif r.kind == "chats":
        rows = (s.query(ChatSession)
                  .filter(ChatSession.tenant_id == ctx.tenant_id,
                          ChatSession.started_at >= since).all())
        out["totals"] = {
            "chats": len(rows),
            "messages": sum(x.message_count for x in rows),
            "tokens": sum(x.tokens_in + x.tokens_out for x in rows),
            "spend": round(sum(x.cost for x in rows), 2),
        }
        by = {}
        for x in rows:
            b = by.setdefault(x.channel, {"key": x.channel, "chats": 0, "messages": 0})
            b["chats"] += 1
            b["messages"] += x.message_count
        out["rows"] = sorted(by.values(), key=lambda x: -x["chats"])

    r.last_run_at = now()
    s.commit()
    return out


# ------------------------------------------------------------ notes/guides ---

NOTE_CATEGORIES = ("guide", "runbook", "note")

class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str = "guide"
    body: str = ""
    pinned: bool = False

class NotePatch(BaseModel):
    title: str | None = None
    category: str | None = None
    body: str | None = None
    pinned: bool | None = None


def _note(n: Note, full: bool = False) -> dict:
    out = {"id": n.id, "title": n.title, "category": n.category,
           "pinned": n.pinned, "updated_at": _iso(n.updated_at)}
    out["body"] = n.body if full else (n.body[:180] + ("…" if len(n.body) > 180 else ""))
    return out


@router.get("/notes")
def list_notes(category: str = "", ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    q = s.query(Note).filter(Note.tenant_id == ctx.tenant_id)
    if category:
        q = q.filter(Note.category == category)
    rows = q.order_by(Note.pinned.desc(), Note.updated_at.desc()).all()
    return [_note(n) for n in rows]


@router.post("/notes", status_code=201)
def create_note(body: NoteIn, ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    if body.category not in NOTE_CATEGORIES:
        raise HTTPException(400, f"category must be one of {', '.join(NOTE_CATEGORIES)}")
    n = Note(tenant_id=ctx.tenant_id, **body.model_dump())
    s.add(n); s.commit()
    write_audit(s, ctx, "note.create", n.id, n.title)
    return _note(n, full=True)


@router.get("/notes/{nid}")
def get_note(nid: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    return _note(get_or_404(s, Note, nid, ctx.tenant_id), full=True)


@router.patch("/notes/{nid}")
def patch_note(nid: str, body: NotePatch,
               ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    n = get_or_404(s, Note, nid, ctx.tenant_id)
    d = body.model_dump(exclude_unset=True)
    if d.get("category") and d["category"] not in NOTE_CATEGORIES:
        raise HTTPException(400, f"category must be one of {', '.join(NOTE_CATEGORIES)}")
    for k, v in d.items():
        if v is not None:
            setattr(n, k, v)
    s.commit()
    write_audit(s, ctx, "note.update", n.id, n.title)
    return _note(n, full=True)


@router.delete("/notes/{nid}", status_code=204)
def delete_note(nid: str, ctx: Ctx = Depends(require("operator")), s=Depends(db)):
    _guard(s)
    n = get_or_404(s, Note, nid, ctx.tenant_id)
    title = n.title
    s.delete(n); s.commit()
    write_audit(s, ctx, "note.delete", nid, title)


# --------------------------------------------------------- settings groups ---
#
# Each group has a default shape and a minimum role. Writes are filtered to the
# declared keys, so a client cannot smuggle extra fields into the JSON blob and
# have them persist — the store is loose, the edge is not.

SETTING_GROUPS: dict[str, dict] = {
    "server": {
        "min_role": "admin",
        "defaults": {
            "public_url": "", "region": "", "timezone": "UTC",
            "max_concurrent_calls": 50, "call_timeout_s": 900,
            "default_language": "en", "maintenance_mode": False,
            "maintenance_message": "",
        },
    },
    "security": {
        "min_role": "owner",
        "defaults": {
            "password_min_length": 12, "password_require_symbol": True,
            "session_idle_minutes": 60, "refresh_days": 30,
            "mfa_required": False, "ip_allowlist": [],
            "failed_login_lockout": 5, "audit_retention_days": 365,
        },
    },
    "email": {
        "min_role": "admin",
        "defaults": {
            "provider": "smtp", "smtp_host": "", "smtp_port": 587,
            "smtp_user": "", "use_tls": True,
            "from_name": "", "from_address": "", "reply_to": "",
        },
        # Never returned to a client. Write-only: send a value to set it, omit
        # it to leave it alone. A GET reports whether it is set, not what it is.
        "secrets": ["smtp_password"],
    },
    "storage": {
        "min_role": "admin",
        "defaults": {
            "backend": "local", "local_path": "", "bucket": "", "region": "",
            "endpoint": "", "access_key_id": "",
            "retention_days": 90, "recordings_enabled": True,
        },
        "secrets": ["secret_access_key"],
    },
    "finance": {
        "min_role": "owner",
        "defaults": {
            "currency": "AUD", "rate_per_minute": 0.0, "rate_per_1k_tokens": 0.0,
            "monthly_budget": 0.0, "budget_alert_pct": 80,
            "billing_email": "", "invoice_prefix": "INV",
        },
    },
    "mcp": {
        "min_role": "admin",
        "defaults": {
            "enabled": False, "path": "/mcp", "allow_tools": True,
            "allow_agents": True, "allow_settings": False,
            "allowed_origins": [],
        },
    },
}


class SettingIn(BaseModel):
    value: dict


def _redact(group: str, value: dict) -> dict:
    """Strip secrets, replacing each with a boolean saying whether it is set."""
    spec = SETTING_GROUPS[group]
    out = dict(value)
    for k in spec.get("secrets", []):
        out[f"{k}_set"] = bool(out.pop(k, ""))
    return out


def _load(s, tenant_id: str, group: str) -> dict:
    row = (s.query(TenantSetting)
             .filter(TenantSetting.tenant_id == tenant_id,
                     TenantSetting.group == group).first())
    merged = dict(SETTING_GROUPS[group]["defaults"])
    merged.update(row.value or {} if row else {})
    return merged


@router.get("/settings")
def list_setting_groups(ctx: Ctx = Depends(require("admin"))):
    return [{"group": g, "min_role": spec["min_role"]}
            for g, spec in SETTING_GROUPS.items()]


@router.get("/settings/{group}")
def get_setting(group: str, ctx: Ctx = Depends(require("viewer")), s=Depends(db)):
    spec = SETTING_GROUPS.get(group)
    if not spec:
        raise HTTPException(404, "No such settings group")
    # The dependency can only ask for a fixed role; the group's own minimum is
    # not known until the path is resolved, so it is enforced here.
    if ROLE_RANK[ctx.role] < ROLE_RANK[spec["min_role"]]:
        raise HTTPException(403, f"{spec['min_role']} required")
    return {"group": group, "value": _redact(group, _load(s, ctx.tenant_id, group))}


@router.put("/settings/{group}")
def put_setting(group: str, body: SettingIn,
                ctx: Ctx = Depends(require("admin")), s=Depends(db)):
    spec = SETTING_GROUPS.get(group)
    if not spec:
        raise HTTPException(404, "No such settings group")
    if ROLE_RANK[ctx.role] < ROLE_RANK[spec["min_role"]]:
        raise HTTPException(403, f"{spec['min_role']} required")
    _guard(s)

    allowed = set(spec["defaults"]) | set(spec.get("secrets", []))
    unknown = set(body.value) - allowed
    if unknown:
        raise HTTPException(400, "Unknown keys: " + ", ".join(sorted(unknown)))

    current = _load(s, ctx.tenant_id, group)
    for k, v in body.value.items():
        # A secret sent empty means "leave it as it is", not "clear it" —
        # otherwise every save from a form that cannot display the value
        # would wipe it.
        if k in spec.get("secrets", []) and v == "":
            continue
        want = spec["defaults"].get(k)
        if want is not None and not isinstance(v, type(want)) and not (
                isinstance(want, float) and isinstance(v, int)):
            raise HTTPException(400, f"{k} must be a {type(want).__name__}")
        current[k] = v

    row = (s.query(TenantSetting)
             .filter(TenantSetting.tenant_id == ctx.tenant_id,
                     TenantSetting.group == group).first())
    if row:
        row.value = current
        row.updated_by = ctx.actor_id
    else:
        s.add(TenantSetting(tenant_id=ctx.tenant_id, group=group,
                            value=current, updated_by=ctx.actor_id))
    s.commit()
    write_audit(s, ctx, "settings.update", group, ", ".join(sorted(body.value)))
    return {"group": group, "value": _redact(group, current)}


# ----------------------------------------------------------- dependencies ---

@router.get("/system/dependencies")
def dependencies(ctx: Ctx = Depends(require("admin"))):
    """What this install is actually running on. Read from the live interpreter
    rather than a requirements file, because the file says what was asked for
    and this says what is installed."""
    watch = ["fastapi", "uvicorn", "sqlalchemy", "alembic", "pydantic",
             "pynacl", "argon2-cffi", "httpx", "python-jose", "pyyaml",
             "grpcio", "protobuf", "email-validator"]
    rows = []
    for name in watch:
        try:
            rows.append({"name": name, "version": md.version(name), "status": "installed"})
        except md.PackageNotFoundError:
            rows.append({"name": name, "version": "", "status": "missing"})
    return {
        "python": sys.version.split()[0],
        "platform": sys.platform,
        "packages": sorted(rows, key=lambda r: r["name"]),
        "missing": [r["name"] for r in rows if r["status"] == "missing"],
    }
