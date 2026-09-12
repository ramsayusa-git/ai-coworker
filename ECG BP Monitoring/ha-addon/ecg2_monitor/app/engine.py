"""Central engine: guided-step state machine, sample processing, session
history in SQLite, optional raw recording, and fan-out to WebSocket clients
/ MQTT.

Guided steps (what the UI walks the user through, driven by real state):
  wake      - waiting for the device to advertise (user must press/wear it)
  scanning  - BLE scanner running
  connecting- GATT connect in progress
  checking  - reading device info / battery / subscribing
  contact   - connected, waiting for skin contact
  signal    - contact made, collecting a few seconds and checking quality
  live      - streaming, HR locked
  mqtt_wait - (MQTT source) waiting for the PC bridge to publish
  error     - last attempt failed; will retry

History
-------
Every wear is recorded automatically: reaching `live` opens a session row in
the local SQLite database, an HR/RR/quality sample is written every 2 s, and
the session is closed with a summary when the stream stops. Nothing has to
be started or stopped by hand. Full-resolution waveform CSV capture stays
opt-in via the Home Assistant "Recording" switch, because it is ~530
samples/s and only occasionally wanted.
"""
from __future__ import annotations

import asyncio
import csv
import json
import logging
import os
import time
from dataclasses import dataclass, field, asdict

from dsp import EcgFilter, QrsDetector, SignalQuality
from protocol import EcgPacket, ContactPacket, NOMINAL_FS, SAMPLES_PER_PACKET
from store import Store

log = logging.getLogger("engine")

STEP_ORDER = ["wake", "scanning", "connecting", "checking", "contact", "signal", "live"]
STEP_TEXT = {
    "idle":       ("Idle", "Waiting for the Bluetooth source to start."),
    "wake":       ("Turn on the device", "Press the button on the ecg2 or put it on. It only advertises for a few seconds after waking — do this now."),
    "scanning":   ("Scanning for ecg2", "Looking for the device over Bluetooth. Keep it within 2 m of the Home Assistant box."),
    "connecting": ("Connecting", "Device found — opening the Bluetooth link."),
    "checking":   ("Checking device", "Reading model, firmware and battery; subscribing to the heart-rate stream."),
    "contact":    ("Waiting for skin contact", "Connected. Place the electrodes on your skin (both contacts). The stream starts by itself."),
    "signal":     ("Checking signal", "Contact detected — hold still for a few seconds while the signal is checked."),
    "live":       ("Live", "Streaming. This wear is being recorded to the local history database."),
    "mqtt_wait":  ("Waiting for PC bridge", "No local Bluetooth stream. Start ecg_bridge.py on the PC (or wake the device) — packets will appear here automatically."),
    "error":      ("Connection lost", "Retrying. If the device went to sleep, press its button again."),
}

HR_LOG_INTERVAL = 2.0      # seconds between stored HR samples
SESSION_IDLE_CLOSE = 20.0  # close a session this long after the stream stops


@dataclass
class Status:
    step: str = "idle"
    step_index: int = -1
    title: str = ""
    hint: str = ""
    detail: str = ""
    source: str = "none"          # ble | mqtt | replay | none
    connected: bool = False
    contact: bool = False
    hr: float | None = None
    hr_device: int | None = None
    rr_ms: float | None = None
    battery: int | None = None
    model: str = ""
    firmware: str = ""
    hardware: str = ""
    address: str = ""
    quality: str = "warming"
    quality_score: float = 0.0
    fs: float = NOMINAL_FS
    packets: int = 0
    dropped: int = 0
    recording: bool = False
    recording_file: str = ""
    recording_seconds: float = 0.0
    session_id: int | None = None
    session_seconds: float = 0.0
    profile_id: int | None = None
    profile_name: str = ""
    hr_raw: float | None = None
    calibrated: bool = False
    calibration: dict = field(default_factory=dict)
    uptime_s: float = 0.0
    last_packet_age: float | None = None
    attempts: int = 0
    log: list = field(default_factory=list)


