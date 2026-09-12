import fakeredis.aioredis
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("APP_SECRET_KEY", "test-secret")
    monkeypatch.setenv("APP_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("APP_ADMIN_PASSWORD", "test-password")
    get_settings.cache_clear()
    application = create_app()
    # Swap the Redis client for fakeredis
    application.state.redis._client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield application
    get_settings.cache_clear()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def logged_in(client):
    login_page = await client.get("/login")
    token = _extract_csrf(login_page.text)
    resp = await client.post(
        "/login",
        data={"username": "admin", "password": "test-password", "csrf_token": token},
    )
    assert resp.status_code == 303
    return client


def _extract_csrf(html: str) -> str:
    marker = 'name="csrf_token" value="'
    start = html.index(marker) + len(marker)
    return html[start : html.index('"', start)]
