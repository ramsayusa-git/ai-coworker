package com.aetostechlabs.aetosonehealth.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aetostechlabs.aetosonehealth.data.BpReading
import com.aetostechlabs.aetosonehealth.data.EcgSession
import com.aetostechlabs.aetosonehealth.ui.theme.BpDiastolic
import com.aetostechlabs.aetosonehealth.ui.theme.BpPulse
import com.aetostechlabs.aetosonehealth.ui.theme.BpSystolic
import com.aetostechlabs.aetosonehealth.ui.theme.EcgTrace
import kotlin.math.roundToInt

/**
 * The statistics block the hub dashboards have and the app did not.
 *
 * Mirrors the add-ons' `/api/stats`: for BP, count / average / min / max over
 * this week, this month and all time, plus a category breakdown; for ECG,
 * sessions, total wear time and heart-rate average / min / max over today,
 * this week and all time. Everything here is derived from the same lists the
 * history screen shows, so it updates the moment a new reading is stored —
 * "live" in the sense that matters.
 */

private const val DAY = 86_400_000L
private const val WEEK = 7 * DAY
private const val MONTH = 30 * DAY

data class BpPeriod(
    val label: String,
    val count: Int,
    val sys: Int?, val dia: Int?, val pulse: Int?,
    val sysMin: Int?, val sysMax: Int?,
    val diaMin: Int?, val diaMax: Int?
)

fun bpPeriods(rows: List<BpReading>, now: Long = System.currentTimeMillis()): List<BpPeriod> {
    fun period(label: String, since: Long): BpPeriod {
        val r = rows.filter { it.ts >= since }
        if (r.isEmpty()) return BpPeriod(label, 0, null, null, null, null, null, null, null)
        return BpPeriod(
            label, r.size,
            r.map { it.systolic }.average().roundToInt(),
            r.map { it.diastolic }.average().roundToInt(),
            r.map { it.pulse }.average().roundToInt(),
            r.minOf { it.systolic }, r.maxOf { it.systolic },
            r.minOf { it.diastolic }, r.maxOf { it.diastolic }
        )
    }
    return listOf(
        period("This week", now - WEEK),
        period("This month", now - MONTH),
        period("All time", 0L)
    )
}

@Composable
fun BpStatsCard(rows: List<BpReading>, who: String?, modifier: Modifier = Modifier) {
    val periods = bpPeriods(rows)
    val byCategory = rows.groupingBy { it.category }.eachCount()
        .entries.sortedByDescending { it.value }

    SectionCard(
        title = if (who != null) "Stats — $who" else "Stats — all profiles",
        modifier = modifier
    ) {
        if (rows.isEmpty()) {
            Text(
                "No readings yet. Stats fill in as measurements are recorded.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            return@SectionCard
        }

        // Header row
        StatRow(
            listOf("", "Readings", "Systolic", "Diastolic", "Pulse"),
            header = true
        )
        periods.forEach { p ->
            StatRow(
                listOf(
                    p.label,
                    p.count.toString(),
                    p.sys?.let { "$it" } ?: "—",
                    p.dia?.let { "$it" } ?: "—",
                    p.pulse?.let { "$it" } ?: "—"
                ),
                accents = listOf(null, null, BpSystolic, BpDiastolic, BpPulse)
            )
        }

        Spacer(Modifier.height(12.dp))
        val all = periods.last()
        if (all.sysMin != null) {
            Text(
                "Range, all time: systolic ${all.sysMin}–${all.sysMax} · " +
                    "diastolic ${all.diaMin}–${all.diaMax}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (byCategory.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text("By category", style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                byCategory.forEach { (cat, n) -> Chip("$cat · $n") }
            }
        }
    }
}

data class EcgPeriod(
    val label: String,
    val sessions: Int,
    val seconds: Long,
    val hrAvg: Int?, val hrMin: Int?, val hrMax: Int?
)

fun ecgPeriods(rows: List<EcgSession>, now: Long = System.currentTimeMillis()): List<EcgPeriod> {
    fun period(label: String, since: Long): EcgPeriod {
        val r = rows.filter { it.startedAt >= since }
        val withHr = r.filter { it.hrAvg != null }
        return EcgPeriod(
            label, r.size, r.sumOf { it.durationSec },
            withHr.takeIf { it.isNotEmpty() }?.map { it.hrAvg!! }?.average()?.roundToInt(),
            withHr.mapNotNull { it.hrMin }.minOrNull(),
            withHr.mapNotNull { it.hrMax }.maxOrNull()
        )
    }
    return listOf(
        period("Today", now - DAY),
        period("This week", now - WEEK),
        period("All time", 0L)
    )
}

@Composable
fun EcgStatsCard(rows: List<EcgSession>, who: String?, modifier: Modifier = Modifier) {
    val periods = ecgPeriods(rows)
    SectionCard(
        title = if (who != null) "Stats — $who" else "Stats — all profiles",
        modifier = modifier
    ) {
        if (rows.isEmpty()) {
            Text(
                "No sessions yet. Stats fill in as wears are recorded.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            return@SectionCard
        }
        StatRow(listOf("", "Sessions", "Time", "Avg HR", "Range"), header = true)
        periods.forEach { p ->
            StatRow(
                listOf(
                    p.label,
                    p.sessions.toString(),
                    formatSeconds(p.seconds),
                    p.hrAvg?.toString() ?: "—",
                    if (p.hrMin != null && p.hrMax != null) "${p.hrMin}–${p.hrMax}" else "—"
                ),
                accents = listOf(null, null, null, EcgTrace, null)
            )
        }
        Spacer(Modifier.height(10.dp))
        val last = rows.firstOrNull()
        if (last != null) {
            Text(
                "Last session: ${formatSeconds(last.durationSec)}, " +
                    (last.hrAvg?.let { "avg ${it.roundToInt()} bpm, " } ?: "") +
                    "${last.beats} beats, signal ${last.quality.ifBlank { "—" }}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private fun formatSeconds(s: Long): String = when {
    s < 60 -> "${s}s"
    s < 3600 -> "${s / 60}m ${s % 60}s"
    else -> "${s / 3600}h ${(s % 3600) / 60}m"
}

@Composable
private fun StatRow(
    cells: List<String>,
    header: Boolean = false,
    accents: List<Color?> = emptyList()
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        cells.forEachIndexed { i, c ->
            val accent = accents.getOrNull(i)
            Text(
                c,
                style = if (header) MaterialTheme.typography.labelSmall
                else if (i == 0) MaterialTheme.typography.bodyMedium
                else MaterialTheme.typography.titleMedium,
                fontWeight = if (header) FontWeight.Normal
                else if (i == 0) FontWeight.Normal else FontWeight.SemiBold,
                color = when {
                    header -> MaterialTheme.colorScheme.onSurfaceVariant
                    i == 0 -> MaterialTheme.colorScheme.onSurfaceVariant
                    accent != null && c != "—" -> accent
                    else -> MaterialTheme.colorScheme.onSurface
                },
                modifier = Modifier.weight(if (i == 0) 1.3f else 1f)
            )
        }
    }
}

@Composable
private fun Chip(text: String) {
    Column(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
