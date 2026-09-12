"""Rooms overview + test-call token endpoint (LiveKit mocked)."""
from app.services import agent_service, livekit_service
from app.services.livekit_service import RoomsOverview


async def _session_csrf(app, client):
    manager = app.state.sessions
    return manager.read_session(client.cookies.get("av_session"))["csrf"]


async def test_rooms_requires_login(client):
    resp = await client.get("/rooms", follow_redirects=False)
    assert resp.status_code == 303


async def test_rooms_offline_renders(app, logged_in, monkeypatch):
    async def fake_overview(settings):
        return RoomsOverview(available=False, error="LiveKit server unreachable: TestError")

    monkeypatch.setattr(livekit_service, "rooms_overview", fake_overview)
    resp = await logged_in.get("/rooms")
    assert resp.status_code == 200
    assert "Offline" in resp.text


async def test_rooms_lists_active_rooms(app, logged_in, monkeypatch):
    async def fake_overview(settings):
        return RoomsOverview(
            available=True,
            rooms=[{
                "name": "test-bot-abc123", "num_participants": 2, "created_at": 0,
                "age_seconds": 65,
                "participants": [
                    {"identity": "tester-admin", "name": "", "is_agent": False},
                    {"identity": "agent-worker", "name": "", "is_agent": True},
                ],
            }],
        )

    monkeypatch.setattr(livekit_service, "rooms_overview", fake_overview)
    resp = await logged_in.get("/rooms")
    assert "test-bot-abc123" in resp.text
    assert "agent-worker (agent)" in resp.text


async def test_token_endpoint(app, logged_in, monkeypatch):
    agent = await agent_service.create_agent(app.state.redis, {"name": "Token Bot"})
    csrf = await _session_csrf(app, logged_in)

    monkeypatch.setattr(livekit_service, "configured", lambda settings: True)
    monkeypatch.setattr(
        livekit_service, "build_join_token",
        lambda settings, room, identity, name=None: f"jwt-for-{room}-{identity}",
    )
    resp = await logged_in.post(
        "/test-call/token", data={"agent_id": agent.id, "csrf_token": csrf}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["room"].startswith(f"test-{agent.id}-")
    assert data["token"] == f"jwt-for-{data['room']}-tester-admin"
    assert data["agent"] == "Token Bot"


async def test_token_endpoint_unknown_agent(app, logged_in, monkeypatch):
    monkeypatch.setattr(livekit_service, "configured", lambda settings: True)
    csrf = await _session_csrf(app, logged_in)
    resp = await logged_in.post(
        "/test-call/token", data={"agent_id": "nope-000", "csrf_token": csrf}
    )
    assert resp.status_code == 404


async def test_token_endpoint_requires_csrf(app, logged_in, monkeypatch):
    monkeypatch.setattr(livekit_service, "configured", lambda settings: True)
    resp = await logged_in.post(
        "/test-call/token", data={"agent_id": "x-000", "csrf_token": "bad"}
    )
    assert resp.status_code == 403


async def test_testcall_page_unconfigured_warns(app, logged_in, monkeypatch):
    monkeypatch.setattr(livekit_service, "configured", lambda settings: False)
    resp = await logged_in.get("/test-call")
    assert resp.status_code == 200
    assert "not configured" in resp.text
