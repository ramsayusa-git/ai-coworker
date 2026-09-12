"""Agent CRUD, prompt history, and route auth tests."""
import pytest

from app.services import agent_service


def _extract_session_csrf(client):
    cookie = client.cookies.get("av_session")
    assert cookie
    return cookie


async def _create_via_form(client, csrf, name="Support Bot", prompt="Be helpful."):
    return await client.post(
        "/agents/new",
        data={
            "csrf_token": csrf,
            "name": name,
            "system_prompt": prompt,
            "greeting": "Hi!",
            "active": "on",
            "llm_provider": "openai",
            "llm_model": "gpt-4o-mini",
            "llm_temperature": "0.7",
            "stt_provider": "openai",
            "stt_model": "gpt-4o-mini-transcribe",
            "stt_language": "en",
            "tts_provider": "openai",
            "tts_model": "gpt-4o-mini-tts",
            "tts_voice": "alloy",
            "turn_mode": "vad",
            "vad_min_silence": "0.55",
            "vad_activation_threshold": "0.5",
            "allow_interruptions": "on",
        },
        follow_redirects=False,
    )


async def _session_csrf(app, client):
    manager = app.state.sessions
    session = manager.read_session(client.cookies.get("av_session"))
    return session["csrf"]


async def test_agents_requires_login(client):
    resp = await client.get("/agents", follow_redirects=False)
    assert resp.status_code == 303
    assert resp.headers["location"] == "/login"


async def test_agent_create_edit_delete_flow(app, logged_in):
    client = logged_in
    csrf = await _session_csrf(app, client)

    resp = await _create_via_form(client, csrf)
    assert resp.status_code == 303
    agent_url = resp.headers["location"]
    agent_id = agent_url.rsplit("/", 1)[-1]

    # list shows it
    resp = await client.get("/agents")
    assert "Support Bot" in resp.text

    # edit page renders
    resp = await client.get(agent_url)
    assert resp.status_code == 200
    assert "Be helpful." in resp.text

    # update prompt -> version bump + history entry
    resp = await client.post(
        agent_url,
        data={"csrf_token": csrf, "name": "Support Bot", "system_prompt": "Be VERY helpful.",
              "greeting": "Hi!", "active": "on",
              "llm_provider": "openai", "llm_model": "gpt-4o-mini", "llm_temperature": "0.5",
              "stt_provider": "openai", "stt_model": "gpt-4o-mini-transcribe", "stt_language": "en",
              "tts_provider": "openai", "tts_model": "gpt-4o-mini-tts", "tts_voice": "alloy",
              "turn_mode": "vad", "vad_min_silence": "0.6", "vad_activation_threshold": "0.5"},
        follow_redirects=False,
    )
    assert resp.status_code == 303

    agent = await agent_service.get_agent(app.state.redis, agent_id)
    assert agent.prompt_version == 2
    assert agent.system_prompt == "Be VERY helpful."
    assert agent.llm.temperature == 0.5
    assert agent.turn.allow_interruptions is False  # checkbox omitted

    history = await agent_service.prompt_history(app.state.redis, agent_id)
    assert [e["v"] for e in history] == [1, 2]

    # history page renders + restore v1
    resp = await client.get(f"/agents/{agent_id}/history")
    assert "Be VERY helpful." in resp.text
    resp = await client.post(
        f"/agents/{agent_id}/history/1/restore", data={"csrf_token": csrf}, follow_redirects=False
    )
    assert resp.status_code == 303
    agent = await agent_service.get_agent(app.state.redis, agent_id)
    assert agent.system_prompt == "Be helpful."
    assert agent.prompt_version == 3  # restore is a new version

    # delete
    resp = await client.post(f"/agents/{agent_id}/delete", data={"csrf_token": csrf}, follow_redirects=False)
    assert resp.status_code == 303
    with pytest.raises(agent_service.AgentNotFound):
        await agent_service.get_agent(app.state.redis, agent_id)


async def test_agent_new_form_renders(app, logged_in):
    resp = await logged_in.get("/agents/new")
    assert resp.status_code == 200
    assert "System prompt" in resp.text


async def test_agent_create_requires_csrf(app, logged_in):
    resp = await _create_via_form(logged_in, csrf="wrong-token")
    assert resp.status_code == 403


async def test_agent_create_validates_name(app, logged_in):
    csrf = await _session_csrf(app, logged_in)
    resp = await _create_via_form(logged_in, csrf, name="   ")
    assert resp.status_code == 400


async def test_agent_snapshot_written(app, logged_in, tmp_path, monkeypatch):
    monkeypatch.setattr(app.state.settings.__class__, "data_dir_path", property(lambda self: tmp_path), raising=False)
    csrf = await _session_csrf(app, logged_in)
    resp = await _create_via_form(logged_in, csrf, name="Snap Agent")
    assert resp.status_code == 303
    snapshot = tmp_path / "agents.json"
    assert snapshot.exists()
    assert "Snap Agent" in snapshot.read_text()
