"""Packet sources feeding the Engine: host Bluetooth (bleak/BlueZ over D-Bus),
an MQTT bridge (ecg_bridge.py on a PC), and CSV replay for testing."""
from __future__ import annotations

import asyncio
import csv
import logging
import time

import protocol
from protocol import decode, HR_MEASUREMENT_UUID, BATTERY_LEVEL_UUID, MODEL_NUMBER_UUID, \
    FIRMWARE_REV_UUID, HARDWARE_REV_UUID

log = logging.getLogger("sources")


# ---------------------------------------------------------------- BLE
class BleSource:
    def __init__(self, engine, address: str, name_prefix: str, scan_timeout: int = 20):
        self.engine = engine
        self.address = address.upper()
        self.name_prefix = (name_prefix or "").lower()
        self.scan_timeout = scan_timeout
        self.enabled = True          # UI start/stop
        self._wake = asyncio.Event()
        self._client = None
        self.available = True

    def start(self):
        self.enabled = True
        self._wake.set()

    def stop(self):
        self.enabled = False
        self._wake.set()

    def _match(self, dev, ad) -> bool:
        if dev.address.upper() == self.address:
            return True
        n = (dev.name or getattr(ad, "local_name", None) or "").lower()
        return bool(self.name_prefix) and n.startswith(self.name_prefix)

    async def run(self):
        try:
            from bleak import BleakClient, BleakScanner
        except Exception as e:                       # pragma: no cover
            log.error("bleak unavailable: %s", e)
            self.available = False
            return
        eng = self.engine
        import os
        dbus_sock = os.environ.get("DBUS_SYSTEM_BUS_ADDRESS", "unix:path=/run/dbus/system_bus_socket").split("path=")[-1]
        while True:
            if not os.path.exists(dbus_sock):
                self.available = False
                eng.set_step("mqtt_wait", f"Host D-Bus socket not found ({dbus_sock}) — is host_dbus enabled and Bluetooth present?")
                await asyncio.sleep(30)
                continue
            if not self.enabled:
                eng.source_released("ble")
                if eng.status.step not in ("mqtt_wait",):
                    eng.set_step("idle", "Bluetooth stopped")
                self._wake.clear()
                await self._wake.wait()
                continue
            eng.status.attempts += 1
            eng.set_step("wake")
            dev = None
            try:
                # Short scans in a loop so the UI can show progress / allow stop.
                deadline = time.time() + self.scan_timeout
                first = True
                while self.enabled and time.time() < deadline and dev is None:
                    eng.set_step("scanning", f"{int(deadline - time.time())} s left" if not first else "")
                    first = False
                    dev = await BleakScanner.find_device_by_filter(self._match, timeout=5.0)
                if dev is None:
                    if not self.enabled:
                        continue
                    self.available = True
                    eng.set_step("wake", "Not advertising — press the button on the ecg2, then wait")
                    await asyncio.sleep(3)
                    continue
                eng.set_step("connecting", f"{dev.name or 'ecg2'} [{dev.address}]")
                eng.set_device_info(address=dev.address)
                async with BleakClient(dev, timeout=25) as client:
                    self._client = client
                    eng.set_step("checking", "Reading device information")
                    eng.status.connected = True
                    info = {}
                    for key, uuid in (("model", MODEL_NUMBER_UUID), ("firmware", FIRMWARE_REV_UUID),
                                      ("hardware", HARDWARE_REV_UUID)):
                        try:
                            v = await client.read_gatt_char(uuid)
                            info[key] = bytes(v).decode(errors="replace").strip("\x00 ")
                        except Exception:
                            pass
                    eng.set_device_info(**info)
                    try:
                        b = await client.read_gatt_char(BATTERY_LEVEL_UUID)
                        eng.set_battery(int(b[0]))
                    except Exception as e:
                        log.debug("battery read failed: %s", e)
                    eng.source_claims("ble")

                    def on_hr(_, data: bytearray):
                        if eng.source_claims("ble"):
                            pkt = decode(bytes(data))
                            if pkt is not None:
                                eng.handle_packet(pkt, "ble")

                    await client.start_notify(HR_MEASUREMENT_UUID, on_hr)
                    eng.set_step("contact", "Subscribed to heart-rate stream")
                    last_batt = time.time()
                    while self.enabled and client.is_connected:
                        await asyncio.sleep(1)
                        if time.time() - last_batt > 60:
                            last_batt = time.time()
                            try:
                                b = await client.read_gatt_char(BATTERY_LEVEL_UUID)
                                eng.set_battery(int(b[0]))
                            except Exception:
                                pass
                    if self.enabled:
                        eng.set_step("error", "Bluetooth link dropped")
            except Exception as e:
                msg = str(e) or e.__class__.__name__
                ml = msg.lower()
                if isinstance(e, FileNotFoundError) or "dbus" in ml or "bluez" in ml or "no bluetooth adapter" in ml:
                    self.available = False
                    log.warning("Host Bluetooth not usable: %s", msg)
                    eng.set_step("mqtt_wait", "Host Bluetooth unavailable — using MQTT bridge if configured")
                    await asyncio.sleep(30)
                    continue
                log.warning("BLE attempt failed: %s", msg)
                eng.set_step("error", msg[:120])
            finally:
                self._client = None
                eng.status.connected = False
                eng.source_released("ble")
            await asyncio.sleep(2)


