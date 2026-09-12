"""Packet sources feeding the Engine: host Bluetooth (bleak/BlueZ over D-Bus)
and an MQTT bridge, mirroring the ecg2_monitor add-on's pattern.

BlueZ quirk found for this cuff: bleak's normal high-level connect
(`BleakClient(dev).__aenter__`) fails with
`org.bluez.Error.BREDR.ProfileUnavailable` because the cuff advertises
dual-mode. The fix is to issue a bare `Device1.Connect()` over D-Bus with
no arguments first (bleak's BlueZ backend does this once the device is
already known to bluetoothd — i.e. once it has been seen advertising in
this process — so scanning first is what makes the plain connect work)."""
from __future__ import annotations

import asyncio
import logging
import os
import time

import protocol
from protocol import decode, BP_MEASUREMENT_UUID, BP_WRITE_UUID, \
    MANUFACTURER_NAME_UUID, MODEL_NUMBER_UUID, SERIAL_NUMBER_UUID, \
    FIRMWARE_REV_UUID, HARDWARE_REV_UUID, SOFTWARE_REV_UUID

log = logging.getLogger("sources")


# ---------------------------------------------------------------- BLE
class BleSource:
    def __init__(self, engine, address: str, name_prefix: str, scan_timeout: int = 30):
        self.engine = engine
        self.address = address.upper()
        self.name_prefix = (name_prefix or "").lower()
        self.scan_timeout = scan_timeout
        self.enabled = True
        self._wake = asyncio.Event()
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
                    eng.set_step("wake", "Not advertising — press the button on the cuff, then wait")
                    await asyncio.sleep(3)
                    continue
                eng.set_step("connecting", f"{dev.name or 'RBP'} [{dev.address}]")
                eng.set_device_info(address=dev.address)
                # This cuff advertises as dual-mode, and BlueZ's BR/EDR profile
                # negotiation for it is flaky: a fresh connect sometimes raises
                # org.bluez.Error.BREDR.ProfileUnavailable even though a retry
                # a moment later succeeds. Retry a few times before giving up.
                client = None
                last_err = None
                for attempt in range(3):
                    try:
                        client = BleakClient(dev, timeout=25)
                        await client.connect()
                        last_err = None
                        break
                    except Exception as ce:
                        last_err = ce
                        if "profileunavailable" in str(ce).lower() and attempt < 2:
                            eng.set_step("connecting", f"Retrying connect ({attempt + 1}/3)…")
                            await asyncio.sleep(2)
                            continue
                        raise
                if last_err is not None:
                    raise last_err
                try:
                    eng.set_step("checking", "Reading device information")
                    eng.status.connected = True
                    info = {}
                    for key, uuid in (("manufacturer", MANUFACTURER_NAME_UUID), ("model", MODEL_NUMBER_UUID),
                                      ("serial", SERIAL_NUMBER_UUID), ("firmware", FIRMWARE_REV_UUID),
                                      ("hardware", HARDWARE_REV_UUID), ("software", SOFTWARE_REV_UUID)):
                        try:
                            v = await client.read_gatt_char(uuid)
                            info[key] = bytes(v).decode(errors="replace").strip("\x00 ")
                        except Exception:
                            pass
                    eng.set_device_info(**info)
                    eng.source_claims("ble")

                    def on_notify(_, data: bytearray):
                        if eng.source_claims("ble"):
                            pkt = decode(bytes(data))
                            if pkt is not None:
                                eng.handle_frame(pkt, "ble")

                    await client.start_notify(BP_MEASUREMENT_UUID, on_notify)
                    eng.set_step("ready", "Subscribed — start a measurement on the cuff")
                    while self.enabled and client.is_connected:
                        await asyncio.sleep(1)
                    if self.enabled:
                        eng.set_step("error", "Bluetooth link dropped")
                finally:
                    try:
                        if client.is_connected:
                            await client.disconnect()
                    except Exception:
                        pass
            except Exception as e:
                msg = str(e) or e.__class__.__name__
                ml = msg.lower()
                if isinstance(e, FileNotFoundError) or "dbus" in ml or "bluez" in ml or "no bluetooth adapter" in ml:
                    self.available = False
                    log.warning("Host Bluetooth not usable: %s", msg)
                    eng.set_step("mqtt_wait", "Host Bluetooth unavailable")
                    await asyncio.sleep(30)
                    continue
                log.warning("BLE attempt failed: %s", msg)
                eng.set_step("error", msg[:120])
            finally:
                eng.status.connected = False
                eng.source_released("ble")
            await asyncio.sleep(2)


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
        eng.set_device_info(model="REPLAY", manufacturer="replay", address="00:00:00:00:00:00")
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
