"""Request-scoped auth: who is calling, for which tenant, with what role.

Every tenant-owned route depends on `ctx`. A route that forgets it is
unauthenticated — that is deliberate, so the omission is obvious in review
rather than silently permissive.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import (ROLE_RANK, ApiKey, Audit, Membership, Session, Tenant, User,
                 now)
from .security import decode_access, verify_api_key

bearer = HTTPBearer(auto_error=False)


@dataclass
class Ctx:
    """Resolved caller. `tenant_id` is the only tenant this request may touch."""
    user: User | None
    tenant: Tenant
    role: str
    actor_type: str            # user | api_key
    actor_id: str
    ip: str

    @property
    def tenant_id(self) -> str:
        return self.tenant.id

    @property
    def is_platform(self) -> bool:
        return bool(self.tenant.is_platform)

    def can(self, minimum: str) -> bool:
        return ROLE_RANK.get(self.role, -1) >= ROLE_RANK[minimum]


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


def _tenant_from_host(s, host: str) -> Tenant | None:
    """Resolve a tenant from the Host header's first label."""
    if not host:
        return None
    label = host.split(":")[0].split(".")[0].lower()
    if not label or label in {"localhost", "127", "www", "api"}:
        return None
    return s.query(Tenant).filter(Tenant.slug == label).first()


def get_ctx(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_tenant_slug: str | None = Header(default=None, alias="X-Tenant-Slug"),
) -> Ctx:
    if creds is None or not creds.credentials:
        raise HTTPException(401, "Not authenticated")

    token = creds.credentials
    ip = _client_ip(request)

    with Session() as s:
        # --- API key -------------------------------------------------------
        if token.startswith("ltn_"):
            prefix = token[:12]
            for key in s.query(ApiKey).filter(ApiKey.prefix == prefix,
                                              ApiKey.revoked_at.is_(None)).all():
                if not verify_api_key(key.hash, token):
                    continue
                if key.expires_at and key.expires_at < now().replace(tzinfo=None):
                    raise HTTPException(401, "API key expired")
                tenant = s.get(Tenant, key.tenant_id)
                if not tenant or tenant.status != "active":
                    raise HTTPException(403, "Tenant is not active")
                # A key is bound to its tenant; a mismatched header is an error,
                # never silently ignored.
                if x_tenant_slug and x_tenant_slug.lower() != tenant.slug:
                    raise HTTPException(403, "Tenant mismatch")
                key.last_used_at = now()
                s.commit()
                return Ctx(user=None, tenant=tenant, role="admin",
                           actor_type="api_key", actor_id=key.id, ip=ip)
            raise HTTPException(401, "Invalid API key")

        # --- user JWT ------------------------------------------------------
        claims = decode_access(token)
        if not claims:
            raise HTTPException(401, "Invalid or expired token")

        user = s.get(User, claims.get("sub", ""))
        if not user or user.status != "active":
            raise HTTPException(401, "Account is not active")

        tenant = s.get(Tenant, claims.get("tid", ""))
        if not tenant or tenant.status != "active":
            raise HTTPException(403, "Tenant is not active")

        # Host/header must agree with the token. Preferring one over the other
        # is how cross-tenant access bugs happen.
        host_tenant = _tenant_from_host(s, request.headers.get("host", ""))
        if host_tenant and host_tenant.id != tenant.id:
            raise HTTPException(403, "Tenant mismatch")

        membership = s.query(Membership).filter(
            Membership.tenant_id == tenant.id,
            Membership.user_id == user.id).first()
        if not membership:
            raise HTTPException(403, "No access to this tenant")

        # The token carries a role, but membership is the source of truth — a
        # role change must take effect without waiting for the token to expire.
        return Ctx(user=user, tenant=tenant, role=membership.role,
                   actor_type="user", actor_id=user.id, ip=ip)


def require(minimum: str):
    """Dependency factory: `Depends(require("admin"))`."""
    def _dep(ctx: Ctx = Depends(get_ctx)) -> Ctx:
        if not ctx.can(minimum):
            raise HTTPException(403, f"Requires {minimum} role")
        return ctx
    return _dep


def require_platform(ctx: Ctx = Depends(get_ctx)) -> Ctx:
    """Platform-tenant owners only — cross-tenant administration."""
    if not ctx.is_platform or not ctx.can("owner"):
        raise HTTPException(403, "Platform owner only")
    return ctx


def audit(s, ctx: Ctx, action: str, target: str = "", detail: str = "") -> None:
    s.add(Audit(
        tenant_id=ctx.tenant_id,
        who=(ctx.user.email if ctx.user else f"api_key:{ctx.actor_id}"),
        actor_user_id=(ctx.user.id if ctx.user else None),
        actor_type=ctx.actor_type,
        ip=ctx.ip,
        target=target,
        action=action,
        detail=detail,
    ))


def get_or_404(s, model, obj_id: str, tenant_id: str):
    """Fetch a tenant-owned row.

    A row belonging to another tenant returns 404, never 403 — a 403 would
    confirm the id exists.
    """
    obj = s.get(model, obj_id)
    if not obj or getattr(obj, "tenant_id", None) != tenant_id:
        raise HTTPException(404, "Not found")
    return obj