# ---------------------------------------------------------------- MQTT
class MqttSource:
    """Consumes raw notification bytes published by ecg_bridge.py:
       <raw_topic>            payload = raw 0x2A37 bytes (6 or 18)
       <raw_topic>/battery    payload = int percent
       <raw_topic>/bridge     payload = 'online' | 'offline' (retained, LWT)
       <raw_topic>/info       payload = JSON {model, firmware, hardware, address}
    """

    def __init__(self, engine, client, raw_topic: str):
        self.engine = engine
        self.client = client             # paho client, already connected by hamqtt
        self.raw_topic = raw_topic
        self.bridge_online = False

    def attach(self, hamqtt):
        """Register callbacks now; subscribe on every (re)connect."""
        t = self.raw_topic
        self.client.message_callback_add(t, self._on_raw)
        self.client.message_callback_add(t + "/battery", self._on_batt)
        self.client.message_callback_add(t + "/bridge", self._on_bridge)
        self.client.message_callback_add(t + "/info", self._on_info)

        def subscribe():
            self.client.subscribe([(t, 0), (t + "/battery", 0), (t + "/bridge", 0), (t + "/info", 0)])
            log.info("MQTT source subscribed to %s", t)
        hamqtt.on_connect_hooks.append(subscribe)

    def _on_raw(self, _c, _u, msg):
        eng = self.engine
        if not eng.source_claims("mqtt"):
            return
        pkt = decode(bytes(msg.payload))
        if pkt is None:
            return
        eng.loop.call_soon_threadsafe(self._deliver, pkt)

    def _deliver(self, pkt):
        """Runs on the event loop thread."""
        eng = self.engine
        if eng.status.step in ("mqtt_wait", "idle", "wake", "scanning", "error"):
            eng.status.connected = True
            eng.set_step("contact", "Receiving from PC bridge")
        eng.handle_packet(pkt, "mqtt")

    def _on_batt(self, _c, _u, msg):
        try:
            self.engine.loop.call_soon_threadsafe(self.engine.set_battery, int(msg.payload))
        except ValueError:
            pass

    def _on_bridge(self, _c, _u, msg):
        self.bridge_online = msg.payload == b"online"
        self.engine.loop.call_soon_threadsafe(
            self.engine._log, f"PC bridge {'online' if self.bridge_online else 'offline'}")

    def _on_info(self, _c, _u, msg):
        import json
        try:
            d = json.loads(msg.payload)
            self.engine.loop.call_soon_threadsafe(
                lambda: self.engine.set_device_info(**{k: d.get(k) for k in ("model", "firmware", "hardware", "address")}))
        except Exception:
            pass


# ---------------------------------------------------------------- Replay
class ReplaySource:
    """Replays an ecg_raw_*.csv capture (t_unix,char_uuid,len,hex,...) at real
    time, looping. Used for testing the dashboard without hardware."""

    def __init__(self, engine, path: str, loop_forever: bool = True):
        self.engine = engine
        self.path = path
        self.loop_forever = loop_forever

    async def run(self):
        eng = self.engine
        rows = [r for r in csv.DictReader(open(self.path)) if r["char_uuid"].startswith("00002a37")]
        if not rows:
            log.error("replay file has no 0x2A37 rows")
            return
        eng.set_device_info(model="REPLAY", address=self.path.rsplit("/", 1)[-1])
        while True:
            eng.set_step("wake", "Replay: simulating device wake")
            await asyncio.sleep(1.0)
            eng.set_step("scanning", "Replay")
            await asyncio.sleep(1.0)
            eng.set_step("connecting", "Replay")
            await asyncio.sleep(0.7)
            eng.set_step("checking", "Replay")
            eng.status.connected = True
            eng.set_battery(87)
            await asyncio.sleep(0.7)
            eng.source_claims("replay")
            eng.set_step("contact", "Replay: waiting for contact frames")
            await asyncio.sleep(1.5)
            t0 = float(rows[0]["t_unix"])
            start = time.time()
            for r in rows:
                dt = float(r["t_unix"]) - t0 - (time.time() - start)
                if dt > 0:
                    await asyncio.sleep(dt)
                pkt = decode(bytes.fromhex(r["hex"]))
                if pkt is not None:
                    eng.handle_packet(pkt, "replay")
            eng.status.connected = False
            eng.source_released("replay")
            if not self.loop_forever:
                eng.set_step("idle", "Replay finished")
                return
            eng.set_step("error", "Replay: capture ended, looping")
            await asyncio.sleep(2)
