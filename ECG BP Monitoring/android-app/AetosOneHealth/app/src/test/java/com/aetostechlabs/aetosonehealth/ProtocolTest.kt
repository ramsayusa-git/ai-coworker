package com.aetostechlabs.aetosonehealth

import com.aetostechlabs.aetosonehealth.data.classify
import com.aetostechlabs.aetosonehealth.data.meanArterial
import com.aetostechlabs.aetosonehealth.dsp.QrsDetector
import com.aetostechlabs.aetosonehealth.proto.BpProtocol
import com.aetostechlabs.aetosonehealth.proto.EcgProtocol
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

class ProtocolTest {

    private fun hex(s: String) = s.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    @Test
    fun `bp result frame decodes to the captured values`() {
        // The frame captured from the real cuff on 12 Sep 2026.
        val frame = hex("aa80020f0106000e010101010100d70086006733")
        val decoded = BpProtocol.decode(frame)
        assertTrue(decoded is BpProtocol.BpReading)
        decoded as BpProtocol.BpReading
        assertEquals(215, decoded.systolic)   // 0xD7
        assertEquals(134, decoded.diastolic)  // 0x86
        assertEquals(103, decoded.pulse)      // 0x67
    }

    @Test
    fun `bp rejects anything without the sync byte`() {
        assertEquals(null, BpProtocol.decode(hex("0102030405")))
    }

    @Test
    fun `ecg contact frame decodes`() {
        val p = EcgProtocol.decode(hex("0201035e0400"))
        assertTrue(p is EcgProtocol.ContactPacket)
        p as EcgProtocol.ContactPacket
        assertTrue(p.contact)
        assertEquals(94, p.hr)
    }

    @Test
    fun `ecg stream frame yields eight signed samples`() {
        // seq 0x0001, then 8 samples, the first of which is negative (0xFFFF).
        val p = EcgProtocol.decode(hex("0001ffff000100020003000400050006"+"0007"))
        assertTrue(p is EcgProtocol.EcgPacket)
        p as EcgProtocol.EcgPacket
        assertEquals(1, p.seq)
        assertEquals(8, p.samples.size)
        assertEquals(-1, p.samples[0])
        assertEquals(7, p.samples[7])
    }

    @Test
    fun `qrs detector finds beats in a synthetic 60 bpm signal`() {
        val fs = 530.0
        val qrs = QrsDetector(fs)
        var beats = 0
        // 10 s of a 1 Hz spike train: one "beat" per second.
        for (n in 0 until (10 * fs).toInt()) {
            val phase = (n % fs.toInt()) / fs
            // A narrow negative spike, matching this sensor's polarity.
            val v = if (phase < 0.03) -1200.0 * sin(phase / 0.03 * PI) else 0.0
            if (qrs.process(v)) beats++
        }
        // Allowing for the 2 s warm-up, expect roughly 8 beats.
        assertTrue("expected ~8 beats, found $beats", beats in 6..10)
        val hr = qrs.hrBpm ?: 0.0
        assertTrue("expected ~60 bpm, got $hr", abs(hr - 60.0) < 6.0)
    }

    @Test
    fun `categories follow the AHA thresholds`() {
        assertEquals("Normal", classify(118, 76))
        assertEquals("Elevated", classify(124, 76))
        assertEquals("Stage 1 hypertension", classify(132, 82))
        assertEquals("Stage 2 hypertension", classify(145, 92))
        assertEquals("Hypertensive crisis", classify(185, 121))
    }

    @Test
    fun `mean arterial pressure matches the standard formula`() {
        assertEquals(93.3, meanArterial(120, 80), 0.05)
    }
}

class QrsRecoveryTest {
    /**
     * A single large artefact during the 2 s warm-up used to set the detection
     * threshold so high that no real beat ever crossed it, and the search-back
     * that would have lowered it only ran after the first beat — which never
     * came. The trace rendered; the heart rate stayed blank forever.
     */
    @Test
    fun `detector recovers after a noise spike during warm-up`() {
        val fs = 530.0
        val qrs = com.aetostechlabs.aetosonehealth.dsp.QrsDetector(fs)
        var beats = 0
        for (n in 0 until (30 * fs).toInt()) {
            val t = n / fs
            // One huge artefact at 0.5 s, inside the warm-up window.
            val artefact = if (n in 260..268) -30000.0 else 0.0
            val phase = (n % fs.toInt()) / fs
            val qrsSpike =
                if (phase < 0.03) -1000.0 * kotlin.math.sin(phase / 0.03 * kotlin.math.PI) else 0.0
            if (qrs.process(qrsSpike + artefact)) beats++
        }
        org.junit.Assert.assertTrue(
            "detector never recovered from the warm-up artefact (beats=$beats)",
            beats >= 15
        )
    }
}

class StatsTest {
    private fun bp(ts: Long, s: Int, d: Int, p: Int) =
        com.aetostechlabs.aetosonehealth.data.BpReading(
            id = ts, ts = ts, profileId = 1, profileName = "t",
            systolic = s, diastolic = d, pulse = p, source = "ble", rawHex = ""
        )

    @Test
    fun `bp stats average and range by period`() {
        val now = 1_000_000_000_000L
        val day = 86_400_000L
        val rows = listOf(
            bp(now - 1 * day, 120, 80, 70),   // this week
            bp(now - 3 * day, 130, 85, 75),   // this week
            bp(now - 20 * day, 150, 95, 90),  // this month only
            bp(now - 60 * day, 100, 60, 60)   // all time only
        )
        val p = com.aetostechlabs.aetosonehealth.ui.components.bpPeriods(rows, now)
        val week = p[0]; val month = p[1]; val all = p[2]
        assertEquals(2, week.count); assertEquals(125, week.sys); assertEquals(83, week.dia)
        assertEquals(3, month.count); assertEquals(133, month.sys)
        assertEquals(4, all.count); assertEquals(100, all.sysMin); assertEquals(150, all.sysMax)
    }
}
