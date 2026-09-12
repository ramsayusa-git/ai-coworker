"""Local SQLite store for blood-pressure readings.

Lives in the add-on's /share data dir so it survives add-on updates,
rebuilds and Home Assistant restarts, and can be copied out or opened with
any sqlite client. All writes are tiny and synchronous; WAL keeps the
reader (the dashboard) from ever blocking the writer (the BLE source).

Schema
------
readings(id, ts, systolic, diastolic, pulse, map_calc, category, source,
         raw_hex, note)
    One row per completed measurement. `ts` is a unix timestamp (float).
    `map_calc` is the derived mean arterial pressure, `category` the AHA
    bucket at insert time — both stored so history stays meaningful even
    if the classification thresholds are ever changed.

frames(id, ts, frame_type, raw_hex)
    Every unrecognised notification frame, kept for protocol work. This is
    how the remaining flag bytes and the checksum will eventually be
    decoded — see DOCS.md "Known limitations".
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
import time

log = logging.getLogger("store")

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        REAL    NOT NULL,
    systolic  INTEGER NOT NULL,
    diastolic INTEGER NOT NULL,
    pulse     INTEGER,
    map_calc  REAL,
    category  TEXT,
    source    TEXT,
    raw_hex   TEXT,
    note      TEXT
);
CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts DESC);

CREATE TABLE IF NOT EXISTS frames (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         REAL NOT NULL,
    frame_type INTEGER,
    raw_hex    TEXT
);
CREATE INDEX IF NOT EXISTS idx_frames_ts ON frames(ts DESC);
"""

# AHA / ACC 2017 categories. Order matters — first match wins, checked from
# most severe down.
CATEGORIES = [
    ("crisis",       180, 120),
    ("stage2",       140, 90),
    ("stage1",       130, 80),
    ("elevated",     120, 0),
    ("normal",       0,   0),
]


def classify(systolic: int, diastolic: int) -> str:
    """AHA bucket for a reading. Either number alone can push the category
    up, which is how the guidance actually reads."""
    for name, sys_min, dia_min in CATEGORIES:
        if name == "elevated":
            # elevated is systolic-only (120-129 and diastolic < 80)
            if systolic >= sys_min and diastolic < 80:
                return name
            continue
        if name == "normal":
            return name
        if systolic >= sys_min or (dia_min and diastolic >= dia_min):
            return name
    return "normal"


def mean_arterial(systolic: int, diastolic: int) -> float:
    return round(diastolic + (systolic - diastolic) / 3.0, 1)


