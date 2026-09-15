"""Tenants, users, API keys, branding and licence administration."""
from __future__ import annotations

import datetime as dt
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from . import licensing
from .db import (ApiKey, BrandProfile, Membership, RefreshToken, ROLES,
                 Session, Tenant, User, default_brand, now)
from .deps import Ctx, audit, get_ctx, require, require_platform
from .security import generate_password, hash_password, new_api_key

router = APIRouter(tags=["admin"])

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$")
RESERVED_SLUGS = {"api", "www", "admin", "app", "platform", "mail", "static"}


# ------------------------------------------------------------- payloads ---

class TenantIn(BaseModel):
    slug: str
    name: str
    owner_email: EmailStr | None = None


class TenantPatch(BaseModel):
    name: str | None = None
    status: str | None = None


class UserIn(BaseModel):
    email: EmailStr
    name: str = ""
    role: str = "viewer"


class UserPatch(BaseModel):
    name: str | None = None
    role: str | None = None
    status: str | None = None


class KeyIn(BaseModel):
    name: str
    scopes: list[str] = Field(default_factory=list)
    expires_days: int | None = None


class BrandIn(BaseModel):
    product_name: str | None = None
    logo_url: str | None = None
    logo_dark_url: str | None = None
    favicon_url: str | None = None
    login_art_url: str | None = None
    colors: dict | None = None
    typography: dict | None = None
    radius: dict | None = None
    support_url: str | None = None
    docs_url: str | None = None
    privacy_url: str | None = None
    terms_url: str | None = None
    mail_from_name: str | None = None
    mail_from_email: str | None = None
    mail_footer: str | None = None
    custom_css: str | None = None


class LicenceIn(BaseModel):
    blob: str


# --------------------------------------------------------------- tenants ---

def _tenant_out(t: Tenant, s=None) -> dict:
    out = {"id": t.id, "slug": t.slug, "name": t.name, "status": t.status,
           "is_platform": bool(t.is_platform), "created_at": t.created_at}
    if s is not None:
        out["users"] = s.query(Membership).filter(
            Membership.tenant_id == t.id).count()
    return out


@router.get("/tenants")
def list_tenants(ctx: Ctx = Depends(require_platform)):
    with Session() as s:
        return [_tenant_out(t, s) for t in
                s.query(Tenant).order_by(Tenant.created_at).all()]


@router.post("/tenants")
def create_tenant(body: TenantIn, ctx: Ctx = Depends(require_platform)):
    slug = body.slug.strip().lower()
    if not SLUG_RE.match(slug):
        raise HTTPException(400, "Slug must be 3-40 chars, a-z 0-9 and hyphens, "
                                 "not starting or ending with a hyphen")
    if slug in RESERVED_SLUGS:
        raise HTTPException(400, f"'{slug}' is reserved")

    with Session() as s:
        state = licensing.current(s)
        licensing.enforce_readonly(state)
        cap = state.get("tenants_max")
        if cap is not None and s.query(Tenant).filter(
                Tenant.is_platform.is_(False)).count() >= cap:
            raise HTTPException(
                402, f"Licence allows {cap} tenants. Upgrade to add more.")

        if s.query(Tenant).filter(Tenant.slug == slug).first():
            raise HTTPException(409, "That slug is taken")

        t = Tenant(slug=slug, name=body.name)
        s.add(t)
        s.flush()
        s.add(BrandProfile(tenant_id=t.id, **default_brand()))

        created = None
        if body.owner_email:
            email = body.owner_email.lower()
            u = s.query(User).filter(User.email == email).first()
            password = None
            if not u:
                password = generate_password()
                u = User(email=email, name=email.split("@")[0],
                         password_hash=hash_password(password),
                         must_change_password=True)
                s.add(u)
                s.flush()
            s.add(Membership(tenant_id=t.id, user_id=u.id, role="owner"))
            created = {"email": email, "password": password}

        audit(s, ctx, "tenant.create", t.id, f"slug={slug}")
        s.commit()
        out = _tenant_out(t)
        if created:
            out["owner"] = created     # password shown once, only on creation
        return out


@router.patch("/tenants/{tid}")
def patch_tenant(tid: str, body: TenantPatch, ctx: Ctx = Depends(require_platform)):
    with Session() as s:
        t = s.get(Tenant, tid)
        if not t:
            raise HTTPException(404, "Not found")
        if body.name is not None:
            t.name = body.name
        if body.status is not None:
            if body.status not in ("active", "suspended"):
                raise HTTPException(400, "status must be active or suspended")
            if t.is_platform and body.status != "active":
                raise HTTPException(400, "The platform tenant cannot be suspended")
            t.status = body.status
        audit(s, ctx, "tenant.update", tid, body.model_dump_json(exclude_none=True))
        s.commit()
        return _tenant_out(t, s)


# ----------------------------------------------------------------- users ---

