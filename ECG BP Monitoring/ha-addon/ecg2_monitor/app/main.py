"""ECG2 Monitor — aiohttp server (Ingress) + sources + MQTT.

The dashboard has no start / stop / reconnect controls: the Bluetooth source
runs and retries on its own, and every wear is recorded to the local SQLite
history automatically. The only write endpoints left are deletions of stored
history, which the history table offers per row.
"""
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
logging.basicConfig(level=getattr(logging, env("ECG_LOG_LEVEL", "info").upper(), logging.INFO),
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
        await ws.send_str(engine.db_message())
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT and msg.data == "ping":
                    await ws.send_str('{"type":"pong"}')
        finally:
            engine.clients.discard(ws)
        return ws

    def want_profile(request):
        """?profile=<id> scopes to one profile, ?profile=none to unassigned,
        ?profile=all (or absent) to everything."""
        v = request.query.get("profile")
        if v in (None, "", "all"):
            return None
        if v == "none":
            return "none"
        try:
            return int(v)
        except ValueError:
            return None

    def cal_target(request):
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
            prof = engine.store.add_profile(body.get("name", ""), body.get("note", ""))
        except ValueError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
        engine.refresh_calibration()
        # the very first profile auto-becomes active; if a wear is already in
        # progress it should belong to them, not stay unassigned
        engine.reattribute_open_session()
        engine._broadcast_status()
        engine._broadcast_db()
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
        engine._broadcast_db()
        return web.json_response({"ok": ok})

    async def profiles_delete(request):
        ok = engine.store.delete_profile(int(request.match_info["pid"]))
        engine.refresh_calibration()
        engine._broadcast_status()
        engine._broadcast_db()
        return web.json_response({"ok": ok})

    async def profiles_select(request):
        raw = request.match_info["pid"]
        pid = None if raw in ("none", "0") else int(raw)
        ok = engine.set_active_profile(pid)
        return web.json_response({"ok": ok, "active": engine.store.active_profile()})

    async def session_assign(request):
        sid = int(request.match_info["sid"])
        try:
            body = await request.json()
        except Exception:
            body = {}
        raw = body.get("profile_id")
        pid = None if raw in (None, "", "none", 0, "0") else int(raw)
        ok = engine.store.assign_session(sid, pid)
        engine._broadcast_db()
        return web.json_response({"ok": ok})

    # -------------------------------------------------------- calibration
    async def calibration_get(request):
        pid = cal_target(request)
        return web.json_response({"profile_id": pid,
                                  "calibration": engine.store.calibration(pid),
                                  "limit": engine.store.CAL_LIMIT})

    async def calibration_set(request):
        """Absolute offset: {"hr": -5}. The +/- buttons send the new absolute
        value, so a double-tap can never double-apply."""
        pid = cal_target(request)
        try:
            body = await request.json()
        except Exception:
            raise web.HTTPBadRequest(reason="expected JSON")
        cal = engine.store.set_calibration(pid, body or {})
        engine.refresh_calibration()
        engine._broadcast_status()
        engine._broadcast_db()
        return web.json_response({"ok": True, "profile_id": pid, "calibration": cal})

    async def calibration_reset(request):
        pid = cal_target(request)
        cal = engine.store.set_calibration(pid, {"hr": 0})
        engine.refresh_calibration()
        engine._broadcast_status()
        engine._broadcast_db()
        return web.json_response({"ok": True, "profile_id": pid, "calibration": cal})

    # ---------------------------------------------------------- history (DB)
    async def sessions(request):
        limit = max(1, min(int(request.query.get("limit", 25)), 500))
        offset = max(0, int(request.query.get("offset", 0)))
        return web.json_response(
            engine.list_sessions(limit, offset, want_profile(request)))

    async def session_trend(request):
        try:
            sid = int(request.match_info["sid"])
        except ValueError:
            raise web.HTTPNotFound()
        return web.json_response({"session_id": sid,
                                  "trend": engine.session_trend(sid)})

    async def session_delete(request):
        try:
            sid = int(request.match_info["sid"])
        except ValueError:
            raise web.HTTPNotFound()
        return web.json_response({"ok": engine.delete_session(sid)})

    async def stats(request):
        return web.json_response(engine.stats(want_profile(request)))

    async def trend(request):
        hours = max(1, min(int(request.query.get("hours", 24)), 24 * 90))
        return web.json_response({"hours": hours,
                                  "trend": engine.recent_hr(hours,
                                                            want_profile(request))})

    async def sessions_csv(request):
        body = engine.store.csv(want_profile(request))
        return web.Response(body=body.encode(), headers={
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="ecg_sessions.csv"'})

    # ------------------------------------------- raw waveform CSV captures
    async def recordings(request):
        return web.json_response(engine.list_recordings())

    async def recording_file(request):
        fn = request.match_info["name"]
        if "/" in fn or ".." in fn or not fn.endswith(".csv"):
            raise web.HTTPNotFound()
        p = os.path.join(engine.sessions_dir, fn)
        if not os.path.exists(p):
            raise web.HTTPNotFound()
        return web.FileResponse(p, headers={
            "Content-Disposition": f'attachment; filename="{fn}"',
            "Content-Type": "text/csv"})

    async def recording_delete(request):
        return web.json_response({"ok": engine.delete_recording(
            request.match_info["name"])})

    app.router.add_get("/", index)
    app.router.add_get("/index.html", index)
    app.router.add_get("/api/status", status)
    app.router.add_get("/api/ws", ws_handler)
    app.router.add_get("/api/sessions", sessions)
    app.router.add_get("/api/sessions.csv", sessions_csv)
    app.router.add_get("/api/sessions/{sid}/trend", session_trend)
    app.router.add_delete("/api/sessions/{sid}", session_delete)
    app.router.add_post("/api/sessions/{sid}/profile", session_assign)
    app.router.add_get("/api/stats", stats)
    app.router.add_get("/api/trend", trend)
    app.router.add_get("/api/profiles", profiles_list)
    app.router.add_post("/api/profiles", profiles_add)
    app.router.add_post("/api/profiles/{pid}", profiles_update)
    app.router.add_delete("/api/profiles/{pid}", profiles_delete)
    app.router.add_post("/api/profiles/{pid}/select", profiles_select)
    app.router.add_get("/api/calibration", calibration_get)
    app.router.add_post("/api/calibration", calibration_set)
    app.router.add_post("/api/calibration/reset", calibration_reset)
    app.router.add_get("/api/recordings", recordings)
    app.router.add_get("/api/recordings/{name}", recording_file)
    app.router.add_delete("/api/recordings/{name}", recording_delete)
    app.router.add_static("/static/", STATIC)
    return app


async def main():
    loop = asyncio.get_running_loop()
    data_dir = env("ECG_DATA_DIR", "/share/ecg2")
    engine = Engine(data_dir, mains_hz=int(env("ECG_MAINS_HZ", "50")), loop=loop)
    source = env("ECG_SOURCE", "auto")
    tasks = [asyncio.create_task(engine.broadcaster())]
    ble = None

    # MQTT (HA entities + optional bridge source)
    mq = None
    if env("ECG_MQTT_HOST"):
        try:
            from hamqtt import HaMqtt
            mq = HaMqtt(engine, env("ECG_MQTT_HOST"), env("ECG_MQTT_PORT", "1883"),
                        env("ECG_MQTT_USER", ""), env("ECG_MQTT_PASSWORD", ""),
                        env("ECG_DISCOVERY_PREFIX", "homeassistant"),
                        env("ECG_DEVICE_ADDRESS", ""),
                        on_recording_cmd=lambda on: loop.call_soon_threadsafe(
                            engine.start_recording if on else engine.stop_recording))
            if source in ("auto", "mqtt"):
                MqttSource(engine, mq.client, env("ECG_MQTT_RAW_TOPIC", "ecg2/raw")).attach(mq)
            mq.start()
        except Exception:
            log.exception("MQTT setup failed — continuing without HA entities")
            mq = None
    else:
        log.warning("No MQTT broker configured: HA entities and MQTT bridge source are disabled")

    if source == "replay":
        path = env("ECG_REPLAY_FILE", "")
        if not path or not os.path.exists(path):
            log.error("ECG_SOURCE=replay but ECG_REPLAY_FILE missing")
        else:
            tasks.append(asyncio.create_task(ReplaySource(engine, path).run()))
    elif source in ("auto", "ble"):
        ble = BleSource(engine, env("ECG_DEVICE_ADDRESS", "12:16:00:00:06:63"),
                        env("ECG_DEVICE_NAME", "ikinloop"),
                        int(env("ECG_SCAN_TIMEOUT", "20")))
        tasks.append(asyncio.create_task(ble.run()))
    else:  # mqtt only
        engine.set_step("mqtt_wait")

    app = build_app(engine, ble)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    port = int(env("ECG_HTTP_PORT", "8099"))
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