class Store:
    def __init__(self, data_dir: str, filename: str = "bp_monitor.db"):
        os.makedirs(data_dir, exist_ok=True)
        self.path = os.path.join(data_dir, filename)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.executescript(SCHEMA)
            self._conn.commit()
        log.info("SQLite store at %s", self.path)

    # ------------------------------------------------------------ writes
    def add_reading(self, ts: float, systolic: int, diastolic: int,
                    pulse: int | None, source: str, raw_hex: str = "") -> int:
        cat = classify(systolic, diastolic)
        mp = mean_arterial(systolic, diastolic)
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO readings (ts, systolic, diastolic, pulse, map_calc,"
                " category, source, raw_hex) VALUES (?,?,?,?,?,?,?,?)",
                (ts, systolic, diastolic, pulse, mp, cat, source, raw_hex))
            self._conn.commit()
            return int(cur.lastrowid)

    def add_frame(self, ts: float, frame_type: int, raw_hex: str):
        with self._lock:
            self._conn.execute(
                "INSERT INTO frames (ts, frame_type, raw_hex) VALUES (?,?,?)",
                (ts, frame_type, raw_hex))
            self._conn.commit()

    def delete_reading(self, rid: int) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM readings WHERE id=?", (rid,))
            self._conn.commit()
            return cur.rowcount > 0

    # ------------------------------------------------------------ reads
    def list_readings(self, limit: int = 50, offset: int = 0) -> dict:
        with self._lock:
            total = self._conn.execute(
                "SELECT COUNT(*) AS n FROM readings").fetchone()["n"]
            rows = self._conn.execute(
                "SELECT * FROM readings ORDER BY ts DESC LIMIT ? OFFSET ?",
                (limit, offset)).fetchall()
        return {"total": total, "limit": limit, "offset": offset,
                "rows": [dict(r) for r in rows]}

    def trend(self, days: int = 30, limit: int = 400) -> list[dict]:
        """Oldest-first series for charting."""
        since = time.time() - days * 86400
        with self._lock:
            rows = self._conn.execute(
                "SELECT ts, systolic, diastolic, pulse, category FROM readings"
                " WHERE ts >= ? ORDER BY ts DESC LIMIT ?",
                (since, limit)).fetchall()
        return [dict(r) for r in reversed(rows)]

    def stats(self) -> dict:
        def agg(since: float | None) -> dict:
            q = ("SELECT COUNT(*) n, AVG(systolic) sys, AVG(diastolic) dia,"
                 " AVG(pulse) pul, MIN(systolic) sys_min, MAX(systolic) sys_max,"
                 " MIN(diastolic) dia_min, MAX(diastolic) dia_max FROM readings")
            args: tuple = ()
            if since is not None:
                q += " WHERE ts >= ?"
                args = (since,)
            r = self._conn.execute(q, args).fetchone()
            out = {"count": r["n"]}
            for key, col in (("systolic", "sys"), ("diastolic", "dia"), ("pulse", "pul")):
                out[key] = round(r[col], 1) if r[col] is not None else None
            out["systolic_min"], out["systolic_max"] = r["sys_min"], r["sys_max"]
            out["diastolic_min"], out["diastolic_max"] = r["dia_min"], r["dia_max"]
            return out

        now = time.time()
        with self._lock:
            all_time = agg(None)
            week = agg(now - 7 * 86400)
            month = agg(now - 30 * 86400)
            last = self._conn.execute(
                "SELECT * FROM readings ORDER BY ts DESC LIMIT 1").fetchone()
            by_cat = self._conn.execute(
                "SELECT category, COUNT(*) n FROM readings GROUP BY category").fetchall()
            frames = self._conn.execute(
                "SELECT COUNT(*) n FROM frames").fetchone()["n"]
        return {"all_time": all_time, "week": week, "month": month,
                "last": dict(last) if last else None,
                "by_category": {r["category"]: r["n"] for r in by_cat},
                "unknown_frames": frames,
                "db_path": self.path,
                "db_bytes": os.path.getsize(self.path) if os.path.exists(self.path) else 0}

    def csv(self) -> str:
        with self._lock:
            rows = self._conn.execute(
                "SELECT ts, systolic, diastolic, pulse, map_calc, category,"
                " source, raw_hex FROM readings ORDER BY ts DESC").fetchall()
        out = ["timestamp,iso_time,systolic,diastolic,pulse,map,category,source,raw_hex"]
        for r in rows:
            iso = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(r["ts"]))
            out.append(",".join(str(x if x is not None else "") for x in (
                round(r["ts"], 3), iso, r["systolic"], r["diastolic"], r["pulse"],
                r["map_calc"], r["category"], r["source"], r["raw_hex"])))
        return "\n".join(out) + "\n"

    # ------------------------------------------------------------ migration
    def import_jsonl(self, path: str) -> int:
        """One-time import of the pre-SQLite history.jsonl, if present."""
        if not os.path.exists(path):
            return 0
        import json
        added = 0
        with self._lock:
            existing = {round(r["ts"], 1) for r in self._conn.execute(
                "SELECT ts FROM readings").fetchall()}
        try:
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        d = json.loads(line)
                    except Exception:
                        continue
                    if round(float(d.get("ts", 0)), 1) in existing:
                        continue
                    self.add_reading(float(d["ts"]), int(d["systolic"]),
                                     int(d["diastolic"]), d.get("pulse"),
                                     "import", d.get("raw_hex", ""))
                    added += 1
        except Exception:
            log.exception("jsonl import failed")
        if added:
            log.info("imported %d readings from %s", added, path)
            try:
                os.rename(path, path + ".imported")
            except Exception:
                pass
        return added
