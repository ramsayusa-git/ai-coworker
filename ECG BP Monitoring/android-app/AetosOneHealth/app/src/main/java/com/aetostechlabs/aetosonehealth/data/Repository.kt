package com.aetostechlabs.aetosonehealth.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.roundToInt

/**
 * The single owner of stored health data.
 *
 * Everything the UI observes hangs off the flows here, so a write in one screen
 * shows up in every other one without any manual refresh. Calibration is
 * applied on the way out (never on the way in) so the raw measurement survives
 * any later change of offsets.
 */
class Repository(context: Context) {

    private val helper = HealthDb(context.applicationContext)
    private val db get() = helper.writableDatabase

    private val _profiles = MutableStateFlow<List<Profile>>(emptyList())
    val profiles: StateFlow<List<Profile>> = _profiles.asStateFlow()

    private val _activeProfile = MutableStateFlow<Profile?>(null)
    val activeProfile: StateFlow<Profile?> = _activeProfile.asStateFlow()

    private val _bpReadings = MutableStateFlow<List<BpReading>>(emptyList())
    val bpReadings: StateFlow<List<BpReading>> = _bpReadings.asStateFlow()

    private val _sessions = MutableStateFlow<List<EcgSession>>(emptyList())
    val sessions: StateFlow<List<EcgSession>> = _sessions.asStateFlow()

    private val _calibration = MutableStateFlow(Calibration())
    val calibration: StateFlow<Calibration> = _calibration.asStateFlow()

    init {
        refreshAll()
    }

    fun refreshAll() {
        _profiles.value = loadProfiles()
        _activeProfile.value = _profiles.value.firstOrNull { it.active }
        _calibration.value = loadCalibration(_activeProfile.value?.id)
        _bpReadings.value = loadBpReadings()
        _sessions.value = loadSessions()
    }

    // ------------------------------------------------------------- profiles
    private fun loadProfiles(): List<Profile> = buildList {
        db.rawQuery(
            "SELECT id,name,note,active,created_at FROM profiles ORDER BY name COLLATE NOCASE", null
        ).use { c ->
            while (c.moveToNext()) {
                add(Profile(c.getLong(0), c.getString(1), c.getString(2), c.getInt(3) == 1, c.getLong(4)))
            }
        }
    }

    fun addProfile(name: String, note: String = ""): Result<Profile> {
        val clean = name.trim()
        if (clean.isEmpty()) return Result.failure(IllegalArgumentException("Name cannot be empty"))
        if (_profiles.value.any { it.name.equals(clean, true) })
            return Result.failure(IllegalArgumentException("A profile called \"$clean\" already exists"))
        val firstOne = _profiles.value.isEmpty()
        val id = db.insert(
            "profiles", null,
            values(
                "name" to clean, "note" to note.trim(),
                "active" to firstOne, "created_at" to System.currentTimeMillis()
            )
        )
        if (id == -1L) return Result.failure(IllegalStateException("Could not save the profile"))
        refreshAll()
        return Result.success(_profiles.value.first { it.id == id })
    }

    fun updateProfile(id: Long, name: String?, note: String?) {
        val cv = values(
            *buildList {
                name?.trim()?.takeIf { it.isNotEmpty() }?.let { add("name" to it) }
                note?.let { add("note" to it.trim()) }
            }.toTypedArray()
        )
        if (cv.size() == 0) return
        db.update("profiles", cv, "id=?", arrayOf(id.toString()))
        refreshAll()
    }

    fun deleteProfile(id: Long) {
        db.delete("profiles", "id=?", arrayOf(id.toString()))
        db.delete("calibration", "profile_id=?", arrayOf(id.toString()))
        // Readings keep their history; they simply become unassigned.
        refreshAll()
    }

    fun setActiveProfile(id: Long?) {
        db.execSQL("UPDATE profiles SET active=0")
        if (id != null) db.execSQL("UPDATE profiles SET active=1 WHERE id=?", arrayOf<Any>(id))
        refreshAll()
    }

