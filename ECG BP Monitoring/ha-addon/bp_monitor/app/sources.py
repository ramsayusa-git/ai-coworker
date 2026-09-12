"""Packet sources feeding the Engine.

BleSource talks to BlueZ directly over D-Bus (see bledbus.py) rather than
through bleak's high-level client, because bleak's connect fails against
this dual-mode cuff with org.bluez.Error.BREDR.ProfileUnavailable while a
plain Device1.Connect() — with discovery stopped first — works. The
sequence below is the one that actually captured a measurement frame from
the hardware.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

from protocol import decode, BP_MEASUREMENT_UUID, \
    MANUFACTURER_NAME_UUID, MODEL_NUMBER_UUID, SERIAL_NUMBER_UUID, \
    FIRMWARE_REV_UUID, HARDWARE_REV_UUID, SOFTWARE_REV_UUID

log = logging.getLogger("sources")

DIS_FIELDS = (
    ("manufacturer", MANUFACTURER_NAME_UUID),
    ("model", MODEL_NUMBER_UUID),
    ("serial", SERIAL_NUMBER_UUID),
    ("firmware", FIRMWARE_REV_UUID),
    ("hardware", HARDWARE_REV_UUID),
    ("software", SOFTWARE_REV_UUID),
)


# ---------------------------------------------------------------- BLE
class BleSource:
    def __init__(self, engine, address: str, name_prefix: str, scan_timeout: int = 30):
        self.engine = engine
        self.address = (address or "").upper()
        self.name_prefix = name_prefix or ""
        self.scan_timeout = max(int(scan_timeout), 15)
        self.enabled = True
        self.available = True
        self._wake = asyncio.Event()

    def start(self):
        self.enabled = True
        self._wake.set()

    def stop(self):
        self.enabled = False
        self._wake.set()

    # ------------------------------------------------------------ helpers
    @staticmethod
    def _addr_from_path(path: str | None) -> str:
        if not path or "/dev_" not in path:
            return ""
        return path.rsplit("/dev_", 1)[-1].replace("_", ":")

    async def _read_device_info(self, ble) -> dict:
        info = {}
        for key, uuid in DIS_FIELDS:
            try:
                v = await ble.read_string(uuid)
            except Exception:
                v = None
            if v:
                info[key] = v
        return info

    async def _subscribe_measurement(self, ble, on_frame) -> bool:
        """Subscribe to the measurement characteristic. If the expected UUID
        isn't present (firmware variant), fall back to every notifying
        characteristic so a reading is never silently missed."""
        try:
            if await ble.subscribe(BP_MEASUREMENT_UUID, on_frame):
                return True
        except BleError as e:
            log.warning("StartNotify on %s failed: %s", BP_MEASUREMENT_UUID, e)
        ok = False
        for uuid, flags in ble.char_flags.items():
            if "notify" not in flags and "indicate" not in flags:
                continue
            try:
                if await ble.subscribe(uuid, on_frame):
                    log.info("fallback subscription on %s", uuid)
                    ok = True
            except Exception as e:
                log.debug("fallback StartNotify %s: %s", uuid, e)
        return ok

    # ------------------------------------------------------------ main loop
    async def run(self):
        eng = self.engine
        # Imported lazily: a missing dbus-fast must degrade this one source,
        # not stop the add-on (replay/MQTT modes need no Bluetooth at all).
        try:
            from bledbus import DbusBle, BleUnavailable, BleError
        except Exception as e:
            log.error("D-Bus Bluetooth support unavailable (%s)", e)
            self.available = False
            eng.set_step("mqtt_wait", f"Bluetooth library missing: {e}")
            return
        dbus_sock = os.environ.get(
            "DBUS_SYSTEM_BUS_ADDRESS",
            "unix:path=/run/dbus/system_bus_socket").split("path=")[-1]

        while True:
            if not os.path.exists(dbus_sock):
                self.available = False
                eng.set_step("mqtt_wait", f"Host D-Bus socket missing ({dbus_sock})"
                                          " — is host_dbus enabled?")
                await asyncio.sleep(30)
                continue
            if not self.enabled:
                eng.source_released("ble")
                eng.set_step("idle", "Bluetooth stopped")
                self._wake.clear()
                await self._wake.wait()
                continue

            eng.status.attempts += 1
            ble = DbusBle(self.address, self.name_prefix)
            try:
                await ble.open()
                self.available = True

                eng.set_step("wake")
                found = await ble.discover(
                    self.scan_timeout,
                    on_tick=lambda s: eng.set_step("scanning", f"{s} s left in this pass"))
                if not found:
                    eng.set_step("wake", "Not advertising yet — press the button on "
                                         "the cuff now, it only advertises briefly")
                    await asyncio.sleep(2)
                    continue

                addr = self._addr_from_path(ble.device_path)
                eng.set_device_info(address=addr)
                eng.set_step("connecting", f"{ble.device_name or 'RBP'} [{addr}]")
                await ble.connect(
                    attempts=3,
                    on_attempt=lambda i, n: eng.set_step(
                        "connecting", f"Opening Bluetooth link (attempt {i} of {n})"))
                eng.status.connected = True

                eng.set_step("checking", "Link up — reading device information")
                await ble.load_gatt()
                info = await self._read_device_info(ble)
                if info:
                    eng.set_device_info(**info)
                eng.source_claims("ble")

                dropped = asyncio.Event()
                ble.on_disconnect(lambda: dropped.set())

                def on_frame(data: bytes):
                    if not eng.source_claims("ble"):
                        return
                    pkt = decode(data)
                    if pkt is not None:
                        eng.handle_frame(pkt, "ble")
                    else:
                        log.debug("undecodable notification: %s", data.hex())

                if not await self._subscribe_measurement(ble, on_frame):
                    raise BleError("no notifying characteristic to subscribe to")

                eng.set_step("ready", "Subscribed — put the cuff on your arm and "
                                      "press its own Start button")
                last_check = time.time()
                while self.enabled and not dropped.is_set():
                    try:
                        await asyncio.wait_for(dropped.wait(), timeout=5.0)
                    except asyncio.TimeoutError:
                        pass
                    # belt-and-braces: the Connected signal can be missed
                    if time.time() - last_check > 15:
                        last_check = time.time()
                        if not await ble.is_connected():
                            break
                if self.enabled:
                    eng.set_step("error", "Bluetooth link dropped — will retry")

            except BleUnavailable as e:
                self.available = False
                log.warning("Host Bluetooth not usable: %s", e)
                eng.set_step("mqtt_wait", str(e))
                await asyncio.sleep(30)
                continue
            except Exception as e:
                msg = str(e) or e.__class__.__name__
                log.warning("BLE attempt failed: %s", msg)
                eng.set_step("error", msg[:160])
            finally:
                eng.status.connected = False
                eng.source_released("ble")
                try:
                    await ble.disconnect()
                except Exception:
                    pass
                await ble.close()
            await asyncio.sleep(3)


# ---------------------------------------------------------------- MQTT
class MqttSource:
    """Consumes raw notification bytes published by a bridge on <raw_topic>."""

    def __init__(self, engine, client, raw_topic: str):
        self.engine = engine
        self.client = client
        self.raw_topic = raw_topic

    def attach(self, hamqtt):
        t = self.raw_topic
        self.client.message_callback_add(t, self._on_raw)

        def subscribe():
            self.client.subscribe([(t, 0)])
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
        eng = self.engine
        if eng.status.step in ("mqtt_wait", "idle", "wake", "scanning", "error"):
            eng.status.connected = True
        eng.handle_frame(pkt, "mqtt")


# ---------------------------------------------------------------- Replay
class ReplaySource:
    """Replays a captured raw hex frame every N seconds — for testing the
    dashboard without hardware."""

    def __init__(self, engine, hex_frames: list[str], interval_s: float = 15.0):
        self.engine = engine
        self.hex_frames = hex_frames or ["aa80020f0106000e010101010100d70086006733"]
        self.interval_s = interval_s

    async def run(self):
        eng = self.engine
        eng.set_device_info(model="REPLAY", manufacturer="replay",
                            address="00:00:00:00:00:00")
        i = 0
        while True:
            eng.set_step("wake", "Replay: simulating cuff wake")
            await asyncio.sleep(1.0)
            eng.set_step("scanning", "Replay")
            await asyncio.sleep(1.0)
            eng.set_step("connecting", "Replay")
            await asyncio.sleep(0.7)
            eng.set_step("checking", "Replay")
            eng.status.connected = True
            await asyncio.sleep(0.7)
            eng.source_claims("replay")
            eng.set_step("ready", "Replay: waiting to simulate a reading")
            await asyncio.sleep(self.interval_s)
            pkt = decode(bytes.fromhex(self.hex_frames[i % len(self.hex_frames)]))
            i += 1
            if pkt is not None:
                eng.handle_frame(pkt, "replay")
            eng.status.connected = False
            eng.source_released("replay")
            await asyncio.sleep(2)
