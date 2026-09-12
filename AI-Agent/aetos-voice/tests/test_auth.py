from tests.conftest import _extract_csrf


async def test_dashboard_requires_login(client):
    resp = await client.get("/")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/login"


async def test_login_wrong_password(client):
    token = _extract_csrf((await client.get("/login")).text)
    resp = await client.post(
        "/login", data={"username": "admin", "password": "nope", "csrf_token": token}
    )
    assert resp.status_code == 401
    assert "Invalid username or password" in resp.text


async def test_login_missing_csrf(client):
    resp = await client.post("/login", data={"username": "admin", "password": "test-password"})
    assert resp.status_code == 403


async def test_login_success_and_dashboard(logged_in):
    resp = await logged_in.get("/")
    assert resp.status_code == 200
    assert "Dashboard" in resp.text
    assert "Signed in as" in resp.text


async def test_logout(logged_in):
    resp = await logged_in.post("/logout")
    assert resp.status_code == 303
    resp = await logged_in.get("/")
    assert resp.status_code == 303  # back to login


async def test_login_throttle(client):
    for _ in range(5):
        token = _extract_csrf((await client.get("/login")).text)
        await client.post(
            "/login", data={"username": "admin", "password": "bad", "csrf_token": token}
        )
    token = _extract_csrf((await client.get("/login")).text)
    resp = await client.post(
        "/login", data={"username": "admin", "password": "test-password", "csrf_token": token}
    )
    assert resp.status_code == 429
