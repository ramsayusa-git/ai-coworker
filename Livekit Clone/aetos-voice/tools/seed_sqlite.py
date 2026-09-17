#!/usr/bin/env python3
"""
Seed demo data directly into SQLite (bypasses SQLAlchemy version issues).
"""
import sqlite3
import uuid
import datetime as dt
import json
import sys
from pathlib import Path

# SQLite db path
DB_PATH = Path(__file__).parent.parent / "core" / "aetos.db"

def uid(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:10]}"

def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def seed_sqlite():
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    
    try:
        # Clear demo data
        c.execute("DELETE FROM tenants")
        c.execute("DELETE FROM users")
        c.execute("DELETE FROM memberships")
        c.execute("DELETE FROM agents")
        c.execute("DELETE FROM rooms")
        c.execute("DELETE FROM chat_sessions")
        c.execute("DELETE FROM recordings")
        c.execute("DELETE FROM tools")
        c.execute("DELETE FROM knowledge_bases")
        c.execute("DELETE FROM kb_documents")
        c.execute("DELETE FROM reports")
        c.execute("DELETE FROM notes")
        c.execute("DELETE FROM tenant_settings")
        conn.commit()

        now_str = now_iso()

        # Tenants
        ten_default_id = uid("ten")
        ten_acme_id = uid("ten")
        c.executemany("""
            INSERT INTO tenants (id, slug, name, status, is_platform, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            (ten_default_id, "default-demo", "Default Demo Tenant", "active", 0, now_str, now_str),
            (ten_acme_id, "acme-demo", "ACME Corp", "active", 0, now_str, now_str),
        ])

        # Users
        usr_owner_default = uid("usr")
        usr_op_default = uid("usr")
        usr_owner_acme = uid("usr")
        
        # Note: Using placeholder hashes; in real use, hash_password("demo123")
        c.executemany("""
            INSERT INTO users (id, email, password_hash, name, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            (usr_owner_default, "owner@default-demo.com", "hashed_pass_123", "Demo Owner (Default)", "active", now_str, now_str),
            (usr_op_default, "operator@default-demo.com", "hashed_pass_123", "Demo Operator (Default)", "active", now_str, now_str),
            (usr_owner_acme, "owner@acme-demo.com", "hashed_pass_123", "Demo Owner (ACME)", "active", now_str, now_str),
        ])

        # Memberships
        c.executemany("""
            INSERT INTO memberships (id, tenant_id, user_id, role, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, [
            (uid("mem"), ten_default_id, usr_owner_default, "owner", now_str),
            (uid("mem"), ten_default_id, usr_op_default, "operator", now_str),
            (uid("mem"), ten_acme_id, usr_owner_acme, "owner", now_str),
        ])

        # Agents
        agent_support = uid("agt")
        agent_sales = uid("agt")
        agent_billing = uid("agt")
        agent_acme = uid("agt")

        c.executemany("""
            INSERT INTO agents (id, tenant_id, name, kind, status, prompt, pipeline, tools, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (agent_support, ten_default_id, "Support Bot", "voice", "online",
             "You are a helpful support agent. Answer customer questions clearly.",
             json.dumps({"type": "llm", "model": "gpt-4"}), json.dumps([]), now_str),
            (agent_sales, ten_default_id, "Sales Chat", "chat", "online",
             "You are a sales assistant. Help customers with product info.",
             json.dumps({"type": "llm", "model": "gpt-3.5-turbo"}), json.dumps([]), now_str),
            (agent_billing, ten_default_id, "Billing Bot", "voice", "paused",
             "You handle billing inquiries and invoice questions.",
             json.dumps({"type": "llm", "model": "gpt-4"}), json.dumps([]), now_str),
            (agent_acme, ten_acme_id, "ACME Support", "voice", "online",
             "ACME Corp customer support specialist.",
             json.dumps({"type": "llm", "model": "gpt-4"}), json.dumps([]), now_str),
        ])

        # Rooms
        room_support_id = uid("rm")
        room_sales_id = uid("rm")
        room_billing_id = uid("rm")
        room_acme_id = uid("rm")
        room_test_id = uid("rm")

        c.executemany("""
            INSERT INTO rooms (id, tenant_id, name, kind, status, agent_id, max_participants,
                               empty_timeout_s, participants, metadata_json, created_at, last_active_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (room_support_id, ten_default_id, "support-queue", "voice", "idle", agent_support, 8, 300,
             json.dumps([]), json.dumps({"department": "support"}), now_str, 
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)).isoformat()),
            (room_sales_id, ten_default_id, "sales-collaboration", "video", "live", agent_sales, 4, 600,
             json.dumps([{"identity": "visitor-001", "role": "guest"}, {"identity": "agent-sales", "role": "agent"}]),
             json.dumps({"department": "sales"}), (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)).isoformat(), now_str),
            (room_billing_id, ten_default_id, "billing-callback", "voice", "closed", agent_billing, 2, 60,
             json.dumps([]), json.dumps({"department": "billing"}),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1)).isoformat(),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=20)).isoformat()),
            (room_acme_id, ten_acme_id, "acme-main", "voice", "idle", agent_acme, 8, 300,
             json.dumps([]), json.dumps({"department": "support", "region": "us-east"}),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).isoformat(),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)).isoformat()),
            (room_test_id, ten_default_id, "test-room", "data", "idle", None, 16, 300,
             json.dumps([]), json.dumps({}), now_str, None),
        ])

        # Chat Sessions
        chat1_id = uid("ch")
        chat2_id = uid("ch")
        chat3_id = uid("ch")

        c.executemany("""
            INSERT INTO chat_sessions (id, tenant_id, agent_id, channel, visitor, status,
                                       started_at, ended_at, message_count, tokens_in, tokens_out,
                                       cost, summary, messages)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (chat1_id, ten_default_id, agent_sales, "web", "visitor-alice@example.com", "closed",
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=5)).isoformat(),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=4, minutes=30)).isoformat(),
             12, 340, 280, 0.0024, "Customer inquired about Premium plan pricing and features.",
             json.dumps([{"who": "visitor", "text": "Hi, interested in Premium plan", "ts": 1694000000}])),
            (chat2_id, ten_default_id, agent_support, "slack", "user-bob", "open",
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)).isoformat(), None,
             5, 120, 95, 0.0008, "", json.dumps([])),
            (chat3_id, ten_acme_id, agent_acme, "web", "acme-cust-42", "closed",
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1, hours=3)).isoformat(),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1, hours=2)).isoformat(),
             8, 210, 185, 0.0019, "Setup issue with API integration resolved.", json.dumps([])),
        ])

        # Recordings
        c.executemany("""
            INSERT INTO recordings (id, tenant_id, session_id, room_id, kind, status, destination,
                                     path, size_bytes, duration_s, error, started_at, finished_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (uid("rec"), ten_default_id, None, room_support_id, "audio", "complete", "local",
             "/recordings/room-support-queue-2026-09-17-14:30:00.wav", 2847621, 315, "",
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)).isoformat(),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2) + dt.timedelta(seconds=315)).isoformat()),
            (uid("rec"), ten_default_id, None, None, "video", "failed", "s3",
             "", 0, 0, "Recording codec not supported by destination",
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=6)).isoformat(),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=6) + dt.timedelta(seconds=60)).isoformat()),
        ])

        # Tools
        c.executemany("""
            INSERT INTO tools (id, tenant_id, name, kind, description, enabled, method, url,
                              headers, parameters, timeout_s, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (uid("tl"), ten_default_id, "Get Order Status", "http", "Lookup order status by order ID", 1,
             "GET", "https://api.example.com/orders/{order_id}",
             json.dumps({"Authorization": "Bearer ***"}),
             json.dumps({"order_id": {"type": "string", "required": True}}), 5, now_str),
            (uid("tl"), ten_default_id, "Create Ticket", "http", "Create a support ticket", 1,
             "POST", "https://api.example.com/tickets",
             json.dumps({"Content-Type": "application/json"}),
             json.dumps({"subject": {"type": "string"}, "description": {"type": "string"}}), 10, now_str),
            (uid("tl"), ten_default_id, "Python Eval", "builtin", "Evaluate Python expressions", 0,
             "", "", json.dumps({}), json.dumps({}), 30, now_str),
            (uid("tl"), ten_acme_id, "ACME API", "http", "ACME Corp internal API", 1,
             "GET", "https://acme-internal.example.com/api/v1",
             json.dumps({"Authorization": "Bearer acme-key"}), json.dumps({}), 5, now_str),
        ])

        # Knowledge Bases
        kb_support_id = uid("kb")
        kb_acme_id = uid("kb")

        c.executemany("""
            INSERT INTO knowledge_bases (id, tenant_id, name, description, embedding_model,
                                        chunk_size, chunk_overlap, doc_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (kb_support_id, ten_default_id, "Support Articles", "Common support questions and troubleshooting",
             "openai/text-embedding-3-small", 512, 100, 3,
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()),
            (kb_acme_id, ten_acme_id, "ACME Docs", "ACME Corp product documentation",
             "openai/text-embedding-3-large", 1024, 200, 1,
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=14)).isoformat()),
        ])

        # KB Documents
        c.executemany("""
            INSERT INTO kb_documents (id, tenant_id, kb_id, title, source, uri, status,
                                      chunks, bytes, error, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (uid("kd"), ten_default_id, kb_support_id, "How to Reset Password", "internal",
             "https://docs.example.com/reset-password", "indexed", 3, 1240, "",
             "1. Go to login page. 2. Click 'Forgot Password'. 3. Enter email. 4. Follow reset link in email.",
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=25)).isoformat()),
            (uid("kd"), ten_default_id, kb_support_id, "Billing FAQ", "internal",
             "https://docs.example.com/billing-faq", "indexed", 5, 2140, "",
             "Q: When am I billed? A: Monthly on billing date. Q: Can I change plans? A: Yes, anytime.",
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=20)).isoformat()),
            (uid("kd"), ten_default_id, kb_support_id, "API Documentation", "external",
             "https://api.example.com/docs", "indexed", 12, 5600, "",
             "Base URL: https://api.example.com. Auth: Bearer token. Endpoints: /orders, /customers, /tickets",
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=15)).isoformat()),
            (uid("kd"), ten_acme_id, kb_acme_id, "ACME Product Guide", "internal",
             "https://acme.example.com/guide", "indexed", 8, 3200, "",
             "ACME product includes modules A, B, C. Module A: reporting. Module B: analytics. Module C: integrations.",
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=10)).isoformat()),
        ])

        # Reports
        c.executemany("""
            INSERT INTO reports (id, tenant_id, name, kind, window, filters, schedule,
                                recipients, last_run_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (uid("rp"), ten_default_id, "Daily Call Summary", "calls", "24h",
             json.dumps({"status": "complete", "outcome": "resolved"}), "0 9 * * *",
             json.dumps(["owner@default-demo.com"]),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).isoformat(),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=5)).isoformat()),
            (uid("rp"), ten_default_id, "Revenue Report", "finance", "30d",
             json.dumps({"region": "all"}), "0 0 * * 0",
             json.dumps(["owner@default-demo.com", "operator@default-demo.com"]),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1)).isoformat(),
             (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()),
        ])

        # Notes
        c.executemany("""
            INSERT INTO notes (id, tenant_id, title, category, body, pinned, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            (uid("nt"), ten_default_id, "Deployment Checklist", "runbook",
             "1. Run migrations\n2. Seed data\n3. Test endpoints\n4. Deploy to prod", 1, now_str),
            (uid("nt"), ten_default_id, "Known Issues", "guide",
             "- Session timeout needs tuning\n- Recording format not universal\n- KB embedding latency high",
             1, (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)).isoformat()),
            (uid("nt"), ten_default_id, "API Migration Notes", "note",
             "Moving from REST v1 to v2. Schema changes in /users and /sessions endpoints.",
             0, (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=2)).isoformat()),
            (uid("nt"), ten_acme_id, "ACME Integration Status", "runbook",
             "Phase 1: Webhook delivery ✓\nPhase 2: Auth flow (in progress)\nPhase 3: Custom branding (planned)",
             1, (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=6)).isoformat()),
        ])

        # Tenant Settings
        c.executemany("""
            INSERT INTO tenant_settings (id, tenant_id, group, value)
            VALUES (?, ?, ?, ?)
        """, [
            (uid("ts"), ten_default_id, "server",
             json.dumps({
                 "public_url": "https://demo.example.com",
                 "region": "us-east-1",
                 "timezone": "America/New_York",
                 "max_concurrent_calls": 100,
                 "call_timeout_s": 1800,
                 "maintenance_mode": False,
             })),
            (uid("ts"), ten_default_id, "email",
             json.dumps({
                 "smtp_host": "smtp.example.com",
                 "smtp_port": 587,
                 "from_address": "noreply@example.com",
                 "from_name": "Example Support",
             })),
            (uid("ts"), ten_default_id, "storage",
             json.dumps({
                 "backend": "local",
                 "local_path": "/var/recordings",
                 "retention_days": 90,
             })),
            (uid("ts"), ten_acme_id, "server",
             json.dumps({
                 "public_url": "https://acme.example.com",
                 "region": "eu-west-1",
                 "timezone": "Europe/London",
                 "max_concurrent_calls": 50,
                 "call_timeout_s": 2400,
                 "maintenance_mode": False,
             })),
        ])

        conn.commit()
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
        print(f"\nDatabase: {DB_PATH}")

    except Exception as e:
        conn.rollback()
        print(f"✗ Error seeding data: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    seed_sqlite()
