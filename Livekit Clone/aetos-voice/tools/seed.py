#!/usr/bin/env python3
"""Seed demo data into Lattice Net."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from aetos_core.db import init_db, Session, uid, now
from aetos_core.auth import hash_password
import datetime as dt
import json

def seed():
    """Initialize database and seed demo data."""
    init_db()  # Create tables
    
    s = Session()
    try:
        # Import models AFTER db init
        from aetos_core.db import (
            Tenant, User, Membership, Agent, Room, ChatSession, Recording,
            Tool, KnowledgeBase, KbDocument, Report, Note, TenantSetting
        )

        # Clear existing demo data
        for table in [Recording, Note, Report, KbDocument, KnowledgeBase, Tool,
                      ChatSession, Room, Agent, Membership, User, Tenant]:
            s.query(table).delete()
        s.commit()

        now_ts = now()
        now_str = now_ts.isoformat()

        # Tenants
        ten_default = Tenant(
            id=uid("ten"), slug="default-demo", name="Default Demo Tenant",
            status="active", is_platform=False,
            created_at=now_ts, updated_at=now_ts
        )
        ten_acme = Tenant(
            id=uid("ten"), slug="acme-demo", name="ACME Corp",
            status="active", is_platform=False,
            created_at=now_ts, updated_at=now_ts
        )
        s.add_all([ten_default, ten_acme])
        s.flush()
        ten_default_id, ten_acme_id = ten_default.id, ten_acme.id

        # Users
        usr_owner_default = User(
            id=uid("usr"), email="owner@default-demo.com",
            password_hash=hash_password("demo123"),
            name="Demo Owner (Default)", status="active",
            created_at=now_ts, updated_at=now_ts
        )
        usr_op_default = User(
            id=uid("usr"), email="operator@default-demo.com",
            password_hash=hash_password("demo123"),
            name="Demo Operator (Default)", status="active",
            created_at=now_ts, updated_at=now_ts
        )
        usr_owner_acme = User(
            id=uid("usr"), email="owner@acme-demo.com",
            password_hash=hash_password("demo123"),
            name="Demo Owner (ACME)", status="active",
            created_at=now_ts, updated_at=now_ts
        )
        s.add_all([usr_owner_default, usr_op_default, usr_owner_acme])
        s.flush()

        # Memberships
        s.add_all([
            Membership(id=uid("mem"), tenant_id=ten_default_id,
                      user_id=usr_owner_default.id, role="owner", created_at=now_ts),
            Membership(id=uid("mem"), tenant_id=ten_default_id,
                      user_id=usr_op_default.id, role="operator", created_at=now_ts),
            Membership(id=uid("mem"), tenant_id=ten_acme_id,
                      user_id=usr_owner_acme.id, role="owner", created_at=now_ts),
        ])
        s.flush()

        # Agents
        agent_support = Agent(
            id=uid("agt"), tenant_id=ten_default_id,
            name="Support Bot", kind="voice", status="online",
            prompt="You are a helpful support agent.",
            pipeline={"type": "llm", "model": "gpt-4"},
            tools=[], updated_at=now_ts
        )
        agent_sales = Agent(
            id=uid("agt"), tenant_id=ten_default_id,
            name="Sales Chat", kind="chat", status="online",
            prompt="You are a sales assistant.",
            pipeline={"type": "llm", "model": "gpt-3.5-turbo"},
            tools=[], updated_at=now_ts
        )
        agent_billing = Agent(
            id=uid("agt"), tenant_id=ten_default_id,
            name="Billing Bot", kind="voice", status="paused",
            prompt="You handle billing inquiries.",
            pipeline={"type": "llm", "model": "gpt-4"},
            tools=[], updated_at=now_ts
        )
        agent_acme = Agent(
            id=uid("agt"), tenant_id=ten_acme_id,
            name="ACME Support", kind="voice", status="online",
            prompt="ACME Corp support specialist.",
            pipeline={"type": "llm", "model": "gpt-4"},
            tools=[], updated_at=now_ts
        )
        s.add_all([agent_support, agent_sales, agent_billing, agent_acme])
        s.flush()

        # Rooms
        rooms = [
            Room(
                id=uid("rm"), tenant_id=ten_default_id,
                name="support-queue", kind="voice", status="idle",
                agent_id=agent_support.id, max_participants=8,
                empty_timeout_s=300, participants=[],
                metadata_json={"department": "support"},
                created_at=now_ts,
                last_active_at=now_ts - dt.timedelta(hours=2)
            ),
            Room(
                id=uid("rm"), tenant_id=ten_default_id,
                name="sales-collaboration", kind="video", status="live",
                agent_id=agent_sales.id, max_participants=4,
                empty_timeout_s=600,
                participants=[
                    {"identity": "visitor-001", "role": "guest"},
                    {"identity": "agent-sales", "role": "agent"}
                ],
                metadata_json={"department": "sales"},
                created_at=now_ts - dt.timedelta(hours=1),
                last_active_at=now_ts
            ),
            Room(
                id=uid("rm"), tenant_id=ten_default_id,
                name="billing-callback", kind="voice", status="closed",
                agent_id=agent_billing.id, max_participants=2,
                empty_timeout_s=60, participants=[],
                metadata_json={"department": "billing"},
                created_at=now_ts - dt.timedelta(days=1),
                last_active_at=now_ts - dt.timedelta(hours=20)
            ),
            Room(
                id=uid("rm"), tenant_id=ten_acme_id,
                name="acme-main", kind="voice", status="idle",
                agent_id=agent_acme.id, max_participants=8,
                empty_timeout_s=300, participants=[],
                metadata_json={"department": "support", "region": "us-east"},
                created_at=now_ts - dt.timedelta(hours=3),
                last_active_at=now_ts - dt.timedelta(hours=1)
            ),
            Room(
                id=uid("rm"), tenant_id=ten_default_id,
                name="test-room", kind="data", status="idle",
                agent_id=None, max_participants=16,
                empty_timeout_s=300, participants=[],
                metadata_json={},
                created_at=now_ts,
                last_active_at=None
            ),
        ]
        s.add_all(rooms)
        s.flush()
        room_support_id = rooms[0].id

        # Chat Sessions
        s.add_all([
            ChatSession(
                id=uid("ch"), tenant_id=ten_default_id,
                agent_id=agent_sales.id, channel="web",
                visitor="visitor-alice@example.com", status="closed",
                started_at=now_ts - dt.timedelta(hours=5),
                ended_at=now_ts - dt.timedelta(hours=4, minutes=30),
                message_count=12, tokens_in=340, tokens_out=280,
                cost=0.0024,
                summary="Customer inquired about Premium plan pricing.",
                messages=[{"who": "visitor", "text": "Hi, interested in Premium plan", "ts": 1694000000}]
            ),
            ChatSession(
                id=uid("ch"), tenant_id=ten_default_id,
                agent_id=agent_support.id, channel="slack",
                visitor="user-bob", status="open",
                started_at=now_ts - dt.timedelta(hours=1),
                ended_at=None, message_count=5,
                tokens_in=120, tokens_out=95, cost=0.0008,
                summary="", messages=[]
            ),
            ChatSession(
                id=uid("ch"), tenant_id=ten_acme_id,
                agent_id=agent_acme.id, channel="web",
                visitor="acme-cust-42", status="closed",
                started_at=now_ts - dt.timedelta(days=1, hours=3),
                ended_at=now_ts - dt.timedelta(days=1, hours=2),
                message_count=8, tokens_in=210, tokens_out=185,
                cost=0.0019, summary="Setup issue resolved.", messages=[]
            ),
        ])
        s.flush()

        # Recordings
        s.add_all([
            Recording(
                id=uid("rec"), tenant_id=ten_default_id,
                session_id=None, room_id=room_support_id,
                kind="audio", status="complete", destination="local",
                path="/recordings/room-support-queue-2026-09-17.wav",
                size_bytes=2847621, duration_s=315, error="",
                started_at=now_ts - dt.timedelta(hours=2),
                finished_at=now_ts - dt.timedelta(hours=2) + dt.timedelta(seconds=315)
            ),
            Recording(
                id=uid("rec"), tenant_id=ten_default_id,
                session_id=None, room_id=None,
                kind="video", status="failed", destination="s3",
                path="", size_bytes=0, duration_s=0,
                error="Recording codec not supported by destination",
                started_at=now_ts - dt.timedelta(hours=6),
                finished_at=now_ts - dt.timedelta(hours=6) + dt.timedelta(seconds=60)
            ),
        ])
        s.flush()

        # Tools
        s.add_all([
            Tool(
                id=uid("tl"), tenant_id=ten_default_id,
                name="Get Order Status", kind="http",
                description="Lookup order status by order ID", enabled=True,
                method="GET", url="https://api.example.com/orders/{order_id}",
                headers={"Authorization": "Bearer ***"},
                parameters={"order_id": {"type": "string", "required": True}},
                timeout_s=5, updated_at=now_ts
            ),
            Tool(
                id=uid("tl"), tenant_id=ten_default_id,
                name="Create Ticket", kind="http",
                description="Create a support ticket", enabled=True,
                method="POST", url="https://api.example.com/tickets",
                headers={"Content-Type": "application/json"},
                parameters={"subject": {"type": "string"}, "description": {"type": "string"}},
                timeout_s=10, updated_at=now_ts
            ),
            Tool(
                id=uid("tl"), tenant_id=ten_default_id,
                name="Python Eval", kind="builtin",
                description="Evaluate Python expressions", enabled=False,
                method="", url="", headers={}, parameters={},
                timeout_s=30, updated_at=now_ts
            ),
            Tool(
                id=uid("tl"), tenant_id=ten_acme_id,
                name="ACME API", kind="http",
                description="ACME Corp internal API", enabled=True,
                method="GET", url="https://acme-internal.example.com/api/v1",
                headers={"Authorization": "Bearer acme-key"},
                parameters={}, timeout_s=5, updated_at=now_ts
            ),
        ])
        s.flush()

        # Knowledge Bases
        kb_support = KnowledgeBase(
            id=uid("kb"), tenant_id=ten_default_id,
            name="Support Articles",
            description="Common support questions and troubleshooting",
            embedding_model="openai/text-embedding-3-small",
            chunk_size=512, chunk_overlap=100, doc_count=3,
            created_at=now_ts - dt.timedelta(days=30)
        )
        kb_acme = KnowledgeBase(
            id=uid("kb"), tenant_id=ten_acme_id,
            name="ACME Docs",
            description="ACME Corp product documentation",
            embedding_model="openai/text-embedding-3-large",
            chunk_size=1024, chunk_overlap=200, doc_count=1,
            created_at=now_ts - dt.timedelta(days=14)
        )
        s.add_all([kb_support, kb_acme])
        s.flush()

        # KB Documents
        s.add_all([
            KbDocument(
                id=uid("kd"), tenant_id=ten_default_id, kb_id=kb_support.id,
                title="How to Reset Password", source="internal",
                uri="https://docs.example.com/reset-password", status="indexed",
                chunks=3, bytes=1240, error="",
                content="1. Go to login page. 2. Click 'Forgot Password'. 3. Enter email.",
                created_at=now_ts - dt.timedelta(days=25)
            ),
            KbDocument(
                id=uid("kd"), tenant_id=ten_default_id, kb_id=kb_support.id,
                title="Billing FAQ", source="internal",
                uri="https://docs.example.com/billing-faq", status="indexed",
                chunks=5, bytes=2140, error="",
                content="Q: When am I billed? A: Monthly on billing date.",
                created_at=now_ts - dt.timedelta(days=20)
            ),
            KbDocument(
                id=uid("kd"), tenant_id=ten_default_id, kb_id=kb_support.id,
                title="API Documentation", source="external",
                uri="https://api.example.com/docs", status="indexed",
                chunks=12, bytes=5600, error="",
                content="Base URL: https://api.example.com. Endpoints: /orders, /customers",
                created_at=now_ts - dt.timedelta(days=15)
            ),
            KbDocument(
                id=uid("kd"), tenant_id=ten_acme_id, kb_id=kb_acme.id,
                title="ACME Product Guide", source="internal",
                uri="https://acme.example.com/guide", status="indexed",
                chunks=8, bytes=3200, error="",
                content="ACME product includes modules A, B, C.",
                created_at=now_ts - dt.timedelta(days=10)
            ),
        ])
        s.flush()

        # Reports
        s.add_all([
            Report(
                id=uid("rp"), tenant_id=ten_default_id,
                name="Daily Call Summary", kind="calls", window="24h",
                filters={"status": "complete", "outcome": "resolved"},
                schedule="0 9 * * *", recipients=["owner@default-demo.com"],
                last_run_at=now_ts - dt.timedelta(hours=3),
                created_at=now_ts - dt.timedelta(days=5)
            ),
            Report(
                id=uid("rp"), tenant_id=ten_default_id,
                name="Revenue Report", kind="finance", window="30d",
                filters={"region": "all"}, schedule="0 0 * * 0",
                recipients=["owner@default-demo.com", "operator@default-demo.com"],
                last_run_at=now_ts - dt.timedelta(days=1),
                created_at=now_ts - dt.timedelta(days=30)
            ),
        ])
        s.flush()

        # Notes
        s.add_all([
            Note(
                id=uid("nt"), tenant_id=ten_default_id,
                title="Deployment Checklist", category="runbook",
                body="1. Run migrations\n2. Seed data\n3. Test endpoints",
                pinned=True, updated_at=now_ts
            ),
            Note(
                id=uid("nt"), tenant_id=ten_default_id,
                title="Known Issues", category="guide",
                body="- Session timeout needs tuning\n- Recording format not universal",
                pinned=True, updated_at=now_ts - dt.timedelta(hours=1)
            ),
            Note(
                id=uid("nt"), tenant_id=ten_default_id,
                title="API Migration Notes", category="note",
                body="Moving from REST v1 to v2. Schema changes in /users and /sessions.",
                pinned=False, updated_at=now_ts - dt.timedelta(days=2)
            ),
            Note(
                id=uid("nt"), tenant_id=ten_acme_id,
                title="ACME Integration Status", category="runbook",
                body="Phase 1: Webhook delivery ✓\nPhase 2: Auth flow (in progress)",
                pinned=True, updated_at=now_ts - dt.timedelta(hours=6)
            ),
        ])
        s.flush()

        # Tenant Settings
        s.add_all([
            TenantSetting(
                id=uid("ts"), tenant_id=ten_default_id, group="server",
                value={
                    "public_url": "https://demo.example.com",
                    "region": "us-east-1", "timezone": "America/New_York",
                    "max_concurrent_calls": 100, "call_timeout_s": 1800,
                    "maintenance_mode": False,
                }
            ),
            TenantSetting(
                id=uid("ts"), tenant_id=ten_default_id, group="email",
                value={
                    "smtp_host": "smtp.example.com", "smtp_port": 587,
                    "from_address": "noreply@example.com", "from_name": "Example Support",
                }
            ),
            TenantSetting(
                id=uid("ts"), tenant_id=ten_default_id, group="storage",
                value={
                    "backend": "local", "local_path": "/var/recordings",
                    "retention_days": 90,
                }
            ),
            TenantSetting(
                id=uid("ts"), tenant_id=ten_acme_id, group="server",
                value={
                    "public_url": "https://acme.example.com",
                    "region": "eu-west-1", "timezone": "Europe/London",
                    "max_concurrent_calls": 50, "call_timeout_s": 2400,
                    "maintenance_mode": False,
                }
            ),
        ])

        s.commit()
        print("✓ Demo data seeded successfully!")
        print(f"  Tenants: 2")
        print(f"  Users: 3")
        print(f"  Agents: 4")
        print(f"  Rooms: 5")
        print(f"  Chats: 3")
        print(f"  Recordings: 2")
        print(f"  Tools: 4")
        print(f"  Knowledge bases: 2 (with 4 documents)")
        print(f"  Reports: 2")
        print(f"  Notes: 4")
        print(f"  Settings groups: 4")

    except Exception as e:
        s.rollback()
        print(f"✗ Error seeding data: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        s.close()

if __name__ == "__main__":
    seed()
