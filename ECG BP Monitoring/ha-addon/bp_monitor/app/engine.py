"""Central engine: guided-step state machine + reading history + fan-out
to WebSocket clients / MQTT.

Guided steps:
  wake      - waiting for the cuff to advertise (user must press its button)
  scanning  - BLE scanner running
  connecting- GATT connect in progress
  checking  - reading device info, subscribing to the measurement char
  ready     - connected, subscribed — start a measurement on the cuff itself
  result    - a reading just came in
  mqtt_wait - (MQTT source) waiting for a bridge to publish
  error     - last attempt failed; will retry
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field, asdict

from protocol import BpReading, RawFrame
from store import Store, classify, mean_arterial

log = logging.getLogger("engine")

STEP_ORDER = ["wake", "scanning", "connecting", "checking", "ready", "result"]
STEP_TEXT = {
    "idle":       ("Idle", "Press Start to begin the guided connection."),
    "wake":       ("Turn on the cuff", "Press the power/start button on the cuff. It only advertises for a few seconds after waking — do this now."),
    "scanning":   ("Scanning for the cuff", "Looking for RBP1711150377 over Bluetooth. Keep it within 2 m of the Home Assistant box."),
    "connecting": ("Connecting", "Device found — opening the Bluetooth link."),
    "checking":   ("Checking device", "Reading model/firmware and subscribing to the measurement channel."),
    "ready":      ("Ready — start a measurement", "Connected. Put the cuff on your arm and press its own Start button; the reading appears here automatically when it finishes."),
    "result":     ("Reading received", "Latest measurement is shown below."),
    "mqtt_wait":  ("Waiting for bridge", "No local Bluetooth stream. Packets will appear here automatically once a bridge publishes them."),
    "error":      ("Connection lost", "Retrying. If the cuff went to sleep, press its button again."),
}


@dataclass
class Reading:
    ts: float
    systolic: int
    diastolic: int
    pulse: int
    raw_hex: str
    category: str = ""
    map_calc: float = 0.0
    profile_name: str = ""


@dataclass
class Status:
    step: str = "idle"
    step_index: int = -1
    title: str = ""
    hint: str = ""
    detail: str = ""
    source: str = "none"          # ble | mqtt | replay | none
    connected: bool = False
    systolic: int | None = None
    diastolic: int | None = None
    pulse: int | None = None
    category: str = ""
    map_calc: float | None = None
    reading_time: float | None = None
    profile_id: int | None = None
    profile_name: str = ""
    raw_systolic: int | None = None
    raw_diastolic: int | None = None
    raw_pulse: int | None = None
    calibrated: bool = False
    calibration: dict = field(default_factory=dict)
    manufacturer: str = ""
    model: str = ""
    serial: str = ""
    firmware: str = ""
    hardware: str = ""
    software: str = ""
    address: str = ""
    readings_count: int = 0
    unknown_frames: int = 0
    uptime_s: float = 0.0
    attempts: int = 0
    log: list = field(default_factory=list)


class Engine:
    def __init__(self, data_dir: str, loop: asyncio.AbstractEventLoop | None = None):
        self.loop = loop or asyncio.get_event_loop()
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self.history_path = os.path.join(data_dir, "history.jsonl")
        self.store = Store(data_dir)
        self.store.import_jsonl(self.history_path)   # one-time, pre-SQLite data
        self.status = Status()
        self.started = time.time()
        self.clients: set = set()          # aiohttp WebSocketResponse
        self.on_status_change = []          # callables(status)
        self.on_reading = []                # callables(Reading)
        self._active_source: str = "none"
        self._active_source_t: float = 0.0

    # ------------------------------------------------------------ status
    def _log(self, msg: str):
        line = f"{time.strftime('%H:%M:%S')}  {msg}"
        self.status.log.append(line)
        del self.status.log[:-40]
        log.info(msg)

    def set_step(self, step: str, detail: str = ""):
        st = self.status
        changed = st.step != step
        st.step = step
        st.step_index = STEP_ORDER.index(step) if step in STEP_ORDER else -1
        st.title, st.hint = STEP_TEXT.get(step, (step, ""))
        st.detail = detail
        if changed:
            self._log(f"[{step}] {st.title}" + (f" — {detail}" if detail else ""))
            if step in ("wake", "scanning", "mqtt_wait", "error", "idle"):
                st.connected = False
            self._broadcast_status()

    def set_device_info(self, **kw):
        for k, v in kw.items():
            if v is not None:
                setattr(self.status, k, v)
        self._broadcast_status()

    def snapshot(self) -> dict:
        st = self.status
        st.uptime_s = round(time.time() - self.started, 1)
        st.source = self._active_source
        try:
            prof = self.store.active_profile()
            st.profile_id = prof["id"] if prof else None
            st.profile_name = prof["name"] if prof else ""
            st.calibration = self.store.calibration(st.profile_id)
            st.calibrated = any(st.calibration.values())
        except Exception:
            pass
        return asdict(st)

    # ------------------------------------------------------------ sources
    def source_claims(self, name: str) -> bool:
        now = time.time()
        if name == self._active_source:
            self._active_source_t = now
            return True
        if name == "ble" or self._active_source == "none" or now - self._active_source_t > 5:
            if self._active_source != name:
                self._log(f"Active source: {name}")
            self._active_source = name
            self._active_source_t = now
            return True
        return False

    def source_released(self, name: str):
        if self._active_source == name:
            self._active_source = "none"

    # ------------------------------------------------------------ frames
    def handle_frame(self, pkt, source: str):
        st = self.status
        if isinstance(pkt, BpReading):
            ts = time.time()
            # 1. who is this reading for
            prof = None
            try:
                prof = self.store.active_profile()
            except Exception:
                log.exception("failed to read active profile")
            pid = prof["id"] if prof else None
            who = prof["name"] if prof else "unassigned"

            # 2. store the RAW decode — the database always holds what the cuff sent
            try:
                self.store.add_reading(ts, pkt.systolic, pkt.diastolic, pkt.pulse,
                                       source, pkt.raw_hex, profile_id=pid)
            except Exception:
                log.exception("failed to store reading")

            # 3. show and publish the CALIBRATED values
            c = self.store.apply_calibration(pkt.systolic, pkt.diastolic,
                                             pkt.pulse, pid)
            reading = Reading(ts=ts, systolic=c["systolic"], diastolic=c["diastolic"],
                              pulse=c["pulse"], raw_hex=pkt.raw_hex,
                              category=c["category"], map_calc=c["map_calc"],
                              profile_name=who)
            st.systolic, st.diastolic, st.pulse = \
                c["systolic"], c["diastolic"], c["pulse"]
            st.category, st.map_calc = c["category"], c["map_calc"]
            st.raw_systolic, st.raw_diastolic, st.raw_pulse = \
                pkt.systolic, pkt.diastolic, pkt.pulse
            st.calibrated = c["calibrated"]
            st.reading_time = ts
            st.readings_count += 1
            st.profile_id, st.profile_name = pid, (prof["name"] if prof else "")

            cal_note = ""
            if c["calibrated"]:
                cal_note = (f"  (raw {pkt.systolic}/{pkt.diastolic}/{pkt.pulse},"
                            f" calibration {c['calibration']})")
            self._log(f"Reading for {who}: {c['systolic']}/{c['diastolic']} mmHg, "
                      f"pulse {c['pulse']} bpm, {c['category']}"
                      f"{cal_note}  (frame {pkt.raw_hex})")
            self.set_step("result",
                          f"{c['systolic']}/{c['diastolic']} mmHg · {c['pulse']} bpm"
                          + (" · calibrated" if c["calibrated"] else ""))
            self._broadcast_history()
            for cb in self.on_reading:
                try:
                    cb(reading)
                except Exception:
                    log.exception("reading callback")
        elif isinstance(pkt, RawFrame):
            st.unknown_frames += 1
            try:
                self.store.add_frame(time.time(), pkt.frame_type, pkt.raw_hex)
            except Exception:
                log.exception("failed to store frame")
            self._log(f"Unrecognized frame type 0x{pkt.frame_type:02x}: {pkt.raw_hex}")
            self._broadcast_status()

    def handle_frame_threadsafe(self, pkt, source: str):
        self.loop.call_soon_threadsafe(self.handle_frame, pkt, source)

    # ------------------------------------------------------------ history
    def list_history(self, limit: int = 50, offset: int = 0, profile_id=None) -> dict:
        return self.store.list_readings(limit, offset, profile_id)

    def trend(self, days: int = 30, profile_id=None) -> list[dict]:
        return self.store.trend(days, profile_id=profile_id)

    def stats(self, profile_id=None) -> dict:
        return self.store.stats(profile_id)

    def history_message(self) -> str:
        """Sent on WS connect and after every new reading, so the chart, the
        table and the profile list update without the page polling. Scoped to
        the active profile — that is what the dashboard is showing."""
        prof = self.store.active_profile()
        pid = prof["id"] if prof else None
        return json.dumps({"type": "history",
                           "trend": self.store.trend(30, profile_id=pid),
                           "stats": self.store.stats(pid),
                           "profiles": self.store.list_profiles(),
                           "recent": self.store.list_readings(10, 0, pid)["rows"]})

    def _broadcast_history(self):
        try:
            self._send_all(self.history_message())
        except Exception:
            log.exception("history broadcast")

    # ------------------------------------------------------------ fan-out
    def _broadcast_status(self):
        msg = json.dumps({"type": "status", "data": self.snapshot()})
        for cb in self.on_status_change:
            try:
                cb(self.status)
            except Exception:
                log.exception("status callback")
        self._send_all(msg)

    def _send_all(self, msg: str):
        dead = []
        for ws in list(self.clients):
            try:
                if ws.closed:
                    dead.append(ws)
                    continue
                asyncio.ensure_future(ws.send_str(msg), loop=self.loop)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def broadcaster(self):
        """Keep counters/uptime fresh and give MQTT a 30 s heartbeat."""
        tick = 0
        while True:
            await asyncio.sleep(1)
            tick += 1
            if tick % 30 == 0:
                self._broadcast_status()
