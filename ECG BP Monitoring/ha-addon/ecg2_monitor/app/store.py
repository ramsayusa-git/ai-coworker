"""Local SQLite store for ECG sessions and heart-rate history.

Lives in the add-on's /share data dir so it survives add-on updates,
rebuilds and Home Assistant restarts, and can be opened with any sqlite
client.

Why not store the raw waveform here: the ecg2 streams ~530 samples/s, so a
ten-minute wear is ~320 000 samples. Putting that in SQLite would grow the
file by megabytes per session for data nobody queries. Instead:

  sessions     one row per wear (start, end, duration, HR summary, quality)
  hr_samples   one row every 2 s of a session — HR, RR interval, quality

That gives a real, queryable history of every reading with a bounded size
(~1 800 rows/hour), and the full-resolution waveform is still available as
a CSV capture when the Home Assistant "Recording" switch is turned on.

Schema
------
sessions(id, started, ended, seconds, samples, hr_avg, hr_min, hr_max,
         rr_avg, quality, source, battery, csv_file, note)
hr_samples(id, session_id, ts, hr, rr_ms, quality, quality_score)
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
import time

log = logging.getLogger("store")

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    started  REAL NOT NULL,
    ended    REAL,
    seconds  REAL,
    samples  INTEGER DEFAULT 0,
    hr_avg   REAL,
    hr_min   REAL,
    hr_max   REAL,
    rr_avg   REAL,
    quality  TEXT,
    source   TEXT,
    battery  INTEGER,
    csv_file TEXT,
    note     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started DESC);

CREATE TABLE IF NOT EXISTS hr_samples (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER NOT NULL,
    ts            REAL NOT NULL,
    hr            REAL,
    rr_ms         REAL,
    quality       TEXT,
    quality_score REAL
);
CREATE INDEX IF NOT EXISTS idx_hr_session ON hr_samples(session_id, ts);
"""


