"""/api/v1/auth — login, refresh rotation, logout, profile, tenant switching."""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from .db import (Membership, RefreshToken, Session, Tenant, User, now, uid)
from .deps import Ctx, get_ctx
from .security import (hash_password, hash_refresh, issue_access, needs_rehash,
                       new_refresh, password_problem, refresh_expiry,
                       verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])


# ------------------------------------------------------------- payloads ---

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    tenant: str | None = None          # slug; omit to use the first membership


class RefreshIn(BaseModel):
    refresh: str


class PasswordIn(BaseModel):
    current: str
    new: str = Field(min_length=12)


class SwitchIn(BaseModel):
    tenant_id: str


# --------------------------------------------------------------- helpers ---

def _naive(d: dt.datetime | None) -> dt.datetime | None:
    """SQLite stores naive datetimes; normalise before comparing."""
    if d is None:
        return None
    return d.replace(tzinfo=None) if d.tzinfo else d


def _memberships(s, user: User) -> list[dict]:
    out = []
    for m in s.query(Membership).filter(Membership.user_id == user.id).all():
        t = s.get(Tenant, m.tenant_id)
        if t and t.status == "active":
            out.append({"tenant_id": t.id, "slug": t.slug, "name": t.name,
                        "role": m.role, "is_platform": bool(t.is_platform)})
    return out


def _user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name,
            "must_change_password": bool(u.must_change_password)}


def _issue_pair(s, user: User, tenant: Tenant, role: str,
                request: Request, family_id: str | None = None) -> dict:
    access, expires_in = issue_access(user.id, tenant.id, role)
    raw, digest = new_refresh()
    s.add(RefreshToken(
        user_id=user.id, tenant_id=tenant.id, token_hash=digest,
        family_id=family_id or uid("fam"), expires_at=refresh_expiry(),
        user_agent=request.headers.get("user-agent", "")[:300],
        ip=(request.client.host if request.client else ""),
    ))
    return {
        "access": access, "refresh": raw, "expires_in": expires_in,
        "token_type": "Bearer",
        "user": _user_out(user),
        "tenant": {"id": tenant.id, "slug": tenant.slug, "name": tenant.name,
                   "is_platform": bool(tenant.is_platform)},
        "role": role,
    }


# ---------------------------------------------------------------- routes ---

@router.post("/login")
def login(body: LoginIn, request: Request):
    with Session() as s:
        user = s.query(User).filter(User.email == body.email.lower()).first()

        # Same response whether the account is missing or the password is
        # wrong — otherwise this endpoint enumerates valid email addresses.
        if not user or not verify_password(user.password_hash, body.password):
            raise HTTPException(401, "Invalid email or password")
        if user.status != "active":
            raise HTTPException(403, "Account is disabled")

        memberships = _memberships(s, user)
        if not memberships:
            raise HTTPException(403, "No tenant access")

        if body.tenant:
            chosen = next((m for m in memberships
                           if m["slug"] == body.tenant.lower()), None)
            if not chosen:
                raise HTTPException(403, "No access to that tenant")
        else:
            chosen = memberships[0]

        tenant = s.get(Tenant, chosen["tenant_id"])

        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(body.password)
        user.last_login_at = now()

        out = _issue_pair(s, user, tenant, chosen["role"], request)
        out["memberships"] = memberships
        s.commit()
        return out


@router.post("/refresh")
def refresh(body: RefreshIn, request: Request):
    digest = hash_refresh(body.refresh)
    with Session() as s:
        tok = s.query(RefreshToken).filter(
            RefreshToken.token_hash == digest).first()
        if not tok:
            raise HTTPException(401, "Invalid refresh token")

        # Reuse of an already-rotated token means it leaked. Kill the whole
        # family so the attacker and the victim are both logged out.
        if tok.revoked_at is not None:
            s.query(RefreshToken).filter(
                RefreshToken.family_id == tok.family_id,
                RefreshToken.revoked_at.is_(None)
            ).update({"revoked_at": now()})
            s.commit()
            raise HTTPException(401, "Refresh token reuse detected; session revoked")

        if _naive(tok.expires_at) < _naive(now()):
            raise HTTPException(401, "Refresh token expired")

        user = s.get(User, tok.user_id)
        tenant = s.get(Tenant, tok.tenant_id)
        if not user or user.status != "active":
            raise HTTPException(401, "Account is not active")
        if not tenant or tenant.status != "active":
            raise HTTPException(403, "Tenant is not active")

        membership = s.query(Membership).filter(
            Membership.tenant_id == tenant.id,
            Membership.user_id == user.id).first()
        if not membership:
            raise HTTPException(403, "No access to this tenant")

        tok.revoked_at = now()          # rotate
        out = _issue_pair(s, user, tenant, membership.role, request,
                          family_id=tok.family_id)
        s.commit()
        return out


