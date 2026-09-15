from __future__ import annotations
import json, uuid, datetime as dt
from sqlalchemy import (
    create_engine, String, Integer, Float, Text, DateTime, ForeignKey, JSON,
    Boolean, UniqueConstraint, Index,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, relationship
from .settings import DB_URL

# Tenancy constants. The platform tenant's owners administer every other tenant.
PLATFORM_TENANT_ID = "ten_platform"
DEFAULT_TENANT_ID = "ten_default"

ROLES = ("viewer", "operator", "admin", "owner")
ROLE_RANK = {r: i for i, r in enumerate(ROLES)}

engine = create_engine(DB_URL, connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {})
Session = sessionmaker(bind=engine, expire_on_commit=False)
def now(): return dt.datetime.now(dt.timezone.utc)
def uid(p): return f"{p}_{uuid.uuid4().hex[:10]}"

class Base(DeclarativeBase): pass


# ---------------------------------------------------------------- tenancy ---

class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("ten"))
    slug: Mapped[str] = mapped_column(String, unique=True)          # subdomain label
    name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="active")   # active | suspended
    is_platform: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, onupdate=now)


class User(Base):
    """Global identity. A user may hold memberships in several tenants."""
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("usr"))
    email: Mapped[str] = mapped_column(String, unique=True)         # stored lowercased
    password_hash: Mapped[str] = mapped_column(String, default="")
    name: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="active")   # active | disabled | invited
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_membership"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("mem"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String, default="viewer")     # see ROLES
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)


class BrandProfile(Base):
    """One per tenant. Drives the console's runtime CSS variables."""
    __tablename__ = "brand_profiles"
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), primary_key=True)
    product_name: Mapped[str] = mapped_column(String, default="Lattice Net")
    logo_url: Mapped[str] = mapped_column(String, default="")
    logo_dark_url: Mapped[str] = mapped_column(String, default="")
    favicon_url: Mapped[str] = mapped_column(String, default="")
    login_art_url: Mapped[str] = mapped_column(String, default="")
    colors: Mapped[dict] = mapped_column(JSON, default=dict)
    typography: Mapped[dict] = mapped_column(JSON, default=dict)
    radius: Mapped[dict] = mapped_column(JSON, default=dict)
    support_url: Mapped[str] = mapped_column(String, default="")
    docs_url: Mapped[str] = mapped_column(String, default="")
    privacy_url: Mapped[str] = mapped_column(String, default="")
    terms_url: Mapped[str] = mapped_column(String, default="")
    mail_from_name: Mapped[str] = mapped_column(String, default="")
    mail_from_email: Mapped[str] = mapped_column(String, default="")
    mail_footer: Mapped[str] = mapped_column(Text, default="")
    custom_css: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, onupdate=now)


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("key"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    prefix: Mapped[str] = mapped_column(String, index=True)         # shown in UI
    hash: Mapped[str] = mapped_column(String)                       # secret revealed once
    scopes: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    last_used_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)


class RefreshToken(Base):
    """Rotating refresh tokens. Reuse of a rotated token revokes the whole family."""
    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("rt"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String, unique=True)    # sha256, raw never stored
    family_id: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    user_agent: Mapped[str] = mapped_column(String, default="")
    ip: Mapped[str] = mapped_column(String, default="")


class AgentVersion(Base):
    """Designer graph + compiled pipeline, versioned for publish/rollback/diff."""
    __tablename__ = "agent_versions"
    __table_args__ = (UniqueConstraint("agent_id", "version", name="uq_agent_version"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("av"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    graph: Mapped[dict] = mapped_column(JSON, default=dict)         # designer nodes/edges
    pipeline: Mapped[dict] = mapped_column(JSON, default=dict)      # compiled runtime contract
    prompt: Mapped[str] = mapped_column(Text, default="")
    tools: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default="draft")    # draft | published | archived
    note: Mapped[str] = mapped_column(String, default="")
    created_by: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)


class Licence(Base):
    __tablename__ = "licence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    blob: Mapped[str] = mapped_column(Text, default="")             # signed file, verbatim
    installed_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)


# ------------------------------------------------------------ domain rows ---

