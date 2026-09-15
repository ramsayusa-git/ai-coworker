"""Brand asset upload — logos, favicons, login art.

Files land under STATE_DIR/assets/<tenant_id>/ and are served back from
/api/v1/assets/<tenant>/<name>. Validation is deliberately strict: these files
are shown to a partner's customers, and an SVG is executable content.
"""
from __future__ import annotations

import hashlib
import re
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .db import Session, Tenant
from .deps import Ctx, audit, require
from .settings import STATE_DIR

router = APIRouter(tags=["assets"])

ASSET_DIR = STATE_DIR / "assets"
ASSET_DIR.mkdir(parents=True, exist_ok=True)

MAX_BYTES = 2 * 1024 * 1024

ALLOWED = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
}

KINDS = {"logo", "logo_dark", "favicon", "login_art"}

# An uploaded SVG is served from our origin, so a script or event handler in it
# would run as us. Reject rather than sanitise — sanitising SVG reliably is a
# losing game, and a partner can always upload a PNG.
SVG_FORBIDDEN = re.compile(
    rb"<\s*script|javascript:|<\s*foreignObject|\son\w+\s*=|<!ENTITY|<\s*iframe",
    re.IGNORECASE,
)

MAGIC = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"\x00\x00\x01\x00": "image/x-icon",
}


def _sniff(head: bytes) -> str | None:
    for sig, mime in MAGIC.items():
        if head.startswith(sig):
            return mime
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    stripped = head.lstrip()[:200].lower()
    if stripped.startswith(b"<svg") or b"<svg" in stripped:
        return "image/svg+xml"
    if stripped.startswith(b"<?xml") and b"svg" in head[:400].lower():
        return "image/svg+xml"
    return None


@router.post("/branding/assets")
async def upload_asset(kind: str, file: UploadFile = File(...),
                       ctx: Ctx = Depends(require("admin"))):
    if kind not in KINDS:
        raise HTTPException(400, f"kind must be one of: {', '.join(sorted(KINDS))}")

    data = await file.read()
    if not data:
        raise HTTPException(400, "The file is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Assets are limited to 2 MB")

    # Trust the bytes, not the declared content-type.
    sniffed = _sniff(data[:512])
    if sniffed not in ALLOWED:
        raise HTTPException(
            415, "Unsupported file. Use PNG, JPEG, WebP, SVG or ICO.")

    if sniffed == "image/svg+xml" and SVG_FORBIDDEN.search(data):
        raise HTTPException(
            400,
            "That SVG contains scripting or embedded content, which cannot be "
            "served safely. Export it as a plain SVG or upload a PNG.",
        )

    ext = ALLOWED[sniffed]
    digest = hashlib.sha256(data).hexdigest()[:12]
    name = f"{kind}-{digest}{ext}"

    tdir = ASSET_DIR / ctx.tenant_id
    tdir.mkdir(parents=True, exist_ok=True)
    (tdir / name).write_bytes(data)

    url = f"/api/v1/assets/{ctx.tenant_id}/{name}"

    with Session() as s:
        audit(s, ctx, "branding.asset.upload", name,
              f"{kind} {len(data)}B {sniffed}")
        s.commit()

    return {"kind": kind, "url": url, "bytes": len(data), "content_type": sniffed}


@router.get("/assets/{tenant_id}/{name}")
def serve_asset(tenant_id: str, name: str):
    """Public on purpose — the login screen needs the logo before sign-in."""
    # Defend against traversal: the name must match what we write.
    if not re.fullmatch(r"[a-z_]+-[0-9a-f]{12}\.(png|jpg|webp|svg|ico)", name):
        raise HTTPException(404, "Not found")
    if not re.fullmatch(r"ten_[A-Za-z0-9]+", tenant_id):
        raise HTTPException(404, "Not found")

    path = (ASSET_DIR / tenant_id / name).resolve()
    if not str(path).startswith(str(ASSET_DIR.resolve())) or not path.is_file():
        raise HTTPException(404, "Not found")

    ctype = {
        ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
        ".svg": "image/svg+xml", ".ico": "image/x-icon",
    }[path.suffix]

    return FileResponse(
        path,
        media_type=ctype,
        headers={
            # Content-addressed filenames, so this is safe to cache hard.
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/branding/assets/{name}")
def delete_asset(name: str, ctx: Ctx = Depends(require("admin"))):
    if not re.fullmatch(r"[a-z_]+-[0-9a-f]{12}\.(png|jpg|webp|svg|ico)", name):
        raise HTTPException(404, "Not found")
    path = (ASSET_DIR / ctx.tenant_id / name).resolve()
    if not str(path).startswith(str(ASSET_DIR.resolve())) or not path.is_file():
        raise HTTPException(404, "Not found")
    path.unlink()
    with Session() as s:
        audit(s, ctx, "branding.asset.delete", name)
        s.commit()
    return {"ok": True}
