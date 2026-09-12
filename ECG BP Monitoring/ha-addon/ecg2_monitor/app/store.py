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

# Tables first, then column migrations, then indexes — an index over a column a
# migration has not added yet would fail on a database created by an earlier
# version (CREATE TABLE IF NOT EXISTS won't add columns to an existing table).
SCHEMA_TABLES = """
CREATE TABLE IF NOT EXISTS profiles (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    note     TEXT,
    created  REAL NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    cal_hr   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER,
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

CREATE TABLE IF NOT EXISTS hr_samples (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER NOT NULL,
    ts            REAL NOT NULL,
    hr            REAL,
    rr_ms         REAL,
    quality       TEXT,
    quality_score REAL
);
"""

SCHEMA_INDEXES = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile_id, started DESC);
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
            self._conn.executescript(SCHEMA_TABLES)
            self._migrate()
            self._conn.executescript(SCHEMA_INDEXES)
            self._conn.commit()
        self._close_orphans()
        log.info("SQLite store at %s", self.path)

    def _migrate(self):
        """Add columns introduced after an earlier release. Caller holds the
        lock; SQLite has no 'ADD COLUMN IF NOT EXISTS', so check first."""
        cols = {r["name"] for r in
                self._conn.execute("PRAGMA table_info(sessions)").fetchall()}
        if "profile_id" not in cols:
            self._conn.execute("ALTER TABLE sessions ADD COLUMN profile_id INTEGER")
            log.info("migrated: sessions.profile_id added "
                     "(existing sessions stay unassigned)")
        pcols = {r["name"] for r in
                 self._conn.execute("PRAGMA table_info(profiles)").fetchall()}
        if "cal_hr" not in pcols:
            self._conn.execute(
                "ALTER TABLE profiles ADD COLUMN cal_hr INTEGER NOT NULL DEFAULT 0")
            log.info("migrated: profiles.cal_hr added")

    # ---------------------------------------------------------- calibration
    # The heart-rate offset is applied when a value is displayed or published,
    # never when it is stored: hr_samples always holds what the QRS detector
    # actually measured, so changing the offset later re-aligns the history
    # instead of baking one guess into the data.
    CAL_KEYS = ("hr",)
    CAL_LIMIT = 40          # bpm either way — a sanity bound, not a rule

    def calibration(self, profile_id=None) -> dict:
        with self._lock:
            if isinstance(profile_id, int):
                r = self._conn.execute("SELECT cal_hr FROM profiles WHERE id=?",
                                       (profile_id,)).fetchone()
                if r:
                    return {"hr": int(r["cal_hr"] or 0)}
            v = self._get_setting("cal_hr")
        try:
            return {"hr": int(v)} if v else {"hr": 0}
        except ValueError:
            return {"hr": 0}

    def set_calibration(self, profile_id, offsets: dict) -> dict:
        if "hr" not in offsets or offsets["hr"] is None:
            return self.calibration(profile_id)
        try:
            v = int(round(float(offsets["hr"])))
        except (TypeError, ValueError):
            return self.calibration(profile_id)
        v = max(-self.CAL_LIMIT, min(self.CAL_LIMIT, v))
        with self._lock:
            if isinstance(profile_id, int):
                self._conn.execute("UPDATE profiles SET cal_hr=? WHERE id=?",
                                   (v, profile_id))
            else:
                self._set_setting("cal_hr", str(v))
            self._conn.commit()
        log.info("HR calibration for profile %s -> %+d bpm", profile_id, v)
        return self.calibration(profile_id)

    def apply_calibration(self, hr, profile_id=None):
        """Raw HR in, calibrated HR out (never negative)."""
        if hr is None:
            return None
        off = self.calibration(profile_id)["hr"]
        return max(0, round(float(hr) + off, 1))

    def _cal_expr(self, alias: str = "s") -> str:
        """Calibrated HR expression: each sample shifted by its session's
        profile offset, falling back to the global one. The offsets are
        interpolated as literals — every one has been int()ed and clamped to
        +/-CAL_LIMIT before storage, and is re-int()ed here — which keeps the
        binding order manageable when the expression repeats in an aggregate."""
        g = int(self.calibration(None)["hr"])
        return f"MAX(0, h.hr + COALESCE({alias}.cal_hr, {g}))"

    # ------------------------------------------------------------ settings
    def _get_setting(self, key: str) -> str | None:
        r = self._conn.execute("SELECT value FROM settings WHERE key=?",
                               (key,)).fetchone()
        return r["value"] if r else None

    def _set_setting(self, key: str, value: str | None):
        if value is None:
            self._conn.execute("DELETE FROM settings WHERE key=?", (key,))
        else:
            self._conn.execute(
                "INSERT INTO settings (key, value) VALUES (?,?)"
                " ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))

    # ------------------------------------------------------------ profiles
    def list_profiles(self, include_archived: bool = False) -> list[dict]:
        q = ("SELECT p.*, COUNT(s.id) AS sessions, MAX(s.started) AS last_session,"
             " SUM(COALESCE(s.seconds, 0)) AS total_seconds"
             " FROM profiles p LEFT JOIN sessions s ON s.profile_id = p.id")
        if not include_archived:
            q += " WHERE p.archived = 0"
        q += " GROUP BY p.id ORDER BY p.name COLLATE NOCASE"
        with self._lock:
            rows = self._conn.execute(q).fetchall()
            active = self._get_setting("active_profile")
        active_id = int(active) if active and active.isdigit() else None
        out = []
        for r in rows:
            d = dict(r)
            d["active"] = (d["id"] == active_id)
            out.append(d)
        return out

    def add_profile(self, name: str, note: str = "") -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("a profile needs a name")
        name = name[:60]
        with self._lock:
            existing = self._conn.execute(
                "SELECT * FROM profiles WHERE name = ? COLLATE NOCASE",
                (name,)).fetchone()
            if existing:
                if existing["archived"]:
                    self._conn.execute(
                        "UPDATE profiles SET archived=0, note=? WHERE id=?",
                        (note or existing["note"], existing["id"]))
                    self._conn.commit()
                    return dict(self._conn.execute(
                        "SELECT * FROM profiles WHERE id=?",
                        (existing["id"],)).fetchone())
                raise ValueError(f"a profile called {name!r} already exists")
            cur = self._conn.execute(
                "INSERT INTO profiles (name, note, created) VALUES (?,?,?)",
                (name, note or None, time.time()))
            pid = int(cur.lastrowid)
            if not self._get_setting("active_profile"):
                self._set_setting("active_profile", str(pid))
            self._conn.commit()
            return dict(self._conn.execute("SELECT * FROM profiles WHERE id=?",
                                          (pid,)).fetchone())

    def update_profile(self, pid: int, name: str | None = None,
                       note: str | None = None) -> bool:
        with self._lock:
            sets, args = [], []
            if name is not None and name.strip():
                sets.append("name=?")
                args.append(name.strip()[:60])
            if note is not None:
                sets.append("note=?")
                args.append(note or None)
            if not sets:
                return False
            args.append(pid)
            try:
                cur = self._conn.execute(
                    f"UPDATE profiles SET {', '.join(sets)} WHERE id=?", args)
            except sqlite3.IntegrityError:
                raise ValueError("another profile already uses that name")
            self._conn.commit()
            return cur.rowcount > 0

    def delete_profile(self, pid: int) -> bool:
        """Removes the profile but keeps its sessions, unassigned — silently
        deleting someone's recorded wears would be worse than orphaning them."""
        with self._lock:
            self._conn.execute("UPDATE sessions SET profile_id=NULL"
                               " WHERE profile_id=?", (pid,))
            cur = self._conn.execute("DELETE FROM profiles WHERE id=?", (pid,))
            if self._get_setting("active_profile") == str(pid):
                nxt = self._conn.execute(
                    "SELECT id FROM profiles WHERE archived=0"
                    " ORDER BY name COLLATE NOCASE LIMIT 1").fetchone()
                self._set_setting("active_profile", str(nxt["id"]) if nxt else None)
            self._conn.commit()
            return cur.rowcount > 0

    def active_profile(self) -> dict | None:
        with self._lock:
            v = self._get_setting("active_profile")
            if not v or not v.isdigit():
                return None
            r = self._conn.execute("SELECT * FROM profiles WHERE id=?",
                                   (int(v),)).fetchone()
        return dict(r) if r else None

    def set_active_profile(self, pid: int | None) -> bool:
        with self._lock:
            if pid is not None:
                if not self._conn.execute("SELECT id FROM profiles WHERE id=?",
                                          (pid,)).fetchone():
                    return False
            self._set_setting("active_profile", str(pid) if pid is not None else None)
            self._conn.commit()
            return True

    def assign_session(self, sid: int, pid: int | None) -> bool:
        with self._lock:
            cur = self._conn.execute("UPDATE sessions SET profile_id=? WHERE id=?",
                                     (pid, sid))
            self._conn.commit()
            return cur.rowcount > 0

    @staticmethod
    def _profile_clause(profile_id, col: str = "s.profile_id"):
        """profile_id: None = everything, "none" = unassigned only,
        an int = that profile."""
        if profile_id is None:
            return "", ()
        if profile_id == "none":
            return f" WHERE {col} IS NULL", ()
        return f" WHERE {col} = ?", (int(profile_id),)

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
    def start_session(self, source: str, battery: int | None,
                      profile_id: int | None = None) -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO sessions (started, source, battery, profile_id)"
                " VALUES (?,?,?,?)", (time.time(), source, battery, profile_id))
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

    def list_sessions(self, limit: int = 25, offset: int = 0,
                      profile_id=None) -> dict:
        where, args = self._profile_clause(profile_id)
        g = int(self.calibration(None)["hr"])
        off = f"COALESCE(p.cal_hr, {g})"
        with self._lock:
            total = self._conn.execute(
                "SELECT COUNT(*) n FROM sessions s" + where, args).fetchone()["n"]
            rows = self._conn.execute(
                "SELECT s.*, p.name AS profile_name,"
                f" {off} AS hr_offset,"
                f" CASE WHEN s.hr_avg IS NULL THEN NULL"
                f"  ELSE MAX(0, s.hr_avg + {off}) END AS cal_avg,"
                f" CASE WHEN s.hr_min IS NULL THEN NULL"
                f"  ELSE MAX(0, s.hr_min + {off}) END AS cal_min,"
                f" CASE WHEN s.hr_max IS NULL THEN NULL"
                f"  ELSE MAX(0, s.hr_max + {off}) END AS cal_max"
                " FROM sessions s LEFT JOIN profiles p ON p.id = s.profile_id"
                + where + " ORDER BY s.started DESC LIMIT ? OFFSET ?",
                args + (limit, offset)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["raw_hr_avg"], d["raw_hr_min"], d["raw_hr_max"] = \
                d["hr_avg"], d["hr_min"], d["hr_max"]
            d["hr_avg"] = d.pop("cal_avg")
            d["hr_min"] = d.pop("cal_min")
            d["hr_max"] = d.pop("cal_max")
            d["calibrated"] = bool(d["hr_offset"])
            out.append(d)
        return {"total": total, "limit": limit, "offset": offset,
                "profile_id": profile_id, "rows": out}

    def session_trend(self, session_id: int, limit: int = 600) -> list[dict]:
        expr = self._cal_expr("p")
        with self._lock:
            rows = self._conn.execute(
                f"SELECT h.ts, {expr} AS hr, h.rr_ms, h.quality, h.quality_score"
                " FROM hr_samples h"
                " LEFT JOIN sessions s ON s.id = h.session_id"
                " LEFT JOIN profiles p ON p.id = s.profile_id"
                " WHERE h.session_id=? ORDER BY h.ts LIMIT ?",
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
    HR_JOIN = (" FROM hr_samples h LEFT JOIN sessions s ON s.id = h.session_id"
               " LEFT JOIN profiles p ON p.id = s.profile_id")

    def recent_hr(self, hours: int = 24, limit: int = 600,
                  profile_id=None) -> list[dict]:
        """Calibrated HR across sessions, for the dashboard's trend chart."""
        expr = self._cal_expr("p")
        where, args = self._profile_clause(profile_id)
        where = (where + " AND h.ts >= ? AND h.hr IS NOT NULL") if where \
            else " WHERE h.ts >= ? AND h.hr IS NOT NULL"
        args = args + (time.time() - hours * 3600,)
        with self._lock:
            rows = self._conn.execute(
                f"SELECT h.ts, {expr} AS hr, h.quality" + self.HR_JOIN + where
                + " ORDER BY h.ts DESC LIMIT ?", args + (limit,)).fetchall()
        return [dict(r) for r in reversed(rows)]

    def stats(self, profile_id=None) -> dict:
        now = time.time()
        expr = self._cal_expr("p")
        pwhere, pargs = self._profile_clause(profile_id)

        def agg(since):
            w = (pwhere + " AND h.hr IS NOT NULL") if pwhere \
                else " WHERE h.hr IS NOT NULL"
            args = pargs
            if since is not None:
                w += " AND h.ts >= ?"
                args = args + (since,)
            r = self._conn.execute(
                f"SELECT COUNT(*) n, AVG({expr}) a, MIN({expr}) mn, MAX({expr}) mx"
                + self.HR_JOIN + w, args).fetchone()
            return {"samples": r["n"],
                    "hr_avg": round(r["a"], 1) if r["a"] else None,
                    "hr_min": r["mn"], "hr_max": r["mx"]}

        with self._lock:
            all_time = agg(None)
            day = agg(now - 86400)
            week = agg(now - 7 * 86400)
            s = self._conn.execute(
                "SELECT COUNT(*) n, SUM(seconds) secs FROM sessions s" + pwhere,
                pargs).fetchone()
            unassigned = self._conn.execute(
                "SELECT COUNT(*) n FROM sessions WHERE profile_id IS NULL"
            ).fetchone()["n"]
        last_rows = self.list_sessions(1, 0, profile_id)["rows"]
        return {"all_time": all_time, "day": day, "week": week,
                "sessions": s["n"], "total_seconds": round(s["secs"] or 0, 1),
                "last_session": last_rows[0] if last_rows else None,
                "unassigned": unassigned, "profile_id": profile_id,
                "calibration": self.calibration(
                    profile_id if isinstance(profile_id, int) else None),
                "db_path": self.path,
                "db_bytes": os.path.getsize(self.path) if os.path.exists(self.path) else 0}

    def csv(self, profile_id=None) -> str:
        """Both calibrated and raw HR columns — the raw ones are what the QRS
        detector actually measured, which is what anyone auditing will want."""
        rows = self.list_sessions(100000, 0, profile_id)["rows"]
        out = ["id,profile,started_iso,ended_iso,seconds,hr_avg,hr_min,hr_max,"
               "raw_hr_avg,raw_hr_min,raw_hr_max,hr_offset,rr_avg,quality,"
               "source,battery,csv_file"]

        def iso(t):
            return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t)) if t else ""

        for r in rows:
            out.append(",".join(str(x if x is not None else "") for x in (
                r["id"], r["profile_name"] or "unassigned",
                iso(r["started"]), iso(r["ended"]), r["seconds"],
                r["hr_avg"], r["hr_min"], r["hr_max"],
                r["raw_hr_avg"], r["raw_hr_min"], r["raw_hr_max"], r["hr_offset"],
                r["rr_avg"], r["quality"], r["source"], r["battery"],
                r["csv_file"])))
        return "\n".join(out) + "\n"