def _user_out(u: User, role: str) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": role,
            "status": u.status, "last_login_at": u.last_login_at,
            "must_change_password": bool(u.must_change_password)}


@router.get("/users")
def list_users(ctx: Ctx = Depends(require("admin"))):
    with Session() as s:
        rows = []
        for m in s.query(Membership).filter(
                Membership.tenant_id == ctx.tenant_id).all():
            u = s.get(User, m.user_id)
            if u:
                rows.append(_user_out(u, m.role))
        rows.sort(key=lambda r: r["email"])
        return rows


@router.post("/users")
def add_user(body: UserIn, ctx: Ctx = Depends(require("admin"))):
    if body.role not in ROLES:
        raise HTTPException(400, f"role must be one of {', '.join(ROLES)}")
    if body.role == "owner" and not ctx.can("owner"):
        raise HTTPException(403, "Only an owner can create another owner")

    email = body.email.lower()
    with Session() as s:
        licensing.enforce_readonly(licensing.current(s))
        u = s.query(User).filter(User.email == email).first()
        password = None
        if not u:
            password = generate_password()
            u = User(email=email, name=body.name or email.split("@")[0],
                     password_hash=hash_password(password),
                     must_change_password=True)
            s.add(u)
            s.flush()
        if s.query(Membership).filter(Membership.tenant_id == ctx.tenant_id,
                                      Membership.user_id == u.id).first():
            raise HTTPException(409, "Already a member of this tenant")
        s.add(Membership(tenant_id=ctx.tenant_id, user_id=u.id, role=body.role))
        audit(s, ctx, "user.add", u.id, f"{email} as {body.role}")
        s.commit()
        out = _user_out(u, body.role)
        if password:
            out["password"] = password      # shown once
        return out


@router.patch("/users/{uid_}")
def patch_user(uid_: str, body: UserPatch, ctx: Ctx = Depends(require("admin"))):
    with Session() as s:
        m = s.query(Membership).filter(Membership.tenant_id == ctx.tenant_id,
                                       Membership.user_id == uid_).first()
        if not m:
            raise HTTPException(404, "Not found")
        u = s.get(User, uid_)

        if body.role is not None:
            if body.role not in ROLES:
                raise HTTPException(400, "Unknown role")
            if (body.role == "owner" or m.role == "owner") and not ctx.can("owner"):
                raise HTTPException(403, "Only an owner can change owner roles")
            if m.role == "owner" and body.role != "owner":
                remaining = s.query(Membership).filter(
                    Membership.tenant_id == ctx.tenant_id,
                    Membership.role == "owner").count()
                if remaining <= 1:
                    raise HTTPException(400, "A tenant must keep at least one owner")
            m.role = body.role
        if body.name is not None:
            u.name = body.name
        if body.status is not None:
            if body.status not in ("active", "disabled"):
                raise HTTPException(400, "status must be active or disabled")
            if body.status == "disabled" and u.id == ctx.actor_id:
                raise HTTPException(400, "You cannot disable your own account")
            u.status = body.status
            if body.status == "disabled":
                s.query(RefreshToken).filter(
                    RefreshToken.user_id == u.id,
                    RefreshToken.revoked_at.is_(None)).update(
                        {"revoked_at": now()})

        audit(s, ctx, "user.update", uid_, body.model_dump_json(exclude_none=True))
        s.commit()
        return _user_out(u, m.role)


@router.delete("/users/{uid_}")
def remove_user(uid_: str, ctx: Ctx = Depends(require("admin"))):
    with Session() as s:
        m = s.query(Membership).filter(Membership.tenant_id == ctx.tenant_id,
                                       Membership.user_id == uid_).first()
        if not m:
            raise HTTPException(404, "Not found")
        if uid_ == ctx.actor_id:
            raise HTTPException(400, "You cannot remove yourself")
        if m.role == "owner":
            remaining = s.query(Membership).filter(
                Membership.tenant_id == ctx.tenant_id,
                Membership.role == "owner").count()
            if remaining <= 1:
                raise HTTPException(400, "A tenant must keep at least one owner")
        s.delete(m)
        s.query(RefreshToken).filter(
            RefreshToken.user_id == uid_,
            RefreshToken.tenant_id == ctx.tenant_id,
            RefreshToken.revoked_at.is_(None)).update({"revoked_at": now()})
        audit(s, ctx, "user.remove", uid_)
        s.commit()
    return {"ok": True}


# -------------------------------------------------------------- API keys ---

@router.get("/api-keys")
def list_keys(ctx: Ctx = Depends(require("owner"))):
    with Session() as s:
        rows = s.query(ApiKey).filter(ApiKey.tenant_id == ctx.tenant_id
                                      ).order_by(ApiKey.created_at.desc()).all()
        return [{"id": k.id, "name": k.name, "prefix": k.prefix,
                 "scopes": k.scopes, "created_at": k.created_at,
                 "last_used_at": k.last_used_at, "expires_at": k.expires_at,
                 "revoked_at": k.revoked_at} for k in rows]


