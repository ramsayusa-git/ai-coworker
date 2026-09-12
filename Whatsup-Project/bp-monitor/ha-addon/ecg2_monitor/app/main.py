"""ECG2 Monitor — aiohttp server (Ingress) + sources + MQTT."""
from __future__ import annotations

import asyncio
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
        await ws.send_str(__import__("json").dumps({"type": "status", "data": engine.snapshot()}))
        await ws.send_str(engine.history_message())
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT and msg.data == "ping":
                    await ws.send_str('{"type":"pong"}')
        finally:
            engine.clients.discard(ws)
        return ws

    async def control(request):
        action = request.match_info["action"]
        if action == "record_start":
            engine.start_recording()
        elif action == "record_stop":
            engine.stop_recording()
        elif action == "ble_start" and ble:
            ble.start()
        elif action == "ble_stop" and ble:
            ble.stop()
        elif action == "reconnect" and ble:
            ble.stop()
            await asyncio.sleep(0.5)
            ble.start()
        else:
            return web.json_response({"ok": False, "error": "unknown action"}, status=400)
        return web.json_response({"ok": True, "status": engine.snapshot()})

    async def sessions(request):
        return web.json_response(engine.list_sessions())

    async def session_file(request):
        fn = request.match_info["name"]
        if "/" in fn or ".." in fn or not fn.endswith(".csv"):
            raise web.HTTPNotFound()
        p = os.path.join(engine.sessions_dir, fn)
        if not os.path.exists(p):
            raise web.HTTPNotFound()
        return web.FileResponse(p, headers={"Content-Disposition": f'attachment; filename="{fn}"',
                                            "Content-Type": "text/csv"})

    async def session_delete(request):
        ok = engine.delete_session(request.match_info["name"])
        return web.json_response({"ok": ok})

    app.router.add_get("/", index)
    app.router.add_get("/index.html", index)
    app.router.add_get("/api/status", status)
    app.router.add_get("/api/ws", ws_handler)
    app.router.add_post("/api/control/{action}", control)
    app.router.add_get("/api/sessions", sessions)
    app.router.add_get("/api/sessions/{name}", session_file)
    app.router.add_delete("/api/sessions/{name}", session_delete)
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
                        env("ECG_DISCOVERY_PREFIX", "homeassistant"), env("ECG_DEVICE_ADDRESS", ""),
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
                        env("ECG_DEVICE_NAME", "ikinloop"), int(env("ECG_SCAN_TIMEOUT", "20")))
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
