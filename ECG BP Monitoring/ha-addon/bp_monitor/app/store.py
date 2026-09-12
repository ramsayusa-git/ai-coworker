"""Local SQLite store for blood-pressure readings, organised by profile.

Lives in the add-on's /share data dir so it survives add-on updates,
rebuilds and Home Assistant restarts, and can be copied out or opened with
any sqlite client. All writes are tiny and synchronous; WAL keeps the
reader (the dashboard) from ever blocking the writer (the BLE source).

Schema
------
profiles(id, name, note, created, archived)
    Who a reading belongs to. One cuff is normally shared between people,
    so the dashboard keeps an *active* profile and every completed
    measurement is attributed to it. Deliberately minimal — a name and an
    optional note; no dates of birth or other personal details, because
    nothing here needs them.

settings(key, value)
    Small key/value bag. Holds `active_profile`.

readings(id, ts, profile_id, systolic, diastolic, pulse, map_calc,
         category, source, raw_hex, note)
    One row per completed measurement. `map_calc` is the derived mean
    arterial pressure and `category` the AHA bucket at insert time — both
    stored so history stays meaningful if the thresholds ever change.
    `profile_id` is NULL for readings taken before profiles existed, which
    the dashboard shows as "Unassigned" rather than guessing.

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

# Tables first, then the column migration, then the indexes. The order matters:
# on a database created before profiles existed, CREATE TABLE IF NOT EXISTS is a
# no-op, so `readings` still has no profile_id — and an index over that column
# would fail before the migration had a chance to add it.
SCHEMA_TABLES = """
CREATE TABLE IF NOT EXISTS profiles (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    note      TEXT,
    created   REAL NOT NULL,
    archived  INTEGER NOT NULL DEFAULT 0,
    cal_sys   INTEGER NOT NULL DEFAULT 0,
    cal_dia   INTEGER NOT NULL DEFAULT 0,
    cal_pulse INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS readings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         REAL    NOT NULL,
    profile_id INTEGER,
    systolic   INTEGER NOT NULL,
    diastolic  INTEGER NOT NULL,
    pulse      INTEGER,
    map_calc   REAL,
    category   TEXT,
    source     TEXT,
    raw_hex    TEXT,
    note       TEXT
);

CREATE TABLE IF NOT EXISTS frames (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         REAL NOT NULL,
    frame_type INTEGER,
    raw_hex    TEXT
);
"""

SCHEMA_INDEXES = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts DESC);
CREATE INDEX IF NOT EXISTS idx_readings_profile ON readings(profile_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_frames_ts ON frames(ts DESC);
"""

# AHA / ACC 2017 categories, checked from most severe down.
CATEGORIES = [
    ("crisis",   180, 120),
    ("stage2",   140, 90),
    ("stage1",   130, 80),
    ("elevated", 120, 0),
    ("normal",   0,   0),
]


