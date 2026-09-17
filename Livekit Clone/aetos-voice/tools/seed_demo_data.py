#!/usr/bin/env python3
"""
Seed demo data into Lattice Net SQLite database.
Populates realistic demo fixtures for all 32 console screens.

Usage:
  python tools/seed_demo_data.py
"""
import sys
import os
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from aetos_core.db import (
    Session, engine, Base, now, uid,
    Tenant, User, Membership, Agent, Room, ChatSession, Recording,
    Tool, KnowledgeBase, KbDocument, Report, Note, TenantSetting,
)
from aetos_core.auth import hash_password
import datetime as dt
import json

def seed_db():
    """Populate database with demo data."""
    s = Session()
    try:
        # Clear existing demo data (preserve prod)
        for table in [
            Recording, Note, Report, KbDocument, KnowledgeBase, Tool,
            ChatSession, Room, Agent, TenantSetting,
            Membership, User, Tenant
        ]:
            s.query(table).delete()
        s.commit()

        # ============================================================ tenants
        tenant_default = Tenant(
            id="ten_default",
            slug="default-demo",
            name="Default Demo Tenant",
            status="active",
            is_platform=False,
        )
        tenant_acme = Tenant(
            id="ten_acme",
            slug="acme-demo",
            name="ACME Corp",
            status="active",
            is_platform=False,
        )
        s.add_all([tenant_default, tenant_acme])
        s.commit()

        # ============================================================= users
        user_owner_default = User(
            id="usr_owner_default",
            email="owner@default-demo.com",
            password_hash=hash_password("demo123"),
            name="Demo Owner (Default)",
            status="active",
        )
        user_op_default = User(
            id="usr_op_default",
            email="operator@default-demo.com",
            password_hash=hash_password("demo123"),
            name="Demo Operator (Default)",
            status="active",
        )
        user_owner_acme = User(
            id="usr_owner_acme",
            email="owner@acme-demo.com",
            password_hash=hash_password("demo123"),
            name="Demo Owner (ACME)",
            status="active",
        )
        s.add_all([user_owner_default, user_op_default, user_owner_acme])
        s.commit()

        # ========================================================== memberships
        Membership(tenant_id="ten_default", user_id="usr_owner_default", role="owner"),
        Membership(tenant_id="ten_default", user_id="usr_op_default", role="operator"),
        Membership(tenant_id="ten_acme", user_id="usr_owner_acme", role="owner"),
        s.add_all([
            Membership(tenant_id="ten_default", user_id="usr_owner_default", role="owner"),
            Membership(tenant_id="ten_default", user_id="usr_op_default", role="operator"),
            Membership(tenant_id="ten_acme", user_id="usr_owner_acme", role="owner"),
        ])
        s.commit()

        # ============================================================ agents
        now_ts = now()
        agents = [
            Agent(
                tenant_id="ten_default",
                name="Support Bot",
                kind="voice",
                status="online",
                prompt="You are a helpful support agent. Answer customer questions clearly.",
                pipeline={"type": "llm", "model": "gpt-4"},
                tools=[],
                updated_at=now_ts,
            ),
            Agent(
                tenant_id="ten_default",
                name="Sales Chat",
                kind="chat",
                status="online",
                prompt="You are a sales assistant. Help customers with product info.",
                pipeline={"type": "llm", "model": "gpt-3.5-turbo"},
                tools=[],
                updated_at=now_ts,
            ),
            Agent(
                tenant_id="ten_default",
                name="Billing Bot",
                kind="voice",
                status="paused",
                prompt="You handle billing inquiries and invoice questions.",
                pipeline={"type": "llm", "model": "gpt-4"},
                tools=[],
                updated_at=now_ts,
            ),
            Agent(
                tenant_id="ten_acme",
                name="ACME Support",
                kind="voice",
                status="online",
                prompt="ACME Corp customer support specialist.",
                pipeline={"type": "llm", "model": "gpt-4"},
                tools=[],
                updated_at=now_ts,
            ),
        ]
        s.add_all(agents)
        s.commit()

        agent_ids = {a.name: a.id for a in agents}

        # ============================================================== rooms
        rooms = [
            Room(
                tenant_id="ten_default",
                name="support-queue",
                kind="voice",
                status="idle",
                agent_id=agent_ids.get("Support Bot"),
                max_participants=8,
                empty_timeout_s=300,
                participants=[],
                metadata_json={"department": "support"},
                created_at=now_ts,
                last_active_at=now_ts - dt.timedelta(hours=2),
            ),
            Room(
                tenant_id="ten_default",
                name="sales-collaboration",
                kind="video",
                status="live",
                agent_id=agent_ids.get("Sales Chat"),
                max_participants=4,
                empty_timeout_s=600,
                participants=[
                    {"identity": "visitor-001", "role": "guest", "joined_at": (now_ts - dt.timedelta(minutes=15)).isoformat()},
                    {"identity": "agent-sales", "role": "agent", "joined_at": (now_ts - dt.timedelta(minutes=15)).isoformat()},
                ],
                metadata_json={"department": "sales"},
                created_at=now_ts - dt.timedelta(hours=1),
                last_active_at=now_ts,
            ),
            Room(
                tenant_id="ten_default",
                name="billing-callback",
                kind="voice",
                status="closed",
                agent_id=agent_ids.get("Billing Bot"),
                max_participants=2,
                empty_timeout_s=60,
                participants=[],
                metadata_json={"department": "billing"},
                created_at=now_ts - dt.timedelta(days=1),
                last_active_at=now_ts - dt.timedelta(hours=20),
            ),
            Room(
                tenant_id="ten_acme",
                name="acme-main",
                kind="voice",
                status="idle",
                agent_id=agent_ids.get("ACME Support"),
                max_participants=8,
                empty_timeout_s=300,
                participants=[],
                metadata_json={"department": "support", "region": "us-east"},
                created_at=now_ts - dt.timedelta(hours=3),
                last_active_at=now_ts - dt.timedelta(hours=1),
            ),
            Room(
                tenant_id="ten_default",
                name="test-room",
                kind="data",
                status="idle",
                agent_id=None,
                max_participants=16,
                empty_timeout_s=300,
                participants=[],
                metadata_json={},
                created_at=now_ts,
                last_active_at=None,
            ),
        ]
        s.add_all(rooms)
        s.commit()

        # ========================================================== chat sessions
        chats = [
            ChatSession(
                tenant_id="ten_default",
                agent_id=agent_ids.get("Sales Chat"),
                channel="web",
                visitor="visitor-alice@example.com",
                status="closed",
                started_at=now_ts - dt.timedelta(hours=5),
                ended_at=now_ts - dt.timedelta(hours=4, minutes=30),
                message_count=12,
                tokens_in=340,
                tokens_out=280,
                cost=0.0024,
                summary="Customer inquired about Premium plan pricing and features.",
                messages=[
                    {"who": "visitor", "text": "Hi, interested in Premium plan", "ts": 1694000000},
                    {"who": "agent", "text": "Great! Premium offers unlimited users and 24/7 support.", "ts": 1694000005},
                ],
            ),
            ChatSession(
                tenant_id="ten_default",
                agent_id=agent_ids.get("Support Bot"),
                channel="slack",
                visitor="user-bob",
                status="open",
                started_at=now_ts - dt.timedelta(hours=1),
                ended_at=None,
                message_count=5,
                tokens_in=120,
                tokens_out=95,
                cost=0.0008,
                summary="",
                messages=[],
            ),
            ChatSession(
                tenant_id="ten_acme",
                agent_id=agent_ids.get("ACME Support"),
                channel="web",
                visitor="acme-cust-42",
                status="closed",
                started_at=now_ts - dt.timedelta(days=1, hours=3),
                ended_at=now_ts - dt.timedelta(days=1, hours=2),
                message_count=8,
                tokens_in=210,
                tokens_out=185,
                cost=0.0019,
                summary="Setup issue with API integration resolved.",
                messages=[],
            ),
        ]
        s.add_all(chats)
        s.commit()

        # ========================================================== recordings
        recordings = [
            Recording(
                tenant_id="ten_default",
                session_id=None,
                room_id=rooms[0].id if rooms else None,
                kind="audio",
                status="complete",
                destination="local",
                path="/recordings/room-support-queue-2026-09-17-14:30:00.wav",
                size_bytes=2847621,
                duration_s=315,
                error="",
                started_at=now_ts - dt.timedelta(hours=2),
                finished_at=now_ts - dt.timedelta(hours=2) + dt.timedelta(seconds=315),
            ),
            Recording(
                tenant_id="ten_default",
                session_id=None,
                room_id=None,
                kind="video",
                status="failed",
                destination="s3",
                path="",
                size_bytes=0,
                duration_s=0,
                error="Recording codec not supported by destination",
                started_at=now_ts - dt.timedelta(hours=6),
                finished_at=now_ts - dt.timedelta(hours=6) + dt.timedelta(seconds=60),
            ),
        ]
        s.add_all(recordings)
        s.commit()

        # ============================================================== tools
        tools = [
            Tool(
                tenant_id="ten_default",
                name="Get Order Status",
                kind="http",
                description="Lookup order status by order ID",
                enabled=True,
                method="GET",
                url="https://api.example.com/orders/{order_id}",
                headers={"Authorization": "Bearer ***"},
                parameters={"order_id": {"type": "string", "required": True}},
                timeout_s=5,
                updated_at=now_ts,
            ),
            Tool(
                tenant_id="ten_default",
                name="Create Ticket",
                kind="http",
                description="Create a support ticket",
                enabled=True,
                method="POST",
                url="https://api.example.com/tickets",
                headers={"Content-Type": "application/json"},
                parameters={"subject": {"type": "string"}, "description": {"type": "string"}},
                timeout_s=10,
                updated_at=now_ts,
            ),
            Tool(
                tenant_id="ten_default",
                name="Python Eval",
                kind="builtin",
                description="Evaluate Python expressions",
                enabled=False,
                method="",
                url="",
                headers={},
                parameters={},
                timeout_s=30,
                updated_at=now_ts,
            ),
            Tool(
                tenant_id="ten_acme",
                name="ACME API",
                kind="http",
                description="ACME Corp internal API",
                enabled=True,
                method="GET",
                url="https://acme-internal.example.com/api/v1",
                headers={"Authorization": "Bearer acme-key"},
                parameters={},
                timeout_s=5,
                updated_at=now_ts,
            ),
        ]
        s.add_all(tools)
        s.commit()

        # ================================================= knowledge bases
        kbs = [
            KnowledgeBase(
                tenant_id="ten_default",
                name="Support Articles",
                description="Common support questions and troubleshooting",
                embedding_model="openai/text-embedding-3-small",
                chunk_size=512,
                chunk_overlap=100,
                doc_count=5,
                created_at=now_ts - dt.timedelta(days=30),
            ),
            KnowledgeBase(
                tenant_id="ten_acme",
                name="ACME Docs",
                description="ACME Corp product documentation",
                embedding_model="openai/text-embedding-3-large",
                chunk_size=1024,
                chunk_overlap=200,
                doc_count=3,
                created_at=now_ts - dt.timedelta(days=14),
            ),
        ]
        s.add_all(kbs)
        s.commit()

        # ================================================= kb documents
        kb_id_support = kbs[0].id if kbs else None
        kb_id_acme = kbs[1].id if kbs else None

        docs = [
            KbDocument(
                tenant_id="ten_default",
                kb_id=kb_id_support,
                title="How to Reset Password",
                source="internal",
                uri="https://docs.example.com/reset-password",
                status="indexed",
                chunks=3,
                bytes=1240,
                error="",
                content="1. Go to login page. 2. Click 'Forgot Password'. 3. Enter email. 4. Follow reset link in email.",
                created_at=now_ts - dt.timedelta(days=25),
            ),
            KbDocument(
                tenant_id="ten_default",
                kb_id=kb_id_support,
                title="Billing FAQ",
                source="internal",
                uri="https://docs.example.com/billing-faq",
                status="indexed",
                chunks=5,
                bytes=2140,
                error="",
                content="Q: When am I billed? A: Monthly on billing date. Q: Can I change plans? A: Yes, anytime.",
                created_at=now_ts - dt.timedelta(days=20),
            ),
            KbDocument(
                tenant_id="ten_default",
                kb_id=kb_id_support,
                title="API Documentation",
                source="external",
                uri="https://api.example.com/docs",
                status="indexed",
                chunks=12,
                bytes=5600,
                error="",
                content="Base URL: https://api.example.com. Auth: Bearer token. Endpoints: /orders, /customers, /tickets",
                created_at=now_ts - dt.timedelta(days=15),
            ),
            KbDocument(
                tenant_id="ten_acme",
                kb_id=kb_id_acme,
                title="ACME Product Guide",
                source="internal",
                uri="https://acme.example.com/guide",
                status="indexed",
                chunks=8,
                bytes=3200,
                error="",
                content="ACME product includes modules A, B, C. Module A: reporting. Module B: analytics. Module C: integrations.",
                created_at=now_ts - dt.timedelta(days=10),
            ),
        ]
        s.add_all(docs)
        s.commit()

        # ============================================================ reports
        reports = [
            Report(
                tenant_id="ten_default",
                name="Daily Call Summary",
                kind="calls",
                window="24h",
                filters={"status": "complete", "outcome": "resolved"},
                schedule="0 9 * * *",
                recipients=["owner@default-demo.com"],
                last_run_at=now_ts - dt.timedelta(hours=3),
                created_at=now_ts - dt.timedelta(days=5),
            ),
            Report(
                tenant_id="ten_default",
                name="Revenue Report",
                kind="finance",
                window="30d",
                filters={"region": "all"},
                schedule="0 0 * * 0",
                recipients=["owner@default-demo.com", "operator@default-demo.com"],
                last_run_at=now_ts - dt.timedelta(days=1),
                created_at=now_ts - dt.timedelta(days=30),
            ),
        ]
        s.add_all(reports)
        s.commit()

        # ============================================================== notes
        notes = [
            Note(
                tenant_id="ten_default",
                title="Deployment Checklist",
                category="runbook",
                body="1. Run migrations\n2. Seed data\n3. Test endpoints\n4. Deploy to prod",
                pinned=True,
                updated_at=now_ts,
            ),
            Note(
                tenant_id="ten_default",
                title="Known Issues",
                category="guide",
                body="- Session timeout needs tuning\n- Recording format not universal\n- KB embedding latency high",
                pinned=True,
                updated_at=now_ts - dt.timedelta(hours=1),
            ),
            Note(
                tenant_id="ten_default",
                title="API Migration Notes",
                category="note",
                body="Moving from REST v1 to v2. Schema changes in /users and /sessions endpoints.",
                pinned=False,
                updated_at=now_ts - dt.timedelta(days=2),
            ),
            Note(
                tenant_id="ten_acme",
                title="ACME Integration Status",
                category="runbook",
                body="Phase 1: Webhook delivery ✓\nPhase 2: Auth flow (in progress)\nPhase 3: Custom branding (planned)",
                pinned=True,
                updated_at=now_ts - dt.timedelta(hours=6),
            ),
        ]
        s.add_all(notes)
        s.commit()

        # ====================================================== tenant settings
        settings = [
            TenantSetting(
                tenant_id="ten_default",
                group="server",
                value={
                    "public_url": "https://demo.example.com",
                    "region": "us-east-1",
                    "timezone": "America/New_York",
                    "max_concurrent_calls": 100,
                    "call_timeout_s": 1800,
                    "maintenance_mode": False,
                },
            ),
            TenantSetting(
                tenant_id="ten_default",
                group="email",
                value={
                    "smtp_host": "smtp.example.com",
                    "smtp_port": 587,
                    "from_address": "noreply@example.com",
                    "from_name": "Example Support",
                },
            ),
            TenantSetting(
                tenant_id="ten_default",
                group="storage",
                value={
                    "backend": "local",
                    "local_path": "/var/recordings",
                    "retention_days": 90,
                },
            ),
            TenantSetting(
                tenant_id="ten_acme",
                group="server",
                value={
                    "public_url": "https://acme.example.com",
                    "region": "eu-west-1",
                    "timezone": "Europe/London",
                    "max_concurrent_calls": 50,
                    "call_timeout_s": 2400,
                    "maintenance_mode": False,
                },
            ),
        ]
        s.add_all(settings)
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
    seed_db()
