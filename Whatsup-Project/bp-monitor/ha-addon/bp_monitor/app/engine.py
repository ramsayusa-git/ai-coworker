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
    reading_time: float | None = None
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
            reading = Reading(ts=time.time(), systolic=pkt.systolic,
                              diastolic=pkt.diastolic, pulse=pkt.pulse, raw_hex=pkt.raw_hex)
            st.systolic, st.diastolic, st.pulse = pkt.systolic, pkt.diastolic, pkt.pulse
            st.reading_time = reading.ts
            st.readings_count += 1
            self._append_history(reading)
            self._log(f"Reading: {pkt.systolic}/{pkt.diastolic} mmHg, pulse {pkt.pulse} bpm  (raw {pkt.raw_hex})")
            self.set_step("result", f"{pkt.systolic}/{pkt.diastolic} mmHg · {pkt.pulse} bpm")
            for cb in self.on_reading:
                try:
                    cb(reading)
                except Exception:
                    log.exception("reading callback")
        elif isinstance(pkt, RawFrame):
            st.unknown_frames += 1
            self._log(f"Unrecognized frame type 0x{pkt.frame_type:02x}: {pkt.raw_hex}")
            self._broadcast_status()

    def handle_frame_threadsafe(self, pkt, source: str):
        self.loop.call_soon_threadsafe(self.handle_frame, pkt, source)

    # ------------------------------------------------------------ history
    def _append_history(self, r: Reading):
        try:
            with open(self.history_path, "a") as f:
                f.write(json.dumps(asdict(r)) + "\n")
        except Exception:
            log.exception("failed to append history")

    def list_history(self, limit: int = 200) -> list[dict]:
        if not os.path.exists(self.history_path):
            return []
        rows = []
        with open(self.history_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except Exception:
                        pass
        rows.sort(key=lambda r: r["ts"], reverse=True)
        return rows[:limit]

    # ------------------------------------------------------------ fan-out
    def _broadcast_status(self):
        msg = json.dumps({"type": "status", "data": self.snapshot()})
        for cb in self.on_status_change:
            try:
                cb(self.status)
            except Exception:
                log.exception("status callback")
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