def classify(systolic: int, diastolic: int) -> str:
    """AHA bucket for a reading. Either number alone can push the category
    up, which is how the guidance actually reads."""
    for name, sys_min, dia_min in CATEGORIES:
        if name == "elevated":
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
            self._conn.executescript(SCHEMA_TABLES)
            self._migrate()
            self._conn.executescript(SCHEMA_INDEXES)
            self._conn.commit()
        log.info("SQLite store at %s", self.path)

    def _migrate(self):
        """Add columns introduced after the first release. Caller holds the
        lock. SQLite has no 'ADD COLUMN IF NOT EXISTS', so check first."""
        cols = {r["name"] for r in
                self._conn.execute("PRAGMA table_info(readings)").fetchall()}
        if "profile_id" not in cols:
            self._conn.execute("ALTER TABLE readings ADD COLUMN profile_id INTEGER")
            log.info("migrated: readings.profile_id added "
                     "(existing readings stay unassigned)")
        pcols = {r["name"] for r in
                 self._conn.execute("PRAGMA table_info(profiles)").fetchall()}
        for col in ("cal_sys", "cal_dia", "cal_pulse"):
            if col not in pcols:
                self._conn.execute(
                    f"ALTER TABLE profiles ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0")
                log.info("migrated: profiles.%s added", col)

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
        q = ("SELECT p.*, COUNT(r.id) AS readings,"
             " MAX(r.ts) AS last_reading"
             " FROM profiles p LEFT JOIN readings r ON r.profile_id = p.id")
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
        if len(name) > 60:
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
            # first profile becomes the active one automatically
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
        """Removes the profile but keeps its readings, unassigned — deleting
        someone's measurements silently would be worse than orphaning them."""
        with self._lock:
            self._conn.execute("UPDATE readings SET profile_id=NULL"
                               " WHERE profile_id=?", (pid,))
            cur = self._conn.execute("DELETE FROM profiles WHERE id=?", (pid,))
            if self._get_setting("active_profile") == str(pid):
                nxt = self._conn.execute(
                    "SELECT id FROM profiles WHERE archived=0"
                    " ORDER BY name COLLATE NOCASE LIMIT 1").fetchone()
                self._set_setting("active_profile",
                                  str(nxt["id"]) if nxt else None)
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
                r = self._conn.execute("SELECT id FROM profiles WHERE id=?",
                                       (pid,)).fetchone()
                if not r:
                    return False
            self._set_setting("active_profile",
                              str(pid) if pid is not None else None)
            self._conn.commit()
            return True

    # ------------------------------------------------------- calibration
    # Offsets are applied when a reading is displayed or published, never when
    # it is stored: the database always holds exactly what the cuff sent. That
    # way a later calibration change re-aligns the whole history instead of
    # baking one guess permanently into the data.
    CAL_KEYS = ("systolic", "diastolic", "pulse")
    _CAL_COLS = {"systolic": "cal_sys", "diastolic": "cal_dia", "pulse": "cal_pulse"}
    CAL_LIMIT = 40          # mmHg / bpm either way — a sanity bound, not a rule

    def calibration(self, profile_id=None) -> dict:
        """Offsets for a profile, or the global fallback for unassigned
        readings. Always returns all three keys."""
        out = {k: 0 for k in self.CAL_KEYS}
        with self._lock:
            if isinstance(profile_id, int):
                r = self._conn.execute(
                    "SELECT cal_sys, cal_dia, cal_pulse FROM profiles WHERE id=?",
                    (profile_id,)).fetchone()
                if r:
                    for k, col in self._CAL_COLS.items():
                        out[k] = int(r[col] or 0)
                    return out
            for k in self.CAL_KEYS:
                v = self._get_setting("cal_" + k)
                if v:
                    try:
                        out[k] = int(v)
                    except ValueError:
                        pass
        return out

    def set_calibration(self, profile_id, offsets: dict) -> dict:
        """Absolute offsets (not deltas). Clamped to +/-CAL_LIMIT."""
        clean = {}
        for k in self.CAL_KEYS:
            if k in offsets and offsets[k] is not None:
                try:
                    v = int(round(float(offsets[k])))
                except (TypeError, ValueError):
                    continue
                clean[k] = max(-self.CAL_LIMIT, min(self.CAL_LIMIT, v))
        if not clean:
            return self.calibration(profile_id)
        with self._lock:
            if isinstance(profile_id, int):
                sets = ", ".join(f"{self._CAL_COLS[k]}=?" for k in clean)
                self._conn.execute(f"UPDATE profiles SET {sets} WHERE id=?",
                                   tuple(clean.values()) + (profile_id,))
            else:
                for k, v in clean.items():
                    self._set_setting("cal_" + k, str(v))
            self._conn.commit()
        log.info("calibration for profile %s -> %s", profile_id, clean)
        return self.calibration(profile_id)

    def apply_calibration(self, systolic, diastolic, pulse, profile_id=None) -> dict:
        """Raw values in, calibrated values out (never negative)."""
        cal = self.calibration(profile_id)
        def adj(v, k):
            return None if v is None else max(0, int(v) + cal[k])
        sys_c, dia_c = adj(systolic, "systolic"), adj(diastolic, "diastolic")
        return {"systolic": sys_c, "diastolic": dia_c, "pulse": adj(pulse, "pulse"),
                "map_calc": mean_arterial(sys_c, dia_c)
                            if sys_c is not None and dia_c is not None else None,
                "category": classify(sys_c, dia_c)
                            if sys_c is not None and dia_c is not None else "",
                "calibration": cal,
                "calibrated": any(cal[k] for k in self.CAL_KEYS)}

    def assign_reading(self, rid: int, pid: int | None) -> bool:
        with self._lock:
            cur = self._conn.execute("UPDATE readings SET profile_id=? WHERE id=?",
                                     (pid, rid))
            self._conn.commit()
            return cur.rowcount > 0

    # ------------------------------------------------------------ writes
    def add_reading(self, ts: float, systolic: int, diastolic: int,
                    pulse: int | None, source: str, raw_hex: str = "",
                    profile_id: int | None = None) -> int:
        cat = classify(systolic, diastolic)
        mp = mean_arterial(systolic, diastolic)
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO readings (ts, profile_id, systolic, diastolic, pulse,"
                " map_calc, category, source, raw_hex) VALUES (?,?,?,?,?,?,?,?,?)",
                (ts, profile_id, systolic, diastolic, pulse, mp, cat, source, raw_hex))
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
    @staticmethod
    def _profile_clause(profile_id):
        """profile_id: None = every reading, "none" = only unassigned,
        an int = that profile."""
        if profile_id is None:
            return "", ()
        if profile_id == "none":
            return " WHERE r.profile_id IS NULL", ()
        return " WHERE r.profile_id = ?", (int(profile_id),)

    JOIN_P = " LEFT JOIN profiles p ON p.id = r.profile_id"

    def _cal_exprs(self) -> dict:
        """Calibrated SQL expressions. Each row is shifted by its own profile's
        offset, falling back to the global offset when the row is unassigned —
        so an aggregate spanning several profiles is still exact.

        The offsets are interpolated as literals rather than bound as
        parameters, which keeps the binding order manageable when the same
        expression appears several times in one aggregate query. They are safe
        to interpolate because every one of them has been through int() and
        clamped to +/-CAL_LIMIT before it was stored, and is re-int()ed here."""
        g = self.calibration(None)
        return {
            "sys": f"MAX(0, r.systolic + COALESCE(p.cal_sys, {int(g['systolic'])}))",
            "dia": f"MAX(0, r.diastolic + COALESCE(p.cal_dia, {int(g['diastolic'])}))",
            "pul": f"MAX(0, r.pulse + COALESCE(p.cal_pulse, {int(g['pulse'])}))",
            "off_sys": f"COALESCE(p.cal_sys, {int(g['systolic'])})",
            "off_dia": f"COALESCE(p.cal_dia, {int(g['diastolic'])})",
            "off_pul": f"COALESCE(p.cal_pulse, {int(g['pulse'])})",
        }

    def list_readings(self, limit: int = 50, offset: int = 0,
                      profile_id=None) -> dict:
        where, args = self._profile_clause(profile_id)
        e = self._cal_exprs()
        with self._lock:
            total = self._conn.execute(
                "SELECT COUNT(*) AS n FROM readings r" + where, args).fetchone()["n"]
            rows = self._conn.execute(
                "SELECT r.*, p.name AS profile_name,"
                f" {e['sys']} AS cal_systolic, {e['dia']} AS cal_diastolic,"
                f" {e['pul']} AS cal_pulse_v, {e['off_sys']} AS off_sys,"
                f" {e['off_dia']} AS off_dia, {e['off_pul']} AS off_pulse"
                " FROM readings r" + self.JOIN_P + where
                + " ORDER BY r.ts DESC LIMIT ? OFFSET ?",
                args + (limit, offset)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            # keep the raw values under raw_*, present the calibrated ones
            d["raw_systolic"], d["raw_diastolic"], d["raw_pulse"] = \
                d["systolic"], d["diastolic"], d["pulse"]
            d["systolic"], d["diastolic"] = d.pop("cal_systolic"), d.pop("cal_diastolic")
            d["pulse"] = d.pop("cal_pulse_v")
            d["offsets"] = {"systolic": d.pop("off_sys"),
                            "diastolic": d.pop("off_dia"),
                            "pulse": d.pop("off_pulse")}
            d["calibrated"] = any(d["offsets"].values())
            if d["calibrated"] and d["systolic"] is not None and d["diastolic"] is not None:
                d["map_calc"] = mean_arterial(d["systolic"], d["diastolic"])
                d["category"] = classify(d["systolic"], d["diastolic"])
            out.append(d)
        return {"total": total, "limit": limit, "offset": offset,
                "profile_id": profile_id, "rows": out}

    def trend(self, days: int = 30, limit: int = 400, profile_id=None) -> list[dict]:
        """Oldest-first, calibrated series for charting."""
        where, args = self._profile_clause(profile_id)
        where = (where + " AND r.ts >= ?") if where else " WHERE r.ts >= ?"
        args = args + (time.time() - days * 86400,)
        e = self._cal_exprs()
        with self._lock:
            rows = self._conn.execute(
                f"SELECT r.ts, {e['sys']} AS systolic, {e['dia']} AS diastolic,"
                f" {e['pul']} AS pulse, r.category, r.profile_id"
                " FROM readings r" + self.JOIN_P + where
                + " ORDER BY r.ts DESC LIMIT ?", args + (limit,)).fetchall()
        return [dict(r) for r in reversed(rows)]

    def stats(self, profile_id=None) -> dict:
        where, wargs = self._profile_clause(profile_id)
        e = self._cal_exprs()

        def agg(since: float | None) -> dict:
            q = (f"SELECT COUNT(*) n, AVG({e['sys']}) sys, AVG({e['dia']}) dia,"
                 f" AVG({e['pul']}) pul, MIN({e['sys']}) sys_min,"
                 f" MAX({e['sys']}) sys_max, MIN({e['dia']}) dia_min,"
                 f" MAX({e['dia']}) dia_max FROM readings r" + self.JOIN_P)
            w = where
            if since is not None:
                w = (w + " AND r.ts >= ?") if w else " WHERE r.ts >= ?"
                a = wargs + (since,)
            else:
                a = wargs
            r = self._conn.execute(q + w, a).fetchone()
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
            by_cat = self._conn.execute(
                "SELECT r.category, COUNT(*) n FROM readings r" + where
                + " GROUP BY r.category", wargs).fetchall()
            frames = self._conn.execute("SELECT COUNT(*) n FROM frames").fetchone()["n"]
            unassigned = self._conn.execute(
                "SELECT COUNT(*) n FROM readings WHERE profile_id IS NULL"
            ).fetchone()["n"]
        last_rows = self.list_readings(1, 0, profile_id)["rows"]
        return {"all_time": all_time, "week": week, "month": month,
                "last": last_rows[0] if last_rows else None,
                "by_category": {r["category"]: r["n"] for r in by_cat},
                "unknown_frames": frames, "unassigned": unassigned,
                "profile_id": profile_id,
                "calibration": self.calibration(
                    profile_id if isinstance(profile_id, int) else None),
                "db_path": self.path,
                "db_bytes": os.path.getsize(self.path) if os.path.exists(self.path) else 0}

    def csv(self, profile_id=None) -> str:
        """Both raw and calibrated columns — the raw ones are what the cuff
        actually sent, which is what anyone auditing this will want."""
        rows = self.list_readings(100000, 0, profile_id)["rows"]
        out = ["timestamp,iso_time,profile,systolic,diastolic,pulse,map,category,"
               "raw_systolic,raw_diastolic,raw_pulse,"
               "offset_systolic,offset_diastolic,offset_pulse,source,raw_hex"]
        for r in rows:
            iso = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(r["ts"]))
            o = r["offsets"]
            out.append(",".join(str(x if x is not None else "") for x in (
                round(r["ts"], 3), iso, r["profile_name"] or "unassigned",
                r["systolic"], r["diastolic"], r["pulse"], r["map_calc"],
                r["category"], r["raw_systolic"], r["raw_diastolic"], r["raw_pulse"],
                o["systolic"], o["diastolic"], o["pulse"],
                r["source"], r["raw_hex"])))
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