class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_agent_name"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("agt"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True,
                                           default=DEFAULT_TENANT_ID)
    name: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String, default="voice")          # voice | chat
    status: Mapped[str] = mapped_column(String, default="draft")        # draft | online | paused
    prompt: Mapped[str] = mapped_column(Text, default="")
    pipeline: Mapped[dict] = mapped_column(JSON, default=dict)          # {stt:"stt-whisper", llm:"fast", tts:"tts-piper", voice:"..."}
    tools: Mapped[list] = mapped_column(JSON, default=list)
    kb: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, onupdate=now)

class Session_(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("ses"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True,
                                           default=DEFAULT_TENANT_ID)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"))
    channel: Mapped[str] = mapped_column(String, default="sip")         # sip | web | tester
    caller: Mapped[str] = mapped_column(String, default="")
    started_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    ended_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    outcome: Mapped[str] = mapped_column(String, default="in-progress")
    duration_s: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    ttfb_ms: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str] = mapped_column(Text, default="")
    turns: Mapped[list] = mapped_column(JSON, default=list)             # [{who,text,ts,eot_ms,stt_ms,llm_ms,tts_ms}]
    agent = relationship(Agent)

class Trunk(Base):
    __tablename__ = "trunks"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_trunk_name"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("trk"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True,
                                           default=DEFAULT_TENANT_ID)
    name: Mapped[str] = mapped_column(String); carrier: Mapped[str] = mapped_column(String)
    direction: Mapped[str] = mapped_column(String); address: Mapped[str] = mapped_column(String, default="")
    state: Mapped[str] = mapped_column(String, default="unregistered")

