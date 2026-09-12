"""Call history service, calls pages, and webhook receiver tests."""
import time

from app.routes import webhooks
from app.services import call_service


async def test_call_lifecycle_and_indexes(app):
    store = app.state.redis
    call = await call_service.upsert_call(store, "test-bot-abc123", agent_id="bot-1", agent_name="Bot")
    assert call["status"] == "active"
    assert call["direction"] == "web"

    await call_service.add_participant(store, "test-bot-abc123", "tester-admin")
    await call_service.append_transcript(store, "test-bot-abc123", "user", "Hello?")
    await call_service.append_transcript(store, "test-bot-abc123", "assistant", "Hi there!")
    await call_service.end_call(store, "test-bot-abc123")

    call = await call_service.get_call(store, "test-bot-abc123")
    assert call["status"] == "ended"
    assert call["duration_seconds"] is not None
    assert "tester-admin" in call["participants"]

    transcript = await call_service.get_transcript(store, "test-bot-abc123")
    assert [t["role"] for t in transcript] == ["user", "assistant"]

    # indexes
    assert [c["id"] for c in await call_service.list_calls(store)] == ["test-bot-abc123"]
    assert [c["id"] for c in await call_service.list_calls(store, agent_id="bot-1")] == ["test-bot-abc123"]
    assert await call_service.list_calls(store, agent_id="other") == []
    assert [c["id"] for c in await call_service.list_calls(store, direction="web")] == ["test-bot-abc123"]
    today = time.strftime("%Y-%m-%d", time.gmtime())
    assert [c["id"] for c in await call_service.list_calls(store, date=today)] == ["test-bot-abc123"]

    stats = await call_service.call_stats_today(store)
    assert stats["total"] == 1
    assert stats["active"] == 0


async def test_sip_direction_detected(app):
    call = await call_service.upsert_call(app.state.redis, "sip-in-909099")
    assert call["direction"] == "sip"


async def test_calls_pages(app, logged_in):
    store = app.state.redis
    await call_service.upsert_call(store, "test-bot-def456", agent_name="Bot")
    await call_service.append_transcript(store, "test-bot-def456", "assistant", "Welcome!")

    resp = await logged_in.get("/calls")
    assert resp.status_code == 200
    assert "test-bot-def456" in resp.text

    resp = await logged_in.get("/calls/test-bot-def456")
    assert resp.status_code == 200
    assert "Welcome!" in resp.text

    resp = await logged_in.get("/calls/missing-000")
    assert resp.status_code == 404


async def test_calls_requires_login(client):
    resp = await client.get("/calls", follow_redirects=False)
    assert resp.status_code == 303


async def test_webhook_rejects_bad_signature(app, client, monkeypatch):
    class FakeReceiver:
        def receive(self, body, auth):
            raise ValueError("bad signature")

    monkeypatch.setattr(webhooks, "_receiver", lambda settings: FakeReceiver())
    resp = await client.post("/webhooks/livekit", content=b"{}", headers={"Authorization": "junk"})
    assert resp.status_code == 401


async def test_webhook_room_events_recorded(app, client, monkeypatch):
    class Obj:
        def __init__(self, **kw):
            self.__dict__.update(kw)

    events = iter(
        [
            Obj(event="room_started", room=Obj(name="test-bot-999999"), participant=None),
            Obj(event="participant_joined", room=Obj(name="test-bot-999999"), participant=Obj(identity="caller-1")),
            Obj(event="room_finished", room=Obj(name="test-bot-999999"), participant=None),
        ]
    )

    class FakeReceiver:
        def receive(self, body, auth):
            return next(events)

    monkeypatch.setattr(webhooks, "_receiver", lambda settings: FakeReceiver())
    for _ in range(3):
        resp = await client.post("/webhooks/livekit", content=b"{}", headers={"Authorization": "t"})
        assert resp.status_code == 200

    call = await call_service.get_call(app.state.redis, "test-bot-999999")
    assert call["status"] == "ended"
    assert "caller-1" in call["participants"]


async def test_webhook_unconfigured_503(app, client, monkeypatch):
    monkeypatch.setattr(webhooks, "_receiver", lambda settings: None)
    resp = await client.post("/webhooks/livekit", content=b"{}")
    assert resp.status_code == 503