@router.post("/api-keys")
def create_key(body: KeyIn, ctx: Ctx = Depends(require("owner"))):
    full, prefix, digest = new_api_key()
    with Session() as s:
        licensing.enforce_readonly(licensing.current(s))
        expires = (now() + dt.timedelta(days=body.expires_days)
                   if body.expires_days else None)
        k = ApiKey(tenant_id=ctx.tenant_id, name=body.name, prefix=prefix,
                   hash=digest, scopes=body.scopes, created_by=ctx.actor_id,
                   expires_at=expires)
        s.add(k)
        audit(s, ctx, "apikey.create", k.id, body.name)
        s.commit()
        return {"id": k.id, "name": k.name, "prefix": prefix,
                "secret": full,
                "note": "Copy this now — it is not stored and cannot be shown again.",
                "expires_at": expires}


@router.delete("/api-keys/{kid}")
def revoke_key(kid: str, ctx: Ctx = Depends(require("owner"))):
    with Session() as s:
        k = s.get(ApiKey, kid)
        if not k or k.tenant_id != ctx.tenant_id:
            raise HTTPException(404, "Not found")
        k.revoked_at = now()
        audit(s, ctx, "apikey.revoke", kid, k.name)
        s.commit()
    return {"ok": True}


# -------------------------------------------------------------- branding ---

def _brand_out(b: BrandProfile) -> dict:
    return {
        "product_name": b.product_name, "logo_url": b.logo_url,
        "logo_dark_url": b.logo_dark_url, "favicon_url": b.favicon_url,
        "login_art_url": b.login_art_url, "colors": b.colors or {},
        "typography": b.typography or {}, "radius": b.radius or {},
        "support_url": b.support_url, "docs_url": b.docs_url,
        "privacy_url": b.privacy_url, "terms_url": b.terms_url,
        "mail_from_name": b.mail_from_name, "mail_from_email": b.mail_from_email,
        "mail_footer": b.mail_footer, "custom_css": b.custom_css,
        "updated_at": b.updated_at,
    }


@router.get("/branding/public")
def branding_public(request: Request, host: str | None = None):
    """Unauthenticated: the login screen must be branded before sign-in."""
    h = (host or request.headers.get("host", "")).split(":")[0]
    label = h.split(".")[0].lower() if h else ""
    with Session() as s:
        tenant = None
        if label and label not in {"localhost", "127", "www", "api"}:
            tenant = s.query(Tenant).filter(Tenant.slug == label).first()
        if not tenant:
            from .db import DEFAULT_TENANT_ID
            tenant = s.get(Tenant, DEFAULT_TENANT_ID)
        if not tenant:
            return {"product_name": "Lattice Net", **default_brand()}
        b = s.get(BrandProfile, tenant.id)
        if not b:
            return {"product_name": "Lattice Net", **default_brand()}
        out = _brand_out(b)
        # Public surface: only what the login screen needs.
        for private in ("mail_from_name", "mail_from_email", "mail_footer"):
            out.pop(private, None)
        out["tenant"] = {"slug": tenant.slug, "name": tenant.name}
        return out


@router.get("/branding")
def get_branding(ctx: Ctx = Depends(get_ctx)):
    with Session() as s:
        b = s.get(BrandProfile, ctx.tenant_id)
        if not b:
            b = BrandProfile(tenant_id=ctx.tenant_id, **default_brand())
            s.add(b)
            s.commit()
        return _brand_out(b)


@router.put("/branding")
def put_branding(body: BrandIn, ctx: Ctx = Depends(require("admin"))):
    if body.custom_css and len(body.custom_css) > 100_000:
        raise HTTPException(400, "custom_css is limited to 100 KB")
    with Session() as s:
        licensing.enforce_readonly(licensing.current(s))
        b = s.get(BrandProfile, ctx.tenant_id)
        if not b:
            b = BrandProfile(tenant_id=ctx.tenant_id, **default_brand())
            s.add(b)
            s.flush()
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(b, field, value)
        audit(s, ctx, "branding.update", ctx.tenant_id)
        s.commit()
        return _brand_out(b)


# --------------------------------------------------------------- licence ---

@router.get("/licence")
def get_licence(ctx: Ctx = Depends(get_ctx)):
    with Session() as s:
        return licensing.current(s)


@router.put("/licence")
def put_licence(body: LicenceIn, ctx: Ctx = Depends(require_platform)):
    ok, payload, err = licensing.verify_licence(body.blob)
    if not ok:
        raise HTTPException(400, f"Licence rejected: {err}")
    from .db import Licence
    with Session() as s:
        row = s.get(Licence, 1)
        if row:
            row.blob = body.blob
            row.installed_at = now()
        else:
            s.add(Licence(id=1, blob=body.blob))
        audit(s, ctx, "licence.install", "", payload.get("licensee", ""))
        s.commit()
        return licensing.licence_state(payload)