class Store:
    def __init__(self, data_dir: str, filename: str = "ecg2_monitor.db"):
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
        self._close_orphans()
        log.info("SQLite store at %s", self.path)

    def _summary(self, session_id: int) -> dict:
        """HR aggregates for one session. Caller must hold the lock."""
        agg = self._conn.execute(
            "SELECT AVG(hr) a, MIN(hr) mn, MAX(hr) mx, AVG(rr_ms) rr, COUNT(*) n"
            " FROM hr_samples WHERE session_id=? AND hr IS NOT NULL",
            (session_id,)).fetchone()
        qual = self._conn.execute(
            "SELECT quality, COUNT(*) n FROM hr_samples WHERE session_id=?"
            " GROUP BY quality ORDER BY n DESC LIMIT 1", (session_id,)).fetchone()
        return {
            "hr_avg": round(agg["a"], 1) if agg["a"] else None,
            "hr_min": agg["mn"], "hr_max": agg["mx"],
            "rr_avg": round(agg["rr"], 1) if agg["rr"] else None,
            "quality": qual["quality"] if qual else None,
        }

    def _close_orphans(self):
        """A session left open by a crash or restart is closed from its last
        sample — with its HR summary filled in, so restart-closed sessions
        read the same as cleanly closed ones."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, started FROM sessions WHERE ended IS NULL").fetchall()
            for r in rows:
                last = self._conn.execute(
                    "SELECT MAX(ts) t FROM hr_samples WHERE session_id=?",
                    (r["id"],)).fetchone()["t"]
                end = last or r["started"]
                s = self._summary(r["id"])
                self._conn.execute(
                    "UPDATE sessions SET ended=?, seconds=?, hr_avg=?, hr_min=?,"
                    " hr_max=?, rr_avg=?, quality=?, note=? WHERE id=?",
                    (end, round(end - r["started"], 1), s["hr_avg"], s["hr_min"],
                     s["hr_max"], s["rr_avg"], s["quality"],
                     "closed automatically after add-on restart", r["id"]))
            if rows:
                self._conn.commit()
                log.info("closed %d orphaned session(s)", len(rows))

    # ------------------------------------------------------------ sessions
    def start_session(self, source: str, battery: int | None) -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO sessions (started, source, battery) VALUES (?,?,?)",
                (time.time(), source, battery))
            self._conn.commit()
            return int(cur.lastrowid)

    def add_hr_sample(self, session_id: int, hr: float | None, rr_ms: float | None,
                      quality: str, quality_score: float):
        with self._lock:
            self._conn.execute(
                "INSERT INTO hr_samples (session_id, ts, hr, rr_ms, quality,"
                " quality_score) VALUES (?,?,?,?,?,?)",
                (session_id, time.time(), hr, rr_ms, quality, quality_score))
            self._conn.commit()

    def end_session(self, session_id: int, samples: int = 0,
                    csv_file: str | None = None) -> dict | None:
        now = time.time()
        with self._lock:
            row = self._conn.execute("SELECT started FROM sessions WHERE id=?",
                                     (session_id,)).fetchone()
            if row is None:
                return None
            s = self._summary(session_id)
            self._conn.execute(
                "UPDATE sessions SET ended=?, seconds=?, samples=?, hr_avg=?,"
                " hr_min=?, hr_max=?, rr_avg=?, quality=?,"
                " csv_file=COALESCE(?, csv_file) WHERE id=?",
                (now, round(now - row["started"], 1), samples, s["hr_avg"],
                 s["hr_min"], s["hr_max"], s["rr_avg"], s["quality"],
                 csv_file, session_id))
            self._conn.commit()
            out = self._conn.execute("SELECT * FROM sessions WHERE id=?",
                                     (session_id,)).fetchone()
        return dict(out) if out else None

    def list_sessions(self, limit: int = 25, offset: int = 0) -> dict:
        with self._lock:
            total = self._conn.execute(
                "SELECT COUNT(*) n FROM sessions").fetchone()["n"]
            rows = self._conn.execute(
                "SELECT * FROM sessions ORDER BY started DESC LIMIT ? OFFSET ?",
                (limit, offset)).fetchall()
        return {"total": total, "limit": limit, "offset": offset,
                "rows": [dict(r) for r in rows]}

    def session_trend(self, session_id: int, limit: int = 600) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT ts, hr, rr_ms, quality, quality_score FROM hr_samples"
                " WHERE session_id=? ORDER BY ts LIMIT ?",
                (session_id, limit)).fetchall()
        return [dict(r) for r in rows]

    def delete_session(self, session_id: int) -> bool:
        with self._lock:
            self._conn.execute("DELETE FROM hr_samples WHERE session_id=?",
                               (session_id,))
            cur = self._conn.execute("DELETE FROM sessions WHERE id=?", (session_id,))
            self._conn.commit()
            return cur.rowcount > 0

    # ------------------------------------------------------------ overview
    def recent_hr(self, hours: int = 24, limit: int = 600) -> list[dict]:
        """HR across all sessions, for the dashboard's trend chart."""
        since = time.time() - hours * 3600
        with self._lock:
            rows = self._conn.execute(
                "SELECT ts, hr, quality FROM hr_samples WHERE ts >= ?"
                " AND hr IS NOT NULL ORDER BY ts DESC LIMIT ?",
                (since, limit)).fetchall()
        return [dict(r) for r in reversed(rows)]

    def stats(self) -> dict:
        now = time.time()

        def agg(since):
            q = ("SELECT COUNT(*) n, AVG(hr) a, MIN(hr) mn, MAX(hr) mx"
                 " FROM hr_samples WHERE hr IS NOT NULL")
            args: tuple = ()
            if since is not None:
                q += " AND ts >= ?"
                args = (since,)
            r = self._conn.execute(q, args).fetchone()
            return {"samples": r["n"],
                    "hr_avg": round(r["a"], 1) if r["a"] else None,
                    "hr_min": r["mn"], "hr_max": r["mx"]}

        with self._lock:
            all_time = agg(None)
            day = agg(now - 86400)
            week = agg(now - 7 * 86400)
            s = self._conn.execute(
                "SELECT COUNT(*) n, SUM(seconds) secs FROM sessions").fetchone()
            last = self._conn.execute(
                "SELECT * FROM sessions ORDER BY started DESC LIMIT 1").fetchone()
        return {"all_time": all_time, "day": day, "week": week,
                "sessions": s["n"], "total_seconds": round(s["secs"] or 0, 1),
                "last_session": dict(last) if last else None,
                "db_path": self.path,
                "db_bytes": os.path.getsize(self.path) if os.path.exists(self.path) else 0}

    def csv(self) -> str:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM sessions ORDER BY started DESC").fetchall()
        out = ["id,started_iso,ended_iso,seconds,hr_avg,hr_min,hr_max,rr_avg,"
               "quality,source,battery,csv_file"]
        for r in rows:
            def iso(t):
                return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t)) if t else ""
            out.append(",".join(str(x if x is not None else "") for x in (
                r["id"], iso(r["started"]), iso(r["ended"]), r["seconds"],
                r["hr_avg"], r["hr_min"], r["hr_max"], r["rr_avg"],
                r["quality"], r["source"], r["battery"], r["csv_file"])))
        return "\n".join(out) + "\n"
