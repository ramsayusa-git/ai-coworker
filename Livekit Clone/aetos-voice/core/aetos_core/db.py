from __future__ import annotations
import json, uuid, datetime as dt
from sqlalchemy import create_engine, String, Integer, Float, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, relationship
from .settings import DB_URL

engine = create_engine(DB_URL, connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {})
Session = sessionmaker(bind=engine, expire_on_commit=False)
def now(): return dt.datetime.now(dt.timezone.utc)
def uid(p): return f"{p}_{uuid.uuid4().hex[:10]}"

class Base(DeclarativeBase): pass

class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("agt"))
    name: Mapped[str] = mapped_column(String, unique=True)
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
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("trk"))
    name: Mapped[str] = mapped_column(String, unique=True); carrier: Mapped[str] = mapped_column(String)
    direction: Mapped[str] = mapped_column(String); address: Mapped[str] = mapped_column(String, default="")
    state: Mapped[str] = mapped_column(String, default="unregistered")
class Number(Base):
    __tablename__ = "numbers"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("num"))
    e164: Mapped[str] = mapped_column(String, unique=True); region: Mapped[str] = mapped_column(String, default="")
    direction: Mapped[str] = mapped_column(String, default="both"); trunk_id: Mapped[str | None] = mapped_column(String, nullable=True)
class Rule(Base):
    __tablename__ = "rules"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uid("rul"))
    priority: Mapped[int] = mapped_column(Integer, default=100); name: Mapped[str] = mapped_column(String)
    number: Mapped[str] = mapped_column(String); agent_id: Mapped[str] = mapped_column(String)
    schedule: Mapped[str] = mapped_column(String, default="always")
class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[dt.datetime] = mapped_column(DateTime, default=now); who: Mapped[str] = mapped_column(String, default="system")
    action: Mapped[str] = mapped_column(String); detail: Mapped[str] = mapped_column(Text, default="")

def init_db():
    Base.metadata.create_all(engine)
    with Session() as s:
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