@router.post("/logout")
def logout(body: RefreshIn):
    with Session() as s:
        tok = s.query(RefreshToken).filter(
            RefreshToken.token_hash == hash_refresh(body.refresh)).first()
        if tok and tok.revoked_at is None:
            tok.revoked_at = now()
            s.commit()
    return {"ok": True}                 # never reveal whether it existed


@router.get("/me")
def me(ctx: Ctx = Depends(get_ctx)):
    if ctx.user is None:
        return {"actor": "api_key", "tenant": {"id": ctx.tenant.id,
                                               "slug": ctx.tenant.slug},
                "role": ctx.role}
    with Session() as s:
        user = s.get(User, ctx.user.id)
        return {
            "actor": "user",
            "user": _user_out(user),
            "tenant": {"id": ctx.tenant.id, "slug": ctx.tenant.slug,
                       "name": ctx.tenant.name,
                       "is_platform": bool(ctx.tenant.is_platform)},
            "role": ctx.role,
            "memberships": _memberships(s, user),
        }


@router.post("/password")
def change_password(body: PasswordIn, ctx: Ctx = Depends(get_ctx)):
    if ctx.user is None:
        raise HTTPException(403, "API keys cannot change passwords")
    problem = password_problem(body.new)
    if problem:
        raise HTTPException(400, problem)

    with Session() as s:
        user = s.get(User, ctx.user.id)
        if not verify_password(user.password_hash, body.current):
            raise HTTPException(401, "Current password is incorrect")
        user.password_hash = hash_password(body.new)
        user.must_change_password = False
        # Changing a password ends every other session.
        s.query(RefreshToken).filter(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None)).update({"revoked_at": now()})
        s.commit()
    return {"ok": True, "note": "All sessions signed out. Sign in again."}


@router.post("/switch-tenant")
def switch_tenant(body: SwitchIn, request: Request, ctx: Ctx = Depends(get_ctx)):
    if ctx.user is None:
        raise HTTPException(403, "API keys are bound to one tenant")
    with Session() as s:
        membership = s.query(Membership).filter(
            Membership.tenant_id == body.tenant_id,
            Membership.user_id == ctx.user.id).first()
        if not membership:
            raise HTTPException(403, "No access to that tenant")
        tenant = s.get(Tenant, body.tenant_id)
        if not tenant or tenant.status != "active":
            raise HTTPException(403, "Tenant is not active")
        user = s.get(User, ctx.user.id)
        out = _issue_pair(s, user, tenant, membership.role, request)
        out["memberships"] = _memberships(s, user)
        s.commit()
        return out


@router.get("/sessions")
def list_sessions(ctx: Ctx = Depends(get_ctx)):
    if ctx.user is None:
        raise HTTPException(403, "Not applicable to API keys")
    with Session() as s:
        rows = s.query(RefreshToken).filter(
            RefreshToken.user_id == ctx.user.id,
            RefreshToken.revoked_at.is_(None)
        ).order_by(RefreshToken.created_at.desc()).all()
        return [{"id": r.id, "created_at": r.created_at,
                 "expires_at": r.expires_at, "ip": r.ip,
                 "user_agent": r.user_agent, "tenant_id": r.tenant_id}
                for r in rows]


@router.delete("/sessions/{sid}")
def revoke_session(sid: str, ctx: Ctx = Depends(get_ctx)):
    if ctx.user is None:
        raise HTTPException(403, "Not applicable to API keys")
    with Session() as s:
        tok = s.get(RefreshToken, sid)
        if not tok or tok.user_id != ctx.user.id:
            raise HTTPException(404, "Not found")
        tok.revoked_at = now()
        s.commit()
    return {"ok": True}