class Engine:
    def __init__(self, data_dir: str, mains_hz: int = 50,
                 loop: asyncio.AbstractEventLoop | None = None):
        self.loop = loop or asyncio.get_event_loop()
        self.data_dir = data_dir
        self.sessions_dir = os.path.join(data_dir, "sessions")
        os.makedirs(self.sessions_dir, exist_ok=True)
        self.mains_hz = mains_hz
        self.store = Store(data_dir)
        self.status = Status()
        self.started = time.time()
        self.clients: set = set()          # aiohttp WebSocketResponse
        self.on_status_change = []          # callables(status)
        self.on_beat = []                   # callables(hr)
        self._filter = EcgFilter(NOMINAL_FS, mains_hz)
        self._qrs = QrsDetector(NOMINAL_FS)
        self._sq = SignalQuality(NOMINAL_FS)
        self._last_seq: int | None = None
        self._last_packet_t: float | None = None
        self._signal_started: float | None = None
        self._pending: list[list] = []      # [raw, filt] pairs awaiting broadcast
        self._pending_beats: int = 0
        self._rec_file = None
        self._rec_writer = None
        self._rec_started: float | None = None
        self._rec_index = 0
        self._active_source: str = "none"
        self._active_source_t: float = 0.0
        self.control_source_ble = None
        self._history: list = []            # last ~10 s filtered samples
        self._session_id: int | None = None
        self._session_started: float | None = None
        self._session_samples: int = 0
        self._last_hr_log: float = 0.0
        self._hr_offset: float = 0.0
        self.refresh_calibration()

    def refresh_calibration(self):
        """Cache the active profile's HR offset — the beat path reads it far
        too often to hit the database each time."""
        try:
            prof = self.store.active_profile()
            cal = self.store.calibration(prof["id"] if prof else None)
            self._hr_offset = float(cal.get("hr", 0) or 0)
            self.status.calibration = cal
            self.status.calibrated = bool(self._hr_offset)
            self.status.profile_id = prof["id"] if prof else None
            self.status.profile_name = prof["name"] if prof else ""
        except Exception:
            log.exception("failed to refresh calibration")

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
                st.contact = False
                st.hr = None
                st.hr_device = None
                st.rr_ms = None
                st.quality = "warming"
                self._reset_dsp()
                self._close_session("link lost")
            elif step == "live":
                self._open_session()
            self._broadcast_status()

    def set_device_info(self, **kw):
        for k, v in kw.items():
            if v is not None:
                setattr(self.status, k, v)
        self._broadcast_status()

    def set_battery(self, level: int | None):
        if level is not None and level != self.status.battery:
            self.status.battery = level
            self._broadcast_status()

    def snapshot(self) -> dict:
        st = self.status
        st.uptime_s = round(time.time() - self.started, 1)
        st.last_packet_age = round(time.time() - self._last_packet_t, 2) if self._last_packet_t else None
        st.recording_seconds = round(time.time() - self._rec_started, 1) if self._rec_started else 0.0
        st.session_seconds = round(time.time() - self._session_started, 1) if self._session_started else 0.0
        st.session_id = self._session_id
        st.source = self._active_source
        return asdict(st)

    def set_active_profile(self, pid):
        ok = self.store.set_active_profile(pid)
        self.refresh_calibration()
        self.reattribute_open_session()
        self._broadcast_status()
        self._broadcast_db()
        return ok

    def reattribute_open_session(self):
        """If a wear is already in progress when the profile changes — or when
        the first profile is created mid-session — move the open session to it.
        Otherwise the live view would show one person's calibrated heart rate
        while the stored session belonged to nobody."""
        if self._session_id is None:
            return
        try:
            prof = self.store.active_profile()
            pid = prof["id"] if prof else None
            self.store.assign_session(self._session_id, pid)
            self._log(f"Session #{self._session_id} now recording for "
                      f"{prof['name'] if prof else 'nobody'}")
        except Exception:
            log.exception("failed to re-attribute open session")

    # ------------------------------------------------------------ sources
    def source_claims(self, name: str) -> bool:
        """A source calls this before handing over packets. BLE always wins;
        MQTT is accepted only if BLE has been silent for 5 s."""
        now = time.time()
        if name == self._active_source:
            self._active_source_t = now
            return True
        if name == "ble" or self._active_source == "none" or now - self._active_source_t > 5:
            if self._active_source != name:
                self._log(f"Active source: {name}")
            self._active_source = name
            self._active_source_t = now
            self._reset_dsp()
            return True
        return False

    def source_released(self, name: str):
        if self._active_source == name:
            self._active_source = "none"

    # ------------------------------------------------------------ sessions
    def _open_session(self):
        if self._session_id is not None:
            return
        try:
            prof = None
            try:
                prof = self.store.active_profile()
            except Exception:
                log.exception("failed to read active profile")
            self.status.profile_id = prof["id"] if prof else None
            self.status.profile_name = prof["name"] if prof else ""
            self._session_id = self.store.start_session(
                self._active_source, self.status.battery,
                profile_id=prof["id"] if prof else None)
            self._session_started = time.time()
            self._session_samples = 0
            self._last_hr_log = 0.0
            self._log(f"History session #{self._session_id} started")
            self._broadcast_db()
        except Exception:
            log.exception("failed to open session")

    def _close_session(self, why: str = ""):
        if self._session_id is None:
            return
        sid = self._session_id
        self._session_id = None
        self._session_started = None
        try:
            row = self.store.end_session(sid, self._session_samples,
                                         self.status.recording_file or None)
            if row:
                self._log(f"History session #{sid} closed"
                          + (f" ({why})" if why else "")
                          + f" — {row.get('seconds', 0)} s"
                          + (f", avg HR {row['hr_avg']} bpm" if row.get("hr_avg") else ""))
            self._broadcast_db()
        except Exception:
            log.exception("failed to close session")

    def _maybe_log_hr(self):
        if self._session_id is None:
            return
        now = time.time()
        if now - self._last_hr_log < HR_LOG_INTERVAL:
            return
        self._last_hr_log = now
        try:
            # store the RAW heart rate; calibration is applied on read
            self.store.add_hr_sample(self._session_id, self.status.hr_raw,
                                     self.status.rr_ms, self.status.quality,
                                     self.status.quality_score)
        except Exception:
            log.exception("failed to store HR sample")

    # ------------------------------------------------------------ packets
    def _reset_dsp(self):
        self._filter.reset()
        self._qrs.reset()
        self._sq = SignalQuality(NOMINAL_FS)
        self._last_seq = None
        self._signal_started = None

    def handle_packet(self, pkt, source: str):
        """Called from any source (thread-safe wrapper below)."""
        st = self.status
        self._last_packet_t = time.time()
        if isinstance(pkt, ContactPacket):
            st.hr_device = pkt.hr or None
            if st.contact != pkt.contact:
                st.contact = pkt.contact
                if not pkt.contact and st.step in ("signal", "live"):
                    self.set_step("contact", "Contact lost")
                else:
                    self._broadcast_status()
            return
        if not isinstance(pkt, EcgPacket):
            return
        st.packets += 1
        if self._last_seq is not None:
            gap = (pkt.seq - self._last_seq) & 0xFFFF
            if gap > 1 and gap < 1000:
                st.dropped += gap - 1
        self._last_seq = pkt.seq
        if not st.contact:
            st.contact = True
        if st.step in ("contact", "checking", "connecting", "mqtt_wait", "scanning",
                       "wake", "idle", "error"):
            self.set_step("signal")
            self._signal_started = time.time()

        beats = 0
        for s in pkt.samples:
            self._sq.push(s)
            f = self._filter.process(float(s))
            if self._qrs.process(f):
                beats += 1
            self._pending.append([s, round(f, 1)])
            self._session_samples += 1
            if self._rec_writer:
                self._rec_writer.writerow([self._rec_index,
                                           f"{self._rec_index / NOMINAL_FS:.4f}",
                                           pkt.seq, s, f"{f:.1f}"])
                self._rec_index += 1
        if beats:
            self._pending_beats += beats
            # hr_raw is what the detector measured and what gets stored;
            # st.hr is the calibrated value shown in the UI and published to HA.
            raw = round(self._qrs.hr_bpm, 1) if self._qrs.hr_bpm else None
            st.hr_raw = raw
            st.hr = (max(0.0, round(raw + self._hr_offset, 1))
                     if raw is not None else None)
            st.calibrated = bool(self._hr_offset)
            # RR is a measured interval, so it stays uncalibrated
            st.rr_ms = round(60000 / self._qrs.hr_bpm) if self._qrs.hr_bpm else None
            for cb in self.on_beat:
                try:
                    cb(st.hr)
                except Exception:
                    log.exception("beat callback")

        if st.step == "signal":
            q, score = self._sq.assess()
            st.quality, st.quality_score = q, score
            elapsed = time.time() - (self._signal_started or time.time())
            if elapsed >= 4 and q in ("good", "fair") and st.hr:
                self.set_step("live", f"Signal {q}, HR {st.hr:.0f} bpm")
            elif elapsed >= 12:
                self.set_step("live", f"Signal {q} — check electrode contact")
        elif st.step == "live":
            if st.packets % 66 == 0:
                st.quality, st.quality_score = self._sq.assess()
            self._maybe_log_hr()

    def handle_packet_threadsafe(self, pkt, source: str):
        self.loop.call_soon_threadsafe(self.handle_packet, pkt, source)

    # ------------------------------------------------------------ recording
    def start_recording(self) -> str:
        """Full-resolution waveform capture. Driven by the Home Assistant
        "Recording" switch — the dashboard has no button for it."""
        if self._rec_writer:
            return self.status.recording_file
        name = time.strftime("ecg_%Y%m%d_%H%M%S.csv")
        path = os.path.join(self.sessions_dir, name)
        self._rec_file = open(path, "w", newline="")
        self._rec_writer = csv.writer(self._rec_file)
        self._rec_writer.writerow(["idx", "t_s", "seq", "raw", "filtered"])
        self._rec_index = 0
        self._rec_started = time.time()
        self.status.recording = True
        self.status.recording_file = name
        self._log(f"Waveform capture started: {name}")
        self._broadcast_status()
        return name

    def stop_recording(self) -> str:
        name = self.status.recording_file
        if self._rec_file:
            self._rec_file.close()
            meta = {
                "file": name,
                "samples": self._rec_index,
                "seconds": round(self._rec_index / NOMINAL_FS, 2),
                "fs": NOMINAL_FS,
                "hr_last": self.status.hr,
                "battery": self.status.battery,
                "source": self._active_source,
                "ended": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            with open(os.path.join(self.sessions_dir,
                                  name.replace(".csv", ".json")), "w") as f:
                json.dump(meta, f)
            self._log(f"Waveform capture stopped: {name} ({meta['seconds']} s)")
        self._rec_file = self._rec_writer = None
        self._rec_started = None
        self.status.recording = False
        self.status.recording_file = ""
        self._broadcast_status()
        return name

    # ------------------------------------------------------------ history
    def list_sessions(self, limit: int = 25, offset: int = 0,
                      profile_id=None) -> dict:
        return self.store.list_sessions(limit, offset, profile_id)

    def session_trend(self, sid: int) -> list[dict]:
        return self.store.session_trend(sid)

    def stats(self, profile_id=None) -> dict:
        return self.store.stats(profile_id)

    def recent_hr(self, hours: int = 24, profile_id=None) -> list[dict]:
        return self.store.recent_hr(hours, profile_id=profile_id)

    def list_recordings(self) -> list[dict]:
        """Raw waveform CSV captures on disk (from the HA Recording switch)."""
        out = []
        for fn in sorted(os.listdir(self.sessions_dir), reverse=True):
            if not fn.endswith(".csv"):
                continue
            p = os.path.join(self.sessions_dir, fn)
            meta = {}
            mp = p.replace(".csv", ".json")
            if os.path.exists(mp):
                try:
                    meta = json.load(open(mp))
                except Exception:
                    pass
            out.append({"file": fn, "bytes": os.path.getsize(p),
                        "mtime": int(os.path.getmtime(p)), **meta})
        return out

    def delete_recording(self, fn: str) -> bool:
        if "/" in fn or not fn.endswith(".csv"):
            return False
        p = os.path.join(self.sessions_dir, fn)
        ok = False
        for q in (p, p.replace(".csv", ".json")):
            if os.path.exists(q):
                os.remove(q)
                ok = True
        return ok

    def delete_session(self, sid: int) -> bool:
        ok = self.store.delete_session(sid)
        if ok:
            self._broadcast_db()
        return ok

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
        """Flush pending samples to WS clients ~20x/s; stream watchdog; and
        close a history session once the stream has really stopped."""
        tick = 0
        while True:
            await asyncio.sleep(0.05)
            tick += 1
            if tick % 20 == 0:
                st = self.status
                stale = self._last_packet_t and time.time() - self._last_packet_t
                if st.step in ("signal", "live") and stale and stale > 2.5:
                    if st.connected:
                        st.contact = False
                        self.set_step("contact", "Stream stopped — contact lost?")
                    else:
                        self.set_step("error", "Stream stopped")
                elif (st.step in ("signal", "live") and self.clients) or tick % 600 == 0:
                    self._broadcast_status()   # counters/uptime; 30 s MQTT heartbeat
                # a session outlives brief contact losses, but not a real stop
                if (self._session_id is not None and stale
                        and stale > SESSION_IDLE_CLOSE):
                    self._close_session("stream idle")
            if not self._pending:
                continue
            batch, self._pending = self._pending, []
            beats, self._pending_beats = self._pending_beats, 0
            self._history.extend(batch)
            del self._history[:-int(NOMINAL_FS * 10)]
            if self.clients:
                self._send_all(json.dumps({"type": "ecg", "fs": NOMINAL_FS,
                                           "beats": beats, "hr": self.status.hr,
                                           "s": batch}))

    def history_message(self) -> str:
        """Recent waveform, so a newly opened dashboard isn't blank."""
        return json.dumps({"type": "ecg", "fs": NOMINAL_FS, "beats": 0,
                           "hr": self.status.hr,
                           "s": self._history[-int(NOMINAL_FS * 6):],
                           "history": True})

    def db_message(self) -> str:
        """Stored history: session list, HR trend, stats and the profile list,
        scoped to the active profile — that is what the dashboard shows."""
        try:
            prof = self.store.active_profile()
            pid = prof["id"] if prof else None
            return json.dumps({"type": "db",
                               "stats": self.store.stats(pid),
                               "profiles": self.store.list_profiles(),
                               "sessions": self.store.list_sessions(10, 0, pid)["rows"],
                               "trend": self.store.recent_hr(24, profile_id=pid)})
        except Exception:
            log.exception("db_message")
            return json.dumps({"type": "db", "stats": {}, "profiles": [],
                               "sessions": [], "trend": []})

    def _broadcast_db(self):
        try:
            self._send_all(self.db_message())
        except Exception:
            log.exception("db broadcast")