class Number(Base):
    __tablename__ = "numbers"
    __table_args__ = (UniqueConstraint("tenant_id", "e164", name="uq_number_e164"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("num"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True,
                                           default=DEFAULT_TENANT_ID)
    e164: Mapped[str] = mapped_column(String); region: Mapped[str] = mapped_column(String, default="")
    direction: Mapped[str] = mapped_column(String, default="both"); trunk_id: Mapped[str | None] = mapped_column(String, nullable=True)

class Rule(Base):
    __tablename__ = "rules"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("rul"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True,
                                           default=DEFAULT_TENANT_ID)
    priority: Mapped[int] = mapped_column(Integer, default=100); name: Mapped[str] = mapped_column(String)
    number: Mapped[str] = mapped_column(String); agent_id: Mapped[str] = mapped_column(String)
    schedule: Mapped[str] = mapped_column(String, default="always")

class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True,
                                           default=DEFAULT_TENANT_ID)
    ts: Mapped[dt.datetime] = mapped_column(DateTime, default=now, index=True)
    who: Mapped[str] = mapped_column(String, default="system")
    actor_user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    actor_type: Mapped[str] = mapped_column(String, default="system")   # user | api_key | system
    ip: Mapped[str] = mapped_column(String, default="")
    target: Mapped[str] = mapped_column(String, default="")
    action: Mapped[str] = mapped_column(String); detail: Mapped[str] = mapped_column(Text, default="")

def ensure_tenancy(s):
    """Create the platform + default tenants and the default brand profile.

    Idempotent: safe to call on every boot. Does NOT create users — an owner is
    seeded explicitly via `python -m aetos_core seed-owner` so there is never a
    default password in the codebase.
    """
    changed = False
    if not s.get(Tenant, PLATFORM_TENANT_ID):
        s.add(Tenant(id=PLATFORM_TENANT_ID, slug="platform", name="Platform",
                     is_platform=True))
        changed = True
    if not s.get(Tenant, DEFAULT_TENANT_ID):
        s.add(Tenant(id=DEFAULT_TENANT_ID, slug="default", name="Default"))
        changed = True
    if changed:
        s.flush()
    for tid in (PLATFORM_TENANT_ID, DEFAULT_TENANT_ID):
        if not s.get(BrandProfile, tid):
            s.add(BrandProfile(tenant_id=tid, **default_brand()))
            changed = True
    if changed:
        s.commit()


def default_brand() -> dict:
    return {
        "product_name": "Lattice Net",
        "colors": {
            "primary": "#6d5efc", "accent": "#22d3ee", "bg": "#07080d",
            "panel": "#0f111a", "text": "#f2f4f8", "muted": "#9aa2b4",
            "success": "#34d399", "warning": "#fbbf24", "danger": "#f87171",
        },
        "typography": {"font_body": "Inter Variable", "font_mono": "JetBrains Mono", "scale": 1.0},
        "radius": {"sm": "8px", "md": "12px", "lg": "18px"},
    }


def scoped(q, model, tenant_id: str):
    """Every tenant-owned query goes through here. A missing filter is a leak."""
    return q.filter(model.tenant_id == tenant_id)


def init_db():
    Base.metadata.create_all(engine)
    with Session() as s:
        ensure_tenancy(s)
        if s.query(Agent).count() == 0: _seed(s)

def _seed(s):
    a1 = Agent(name="Aetos Receptionist", kind="voice", status="online",
               prompt="You are the receptionist for Aetos Techlabs. Book site surveys, answer pricing questions, transfer to a human when asked.",
               pipeline={"stt":"stt-mock","llm":"fast","tts":"tts-mock","voice":"tone","language":"en"}, tools=["transfer_call","book_appointment"])
    a2 = Agent(name="Sumeru Plant Ops", kind="voice", status="online",
               prompt="You take fault reports from the Sumeru water plant floor. Log a ticket, read back the ticket number.",
               pipeline={"stt":"stt-mock","llm":"fast","tts":"tts-mock","voice":"tone","language":"en"}, tools=["plant_status"])
    a3 = Agent(name="Aetos Support Chat", kind="chat", status="online", prompt="Support chatbot for aetostechlabs.com.",
               pipeline={"llm":"fast"})
    s.add_all([a1,a2,a3]); s.flush()
    import random; random.seed(7)
    outcomes=["completed"]*7+["no-answer","transferred","failed"]
    callers=["+61 412 908 774","+61 401 553 210","+91 98490 11223","+61 3 9042 8811","+61 438 771 602","+91 90000 41277"]
    summaries=["Booked a site survey for Thursday 10am","Asked about PLC monitoring pricing, sent brochure","Reported RO pump 2 tripping, logged ticket",
               "Rescheduled Friday install to next Tuesday","Wash cycle 3 aborted — asked for manual restart","Caller hung up during greeting"]
    for i in range(48):
        ag = random.choice([a1,a2]); o = random.choice(outcomes); d = random.randint(20, 480) if o!="no-answer" else random.randint(5,25)
        st = now() - dt.timedelta(minutes=random.randint(5, 1440))
        s.add(Session_(agent_id=ag.id, channel="sip", caller=random.choice(callers), started_at=st, ended_at=st+dt.timedelta(seconds=d),
                       outcome=o, duration_s=d, cost=round(d*0.0012+0.02,3), ttfb_ms=random.randint(640,780) if o!="failed" else 0,
                       summary=random.choice(summaries),
                       turns=[{"who":"caller","text":"Hi, I had a call about the plant monitoring package last week.","ts":4,"eot_ms":210,"stt_ms":62,"llm_ms":188,"tts_ms":71},
                              {"who":"agent","text":"Of course — was that for the Sumeru site or a new location?","ts":7}]))
    s.add_all([Trunk(name="tw-inbound-au",carrier="Twilio",direction="inbound",address="+61 3 9042 8811",state="registered"),
               Trunk(name="tnx-outbound-in",carrier="Telnyx",direction="outbound",address="+91 40 4854 2200",state="registered"),
               Number(e164="+61 3 9042 8811",region="Melbourne, AU",direction="inbound"),
               Number(e164="+91 40 4854 2200",region="Hyderabad, IN",direction="both"),
               Rule(priority=10,name="Business hours AU",number="+61 3 9042 8811",agent_id=a1.id,schedule="Mon–Fri 08:00–18:00 AEST"),
               Rule(priority=20,name="Plant line",number="+91 40 4854 2200",agent_id=a2.id,schedule="always"),
               Audit(who="system",action="seed",detail="sample data created")])
    s.commit()
