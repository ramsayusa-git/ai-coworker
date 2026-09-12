async def test_healthz_open_and_reports_redis(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["redis"]["connected"] is True
    assert body["version"]
    assert "disk" in body["host"]
