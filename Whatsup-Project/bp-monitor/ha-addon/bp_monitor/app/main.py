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
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT and msg.data == "ping":
                    await ws.send_str('{"type":"pong"}')
        finally:
            engine.clients.discard(ws)
        return ws

    async def control(request):
        action = request.match_info["action"]
        if action == "ble_start" and ble:
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

    async def history(request):
        limit = int(request.query.get("limit", 200))
        return web.json_response(engine.list_history(limit))

    app.router.add_get("/", index)
    app.router.add_get("/index.html", index)
    app.router.add_get("/api/status", status)
    app.router.add_get("/api/ws", ws_handler)
    app.router.add_post("/api/control/{action}", control)
    app.router.add_get("/api/history", history)
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
