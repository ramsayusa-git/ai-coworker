package com.aetostechlabs.aetosonehealth.dsp

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.PI

/** Direct-form-II transposed biquad. Ported from the add-on's dsp.py. */
class Biquad(b0: Double, b1: Double, b2: Double, a0: Double, a1: Double, a2: Double) {
    private val b0 = b0 / a0
    private val b1 = b1 / a0
    private val b2 = b2 / a0
    private val a1 = a1 / a0
    private val a2 = a2 / a0
    private var z1 = 0.0
    private var z2 = 0.0

    fun process(x: Double): Double {
        val y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        return y
    }

    fun reset() { z1 = 0.0; z2 = 0.0 }

    companion object {
        fun notch(fs: Double, f0: Double, q: Double = 30.0): Biquad {
            val w0 = 2 * PI * f0 / fs
            val alpha = sin(w0) / (2 * q)
            val c = cos(w0)
            return Biquad(1.0, -2 * c, 1.0, 1 + alpha, -2 * c, 1 - alpha)
        }
        fun lowpass(fs: Double, fc: Double, q: Double = 0.7071): Biquad {
            val w0 = 2 * PI * fc / fs
            val alpha = sin(w0) / (2 * q)
            val c = cos(w0)
            return Biquad((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha)
        }
        fun highpass(fs: Double, fc: Double, q: Double = 0.7071): Biquad {
            val w0 = 2 * PI * fc / fs
            val alpha = sin(w0) / (2 * q)
            val c = cos(w0)
            return Biquad((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha)
        }
    }
}

/** HP 0.5 Hz (baseline wander) -> mains notch (+2nd harmonic) -> LP 40 Hz. */
class EcgFilter(fs: Double, mainsHz: Int = 50) {
    private val stages = listOf(
        Biquad.highpass(fs, 0.5),
        Biquad.notch(fs, mainsHz.toDouble(), 25.0),
        Biquad.notch(fs, mainsHz * 2.0, 25.0),
        Biquad.lowpass(fs, 40.0)
    )
    fun process(x: Double): Double {
        var v = x
        for (s in stages) v = s.process(v)
        return v
    }
    fun reset() = stages.forEach { it.reset() }
}

/**
 * Pan-Tompkins-lite. Polarity independent (it squares the derivative), so the
 * ecg2's negative-going QRS spikes are detected as well as positive ones.
 */
class QrsDetector(private val fs: Double) {
    private var bp = listOf(Biquad.highpass(fs, 5.0), Biquad.lowpass(fs, 20.0))
    private val win = maxOf(1, (0.150 * fs).toInt())
    private val refractory = (0.300 * fs).toInt()
    private val buf = ArrayDeque<Double>(win)
    private var integSum = 0.0
    private var prev = 0.0
    private var n = 0
    private var lastPeakN = -1_000_000_000
    private var spk = 0.0
    private var npk = 0.0
    private var thr = 0.0
    private val rr = ArrayDeque<Double>(8)
    private var localMax = 0.0
    private var localMaxN = 0
    private var rising = false

    var hrBpm: Double? = null; private set
    var rrMs: Double? = null; private set
    var beats = 0; private set

    fun reset() {
        bp = listOf(Biquad.highpass(fs, 5.0), Biquad.lowpass(fs, 20.0))
        buf.clear(); rr.clear()
        integSum = 0.0; prev = 0.0; n = 0; lastPeakN = -1_000_000_000
        spk = 0.0; npk = 0.0; thr = 0.0
        localMax = 0.0; localMaxN = 0; rising = false
        hrBpm = null; rrMs = null; beats = 0
    }

    fun process(sample: Double): Boolean {
        n++
        var x = sample
        for (s in bp) x = s.process(x)
        val d = x - prev
        prev = x
        val e = d * d
        if (buf.size == win) integSum -= buf.removeFirst()
        buf.addLast(e)
        integSum += e
        val y = integSum / win

        // warm-up: learn thresholds over the first 2 s
        if (n < 2 * fs) {
            spk = maxOf(spk * 0.999, y)
            thr = 0.25 * spk
            return false
        }

        var beat = false
        if (y > localMax) {
            localMax = y; localMaxN = n; rising = true
        } else if (rising && y < 0.5 * localMax) {
            val pk = localMax
            val pkN = localMaxN
            localMax = 0.0; rising = false
            if (pkN - lastPeakN > refractory && pk > thr) {
                if (lastPeakN > 0) {
                    val interval = (pkN - lastPeakN) / fs
                    if (interval in 0.3..2.0) {
                        if (rr.size == 8) rr.removeFirst()
                        rr.addLast(interval)
                        rrMs = interval * 1000
                        hrBpm = 60.0 / (rr.sum() / rr.size)
                    }
                }
                lastPeakN = pkN
                spk = 0.125 * pk + 0.875 * spk
                beats++
                beat = true
            } else {
                npk = 0.125 * pk + 0.875 * npk
            }
            thr = npk + 0.25 * (spk - npk)
        }
        // missed-beat search-back
        if (rr.isNotEmpty() && (n - lastPeakN) > 1.66 * (rr.sum() / rr.size) * fs) thr *= 0.5
        return beat
    }
}

/** Flat line / rail saturation / high-frequency noise over a 2 s window. */
class SignalQuality(private val fs: Double) {
    private val cap = (2 * fs).toInt()
    private val win = ArrayDeque<Double>(cap)
    private val diff = ArrayDeque<Double>(cap)
    private var prev: Double? = null

    fun push(x: Double) {
        if (win.size == cap) win.removeFirst()
        win.addLast(x)
        prev?.let {
            if (diff.size == cap) diff.removeFirst()
            diff.addLast(abs(x - it))
        }
        prev = x
    }

    fun assess(): Pair<String, Double> {
        if (win.size < fs) return "warming" to 0.0
        val lo = win.min(); val hi = win.max()
        val span = hi - lo
        if (span < 20) return "flat" to 0.0
        if (lo <= -32000 || hi >= 32000) return "saturated" to 0.1
        val meanDiff = diff.sum() / maxOf(1, diff.size)
        val ratio = meanDiff / span
        return when {
            ratio > 0.12 -> "noisy" to maxOf(0.0, 0.6 - ratio)
            ratio > 0.06 -> "fair" to 0.7
            else -> "good" to 1.0
        }
    }
}
