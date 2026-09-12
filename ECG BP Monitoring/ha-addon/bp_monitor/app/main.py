"""BP Monitor — aiohttp server (Ingress) + sources + MQTT."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys

from aiohttp import web

from engine import Engine
from sources import BleSource, MqttSource, ReplaySource

env = os.environ.get
logging.basicConfig(level=getattr(logging, env("BP_LOG_LEVEL", "info").upper(), logging.INFO),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("main")

STATIC = os.path.join(os.path.dirname(__file__), "static")


def build_app(engine: Engine, ble: BleSource | None) -> web.Application:
    app = web.Application(client_max_size=1024 * 1024)

    async def index(request):
        return web.FileResponse(os.path.join(STATIC, "index.html"),
                                headers={"Cache-Control": "no-store"})

    async def status(request):
        return web.json_response(engine.snapshot())

    async def ws_handler(request):
        ws = web.WebSocketResponse(heartbeat=20)
        await ws.prepare(request)
        engine.clients.add(ws)
        await ws.send_str(json.dumps({"type": "status", "data": engine.snapshot()}))
        await ws.send_str(engine.history_message())
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT and msg.data == "ping":
                    await ws.send_str('{"type":"pong"}')
        finally:
            engine.clients.discard(ws)
        return ws

    def want_profile(request):
        """?profile=<id> scopes to one profile, ?profile=none to unassigned
        readings, ?profile=all (or absent) to everything."""
        v = request.query.get("profile")
        if v in (None, "", "all"):
            return None
        if v == "none":
            return "none"
        try:
            return int(v)
        except ValueError:
            return None

    async def history(request):
        limit = max(1, min(int(request.query.get("limit", 25)), 500))
        offset = max(0, int(request.query.get("offset", 0)))
        return web.json_response(
            engine.list_history(limit, offset, want_profile(request)))

    async def trend(request):
        days = max(1, min(int(request.query.get("days", 30)), 3650))
        return web.json_response({"days": days,
                                  "trend": engine.trend(days, want_profile(request))})

    async def stats(request):
        return web.json_response(engine.stats(want_profile(request)))

    async def history_csv(request):
        body = engine.store.csv(want_profile(request))
        return web.Response(body=body.encode(), headers={
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="bp_readings.csv"'})

    async def scan(request):
        """Run one more scan pass. The add-on scans once at start and then
        waits rather than looping — this is how the user asks for another."""
        if not ble:
            return web.json_response({"ok": False, "error": "no Bluetooth source"},
                                     status=400)
        ble.start()
        return web.json_response({"ok": True, "status": engine.snapshot()})

    # ---------------------------------------------------------- profiles
    async def profiles_list(request):
        return web.json_response({
            "profiles": engine.store.list_profiles(),
            "active": engine.store.active_profile(),
            "unassigned": engine.store.stats()["unassigned"]})

    async def profiles_add(request):
        try:
            body = await request.json()
        except Exception:
            raise web.HTTPBadRequest(reason="expected JSON")
        try:
            prof = engine.store.add_profile(body.get("name", ""),
                                            body.get("note", ""))
        except ValueError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
        engine._broadcast_history()
        return web.json_response({"ok": True, "profile": prof})

    async def profiles_update(request):
        pid = int(request.match_info["pid"])
        try:
            body = await request.json()
        except Exception:
            raise web.HTTPBadRequest(reason="expected JSON")
        try:
            ok = engine.store.update_profile(pid, body.get("name"), body.get("note"))
        except ValueError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
        engine._broadcast_history()
        return web.json_response({"ok": ok})

    async def profiles_delete(request):
        ok = engine.store.delete_profile(int(request.match_info["pid"]))
        engine._broadcast_history()
        return web.json_response({"ok": ok})

    async def profiles_select(request):
        raw = request.match_info["pid"]
        pid = None if raw in ("none", "0") else int(raw)
        ok = engine.store.set_active_profile(pid)
        engine._broadcast_status()
        engine._broadcast_history()
        return web.json_response({"ok": ok, "active": engine.store.active_profile()})

    # -------------------------------------------------------- calibration
    def cal_target(request):
        """Which calibration to act on: the named profile, or the global
        offsets used for unassigned readings."""
        v = request.query.get("profile")
        if v in (None, "", "active"):
            p = engine.store.active_profile()
            return p["id"] if p else None
        if v in ("none", "global"):
            return None
        try:
            return int(v)
        except ValueError:
            return None

    async def calibration_get(request):
        pid = cal_target(request)
        return web.json_response({"profile_id": pid,
                                  "calibration": engine.store.calibration(pid),
                                  "limit": engine.store.CAL_LIMIT})

    async def calibration_set(request):
        """Absolute offsets: {"systolic": -5, "diastolic": -5, "pulse": 0}.
        The +/- buttons in the dashboard send the new absolute value, so a
        double-tap can never double-apply."""
        pid = cal_target(request)
        try:
            body = await request.json()
        except Exception:
            raise web.HTTPBadRequest(reason="expected JSON")
        cal = engine.store.set_calibration(pid, body or {})
        engine._broadcast_status()
        engine._broadcast_history()
        return web.json_response({"ok": True, "profile_id": pid, "calibration": cal})

    async def calibration_reset(request):
        pid = cal_target(request)
        cal = engine.store.set_calibration(
            pid, {k: 0 for k in engine.store.CAL_KEYS})
        engine._broadcast_status()
        engine._broadcast_history()
        return web.json_response({"ok": True, "profile_id": pid, "calibration": cal})

    async def reading_assign(request):
        rid = int(request.match_info["rid"])
        try:
            body = await request.json()
        except Exception:
            body = {}
        raw = body.get("profile_id")
        pid = None if raw in (None, "", "none", 0, "0") else int(raw)
        ok = engine.store.assign_reading(rid, pid)
        engine._broadcast_history()
        return web.json_response({"ok": ok})

    async def history_delete(request):
        try:
            rid = int(request.match_info["rid"])
        except ValueError:
            raise web.HTTPNotFound()
        ok = engine.store.delete_reading(rid)
        if ok:
            engine._broadcast_history()
        return web.json_response({"ok": ok})

    app.router.add_get("/", index)
    app.router.add_get("/index.html", index)
    app.router.add_get("/api/status", status)
    app.router.add_get("/api/ws", ws_handler)
    app.router.add_get("/api/history", history)
    app.router.add_get("/api/history.csv", history_csv)
    app.router.add_delete("/api/history/{rid}", history_delete)
    app.router.add_post("/api/history/{rid}/profile", reading_assign)
    app.router.add_get("/api/trend", trend)
    app.router.add_get("/api/stats", stats)
    app.router.add_post("/api/scan", scan)
    app.router.add_get("/api/profiles", profiles_list)
    app.router.add_post("/api/profiles", profiles_add)
    app.router.add_post("/api/profiles/{pid}", profiles_update)
    app.router.add_delete("/api/profiles/{pid}", profiles_delete)
    app.router.add_post("/api/profiles/{pid}/select", profiles_select)
    app.router.add_get("/api/calibration", calibration_get)
    app.router.add_post("/api/calibration", calibration_set)
    app.router.add_post("/api/calibration/reset", calibration_reset)
    app.router.add_static("/static/", STATIC)
    return app


async def main():
    loop = asyncio.get_running_loop()
    data_dir = env("BP_DATA_DIR", "/share/bp_monitor")
    engine = Engine(data_dir, loop=loop)
    source = env("BP_SOURCE", "ble")
    tasks = [asyncio.create_task(engine.broadcaster())]
    ble = None

    mq = None
    if env("BP_MQTT_HOST"):
        try:
            from hamqtt import HaMqtt
            mq = HaMqtt(engine, env("BP_MQTT_HOST"), env("BP_MQTT_PORT", "1883"),
                        env("BP_MQTT_USER", ""), env("BP_MQTT_PASSWORD", ""),
                        env("BP_DISCOVERY_PREFIX", "homeassistant"), env("BP_DEVICE_ADDRESS", ""))
            if source in ("auto", "mqtt"):
                MqttSource(engine, mq.client, env("BP_MQTT_RAW_TOPIC", "bp/raw")).attach(mq)
            mq.start()
        except Exception:
            log.exception("MQTT setup failed — continuing without HA entities")
            mq = None
    else:
        log.warning("No MQTT broker configured: HA entities and MQTT bridge source are disabled")

    if source == "replay":
        tasks.append(asyncio.create_task(ReplaySource(engine, []).run()))
    elif source in ("auto", "ble"):
        ble = BleSource(engine, env("BP_DEVICE_ADDRESS", "88:1B:99:10:44:D8"),
                        env("BP_DEVICE_NAME", "RBP"), int(env("BP_SCAN_TIMEOUT", "30")))
        tasks.append(asyncio.create_task(ble.run()))
    else:
        engine.set_step("mqtt_wait")

    app = build_app(engine, ble)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    port = int(env("BP_HTTP_PORT", "8100"))
    await web.TCPSite(runner, "0.0.0.0", port).start()
    log.info("HTTP/Ingress listening on :%d", port)
    try:
        await asyncio.gather(*tasks)
    finally:
        await runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
