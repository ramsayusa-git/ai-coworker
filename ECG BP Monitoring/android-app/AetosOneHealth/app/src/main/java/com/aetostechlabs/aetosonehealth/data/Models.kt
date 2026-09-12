package com.aetostechlabs.aetosonehealth.data

import kotlin.math.roundToInt

data class Profile(
    val id: Long,
    val name: String,
    val note: String = "",
    val active: Boolean = false,
    val createdAt: Long = 0L
)

data class BpReading(
    val id: Long,
    val ts: Long,
    val profileId: Long?,
    val profileName: String?,
    val systolic: Int,
    val diastolic: Int,
    val pulse: Int,
    val source: String,
    val rawHex: String
) {
    val category: String get() = classify(systolic, diastolic)
    val meanArterial: Double get() = meanArterial(systolic, diastolic)
}

data class EcgSession(
    val id: Long,
    val startedAt: Long,
    val endedAt: Long?,
    val profileId: Long?,
    val profileName: String?,
    val hrAvg: Double?,
    val hrMin: Int?,
    val hrMax: Int?,
    val beats: Int,
    val quality: String,
    val samples: Int
) {
    val durationSec: Long get() = ((endedAt ?: System.currentTimeMillis()) - startedAt) / 1000
}

data class HrSample(val ts: Long, val hr: Int)

/**
 * Calibration offsets. Readings are always stored RAW, exactly as the device
 * reported them; the offset is applied when a value is displayed or exported.
 * That way a change of calibration re-interprets the whole history instead of
 * corrupting it, and the original measurement is never lost.
 */
data class Calibration(
    val systolic: Int = 0,
    val diastolic: Int = 0,
    val pulse: Int = 0,
    val hr: Int = 0
) {
    val isActive: Boolean get() = systolic != 0 || diastolic != 0 || pulse != 0 || hr != 0

    companion object {
        /** Clamp, so a stuck +/- button can never distort a reading wildly. */
        const val LIMIT = 40
        fun clamp(v: Int) = v.coerceIn(-LIMIT, LIMIT)
    }
}

fun Calibration.applyBp(systolic: Int, diastolic: Int, pulse: Int): Triple<Int, Int, Int> =
    Triple(
        (systolic + this.systolic).coerceAtLeast(0),
        (diastolic + this.diastolic).coerceAtLeast(0),
        (pulse + this.pulse).coerceAtLeast(0)
    )

fun Calibration.applyHr(hr: Double): Double = (hr + this.hr).coerceAtLeast(0.0)

/** AHA/ACC 2017 categories. */
fun classify(systolic: Int, diastolic: Int): String = when {
    systolic >= 180 || diastolic >= 120 -> "Hypertensive crisis"
    systolic >= 140 || diastolic >= 90 -> "Stage 2 hypertension"
    systolic >= 130 || diastolic >= 80 -> "Stage 1 hypertension"
    systolic >= 120 -> "Elevated"
    systolic > 0 -> "Normal"
    else -> ""
}

fun meanArterial(systolic: Int, diastolic: Int): Double =
    ((diastolic + (systolic - diastolic) / 3.0) * 10).roundToInt() / 10.0

/** Resting heart-rate bands, used only for colour-coding the readout. */
fun hrBand(hr: Int): String = when {
    hr <= 0 -> ""
    hr < 50 -> "Low"
    hr <= 100 -> "Normal"
    hr <= 120 -> "Elevated"
    else -> "High"
}
