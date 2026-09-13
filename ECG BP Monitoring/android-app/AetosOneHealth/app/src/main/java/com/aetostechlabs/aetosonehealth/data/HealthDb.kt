package com.aetostechlabs.aetosonehealth.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Local history store.
 *
 * Deliberately plain SQLite rather than an ORM: the schema is small, every
 * query here is hand-written, and it keeps the build free of annotation
 * processing. Readings are stored RAW — calibration is applied on read, in
 * [Repository], for the reason explained on [Calibration].
 */
class HealthDb(context: Context) : SQLiteOpenHelper(context, NAME, null, VERSION) {

    companion object {
        const val NAME = "aetos_health.db"
        const val VERSION = 1

        /** Global (unassigned) calibration lives under this sentinel id. */
        const val GLOBAL_CAL = 0L
    }

    init {
        // Write-ahead logging is switched on through the helper API, from the
        // constructor. Neither `execSQL("PRAGMA journal_mode=WAL")` nor
        // db.enableWriteAheadLogging() is safe here: the pragma returns a row
        // and Android's execSQL rejects statements that return data on some
        // versions, and enableWriteAheadLogging() is explicitly not allowed
        // from onConfigure. Either would throw inside Application.onCreate and
        // kill the app before it drew a frame.
        setWriteAheadLoggingEnabled(true)
    }

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE profiles(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              note TEXT NOT NULL DEFAULT '',
              active INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL)
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE bp_readings(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ts INTEGER NOT NULL,
              profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
              systolic INTEGER NOT NULL,
              diastolic INTEGER NOT NULL,
              pulse INTEGER NOT NULL,
              source TEXT NOT NULL DEFAULT 'ble',
              raw_hex TEXT NOT NULL DEFAULT '')
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE ecg_sessions(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              started_at INTEGER NOT NULL,
              ended_at INTEGER,
              profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
              hr_avg REAL, hr_min INTEGER, hr_max INTEGER,
              beats INTEGER NOT NULL DEFAULT 0,
              samples INTEGER NOT NULL DEFAULT 0,
              quality TEXT NOT NULL DEFAULT '')
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE ecg_hr_samples(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id INTEGER NOT NULL REFERENCES ecg_sessions(id) ON DELETE CASCADE,
              ts INTEGER NOT NULL,
              hr INTEGER NOT NULL)
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE calibration(
              profile_id INTEGER PRIMARY KEY,
              systolic INTEGER NOT NULL DEFAULT 0,
              diastolic INTEGER NOT NULL DEFAULT 0,
              pulse INTEGER NOT NULL DEFAULT 0,
              hr INTEGER NOT NULL DEFAULT 0)
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX idx_bp_ts ON bp_readings(ts DESC)")
        db.execSQL("CREATE INDEX idx_bp_profile ON bp_readings(profile_id)")
        db.execSQL("CREATE INDEX idx_sess_started ON ecg_sessions(started_at DESC)")
        db.execSQL("CREATE INDEX idx_hr_session ON ecg_hr_samples(session_id, ts)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Version 1 is the first shipped schema; future migrations go here as
        // additive ALTER TABLE steps so no stored reading is ever discarded.
    }
}

internal fun Cursor.longOrNull(idx: Int): Long? = if (isNull(idx)) null else getLong(idx)
internal fun Cursor.intOrNull(idx: Int): Int? = if (isNull(idx)) null else getInt(idx)
internal fun Cursor.doubleOrNull(idx: Int): Double? = if (isNull(idx)) null else getDouble(idx)

internal fun values(vararg pairs: Pair<String, Any?>): ContentValues = ContentValues().apply {
    pairs.forEach { (k, v) ->
        when (v) {
            null -> putNull(k)
            is Int -> put(k, v)
            is Long -> put(k, v)
            is Double -> put(k, v)
            is String -> put(k, v)
            is Boolean -> put(k, if (v) 1 else 0)
            else -> put(k, v.toString())
        }
    }
}