    /**
     * A profile created while a wear is already under way should own that wear,
     * otherwise the session is orphaned for no reason the user can see.
     */
    fun reattributeOpenSession(profileId: Long?) {
        db.execSQL(
            "UPDATE ecg_sessions SET profile_id=? WHERE ended_at IS NULL AND profile_id IS NULL",
            arrayOf<Any?>(profileId)
        )
        refreshAll()
    }

    // ---------------------------------------------------------- calibration
    fun loadCalibration(profileId: Long?): Calibration {
        val key = profileId ?: HealthDb.GLOBAL_CAL
        db.rawQuery(
            "SELECT systolic,diastolic,pulse,hr FROM calibration WHERE profile_id=?",
            arrayOf(key.toString())
        ).use { c ->
            if (c.moveToFirst()) return Calibration(c.getInt(0), c.getInt(1), c.getInt(2), c.getInt(3))
        }
        return Calibration()
    }

    fun setCalibration(profileId: Long?, cal: Calibration) {
        val key = profileId ?: HealthDb.GLOBAL_CAL
        val safe = Calibration(
            Calibration.clamp(cal.systolic), Calibration.clamp(cal.diastolic),
            Calibration.clamp(cal.pulse), Calibration.clamp(cal.hr)
        )
        db.insertWithOnConflict(
            "calibration", null,
            values(
                "profile_id" to key, "systolic" to safe.systolic, "diastolic" to safe.diastolic,
                "pulse" to safe.pulse, "hr" to safe.hr
            ),
            android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE
        )
        refreshAll()
    }

    fun resetCalibration(profileId: Long?) = setCalibration(profileId, Calibration())

    // ------------------------------------------------------------------ BP
    fun addBpReading(
        ts: Long, systolic: Int, diastolic: Int, pulse: Int,
        source: String, rawHex: String, profileId: Long?
    ): Long {
        val id = db.insert(
            "bp_readings", null,
            values(
                "ts" to ts, "profile_id" to profileId, "systolic" to systolic,
                "diastolic" to diastolic, "pulse" to pulse,
                "source" to source, "raw_hex" to rawHex
            )
        )
        refreshAll()
        return id
    }

    fun deleteBpReading(id: Long) {
        db.delete("bp_readings", "id=?", arrayOf(id.toString()))
        refreshAll()
    }

    fun assignBpReading(id: Long, profileId: Long?) {
        db.update("bp_readings", values("profile_id" to profileId), "id=?", arrayOf(id.toString()))
        refreshAll()
    }

