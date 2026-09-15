import os, pathlib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .api import v1
from .auth import router as auth_router
from .admin import router as admin_router
from .db import init_db
from . import VERSION, CONTRACTS
from .settings import FRONTEND

app = FastAPI(title="Aetos Voice Core", version=VERSION, docs_url="/api/docs", openapi_url="/api/v1/openapi.json",
              description="Console API. Contracts: core-api v1. Imports no vendor SDK — providers live behind provider-api sidecars.")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("AETOS_CORS","*").split(","), allow_methods=["*"], allow_headers=["*"])
v1.include_router(auth_router)
v1.include_router(admin_router)
app.include_router(v1)

@app.get("/healthz")
def healthz(): return {"ok": True}
@app.get("/version")
def version(): return {"name": "aetos-core", "version": VERSION}
@app.get("/contracts")
def contracts(): return CONTRACTS

@app.on_event("startup")
def _startup(): init_db()

if FRONTEND and pathlib.Path(FRONTEND).exists():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="spa")   # dev convenience; Caddy serves it in prod