    /** Readings with calibration already applied, newest first. */
    private fun loadBpReadings(limit: Int = 500): List<BpReading> = buildList {
        db.rawQuery(
            """
            SELECT r.id,r.ts,r.profile_id,p.name,r.systolic,r.diastolic,r.pulse,r.source,r.raw_hex
            FROM bp_readings r LEFT JOIN profiles p ON p.id=r.profile_id
            ORDER BY r.ts DESC LIMIT ?
            """.trimIndent(),
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                val pid = c.longOrNull(2)
                val cal = loadCalibration(pid)
                val (s, d, p) = cal.applyBp(c.getInt(4), c.getInt(5), c.getInt(6))
                add(
                    BpReading(
                        id = c.getLong(0), ts = c.getLong(1), profileId = pid,
                        profileName = if (c.isNull(3)) null else c.getString(3),
                        systolic = s, diastolic = d, pulse = p,
                        source = c.getString(7), rawHex = c.getString(8)
                    )
                )
            }
        }
    }

    /** Readings scoped to one profile, or all when [profileId] is null. */
    fun bpFor(profileId: Long?): List<BpReading> =
        if (profileId == null) _bpReadings.value
        else _bpReadings.value.filter { it.profileId == profileId }

    // ----------------------------------------------------------------- ECG
    fun openSession(profileId: Long?): Long {
        val id = db.insert(
            "ecg_sessions", null,
            values("started_at" to System.currentTimeMillis(), "profile_id" to profileId)
        )
        refreshAll()
        return id
    }

    fun addHrSample(sessionId: Long, hr: Int) {
        db.insert(
            "ecg_hr_samples", null,
            values("session_id" to sessionId, "ts" to System.currentTimeMillis(), "hr" to hr)
        )
    }

    /**
     * Close a session and write its summary. Both the normal path and the
     * "app was killed mid-wear" path come through here, so a recovered session
     * always has the same averages as a cleanly closed one.
     */
    fun closeSession(sessionId: Long, quality: String, samples: Int) {
        var avg: Double? = null
        var lo: Int? = null
        var hi: Int? = null
        var beats = 0
        db.rawQuery(
            "SELECT AVG(hr),MIN(hr),MAX(hr),COUNT(*) FROM ecg_hr_samples WHERE session_id=?",
            arrayOf(sessionId.toString())
        ).use { c ->
            if (c.moveToFirst() && !c.isNull(0)) {
                avg = (c.getDouble(0) * 10).roundToInt() / 10.0
                lo = c.getInt(1); hi = c.getInt(2); beats = c.getInt(3)
            }
        }
        db.update(
            "ecg_sessions",
            values(
                "ended_at" to System.currentTimeMillis(), "hr_avg" to avg,
                "hr_min" to lo, "hr_max" to hi, "beats" to beats,
                "samples" to samples, "quality" to quality
            ),
            "id=?", arrayOf(sessionId.toString())
        )
        refreshAll()
    }

    /** Any session left open by a crash or a force-stop. */
    fun closeOrphanSessions() {
        db.rawQuery("SELECT id FROM ecg_sessions WHERE ended_at IS NULL", null).use { c ->
            while (c.moveToNext()) closeSession(c.getLong(0), "recovered", 0)
        }
    }

    fun deleteSession(id: Long) {
        db.delete("ecg_sessions", "id=?", arrayOf(id.toString()))
        refreshAll()
    }

    fun assignSession(id: Long, profileId: Long?) {
        db.update("ecg_sessions", values("profile_id" to profileId), "id=?", arrayOf(id.toString()))
        refreshAll()
    }

    private fun loadSessions(limit: Int = 200): List<EcgSession> = buildList {
        db.rawQuery(
            """
            SELECT s.id,s.started_at,s.ended_at,s.profile_id,p.name,s.hr_avg,s.hr_min,
                   s.hr_max,s.beats,s.quality,s.samples
            FROM ecg_sessions s LEFT JOIN profiles p ON p.id=s.profile_id
            ORDER BY s.started_at DESC LIMIT ?
            """.trimIndent(),
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                val pid = c.longOrNull(3)
                val cal = loadCalibration(pid)
                add(
                    EcgSession(
                        id = c.getLong(0), startedAt = c.getLong(1), endedAt = c.longOrNull(2),
                        profileId = pid,
                        profileName = if (c.isNull(4)) null else c.getString(4),
                        hrAvg = c.doubleOrNull(5)?.let { cal.applyHr(it) },
                        hrMin = c.intOrNull(6)?.plus(cal.hr),
                        hrMax = c.intOrNull(7)?.plus(cal.hr),
                        beats = c.getInt(8), quality = c.getString(9), samples = c.getInt(10)
                    )
                )
            }
        }
    }

    fun sessionsFor(profileId: Long?): List<EcgSession> =
        if (profileId == null) _sessions.value
        else _sessions.value.filter { it.profileId == profileId }

    fun hrTrend(sessionId: Long): List<HrSample> = buildList {
        val cal = _calibration.value
        db.rawQuery(
            "SELECT ts,hr FROM ecg_hr_samples WHERE session_id=? ORDER BY ts",
            arrayOf(sessionId.toString())
        ).use { c ->
            while (c.moveToNext()) add(HrSample(c.getLong(0), c.getInt(1) + cal.hr))
        }
    }
}
