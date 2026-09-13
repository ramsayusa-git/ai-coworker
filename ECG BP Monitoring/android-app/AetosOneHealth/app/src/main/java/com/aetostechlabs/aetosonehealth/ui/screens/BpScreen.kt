package com.aetostechlabs.aetosonehealth.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import kotlinx.coroutines.delay
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.platform.LocalContext
import com.aetostechlabs.aetosonehealth.ui.MonitorViewModel
import com.aetostechlabs.aetosonehealth.ui.components.BigValue
import com.aetostechlabs.aetosonehealth.ui.components.BpStatsCard
import com.aetostechlabs.aetosonehealth.ui.components.SectionCard
import com.aetostechlabs.aetosonehealth.ui.components.Series
import com.aetostechlabs.aetosonehealth.ui.components.StepPanel
import com.aetostechlabs.aetosonehealth.ui.components.TrendChart
import com.aetostechlabs.aetosonehealth.ui.theme.BpDiastolic
import com.aetostechlabs.aetosonehealth.ui.theme.BpPulse
import com.aetostechlabs.aetosonehealth.ui.theme.BpSystolic
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun BpScreen(vm: MonitorViewModel, modifier: Modifier = Modifier) {
    val state by vm.bp.state.collectAsState()
    val live by vm.bp.live.collectAsState()
    val active by vm.activeProfile.collectAsState()
    val readings by vm.repo.bpReadings.collectAsState()
    val context = LocalContext.current

    val mine = remember2(readings, active?.id) {
        if (active == null) readings else readings.filter { it.profileId == active?.id }
    }
    val recent = mine.take(20).reversed()

    // Before Scan is pressed the tiles show the last stored reading, so opening
    // the app is useful. The moment Scan is pressed they clear and show only
    // this session's result — otherwise a stale value sits there through the
    // whole measurement and you cannot tell when the new one lands.
    val started by vm.bp.sessionStarted.collectAsState()
    val measuring = state.connected && live.systolic == null
    // Elapsed time since the link came up — the one thing that visibly moves
    // while the cuff is inflating, because the cuff itself sends nothing until
    // it has a result.
    val elapsedState = remember { mutableIntStateOf(0) }
    val elapsed = elapsedState.intValue
    LaunchedEffect(measuring) {
        elapsedState.intValue = 0
        while (measuring) {
            delay(1000)
            elapsedState.intValue++
        }
    }
    val latest = if (started) null else mine.firstOrNull()
    val showSys = live.systolic ?: latest?.systolic
    val showDia = live.diastolic ?: latest?.diastolic
    val showPulse = live.pulse ?: latest?.pulse
    val showMap = live.meanArterial ?: latest?.meanArterial
    val showCategory = live.category.ifBlank { latest?.category ?: "" }
    val showTime = live.readingTime ?: latest?.ts
    val isLive = live.systolic != null

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        StepPanel(state, onScan = { vm.bp.scan() }, scanLabel = "Scan for the cuff")

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BigValue(
                "Systolic", showSys?.toString() ?: "—",
                if (measuring) "measuring…" else "mmHg · upper",
                BpSystolic, Modifier.weight(1f), busy = measuring
            )
            BigValue(
                "Diastolic", showDia?.toString() ?: "—",
                if (measuring) "measuring…" else "mmHg · lower",
                BpDiastolic, Modifier.weight(1f), busy = measuring
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BigValue(
                "Pulse", showPulse?.toString() ?: "—",
                if (measuring) "measuring…" else "bpm",
                BpPulse, Modifier.weight(1f), busy = measuring
            )
            BigValue(
                "Mean arterial", showMap?.let { "%.1f".format(it) } ?: "—",
                if (measuring) "measuring…" else "mmHg",
                MaterialTheme.colorScheme.primary, Modifier.weight(1f), busy = measuring
            )
        }

        // Connected with nothing to show is the confusing state: the cuff only
        // sends a frame when *it* completes a measurement, so say so plainly
        // rather than leaving four dashes on screen.
        if (measuring) {
            SectionCard("Measuring — live") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.CircularProgressIndicator(
                        Modifier.size(18.dp), strokeWidth = 2.5.dp,
                        color = MaterialTheme.colorScheme.secondary
                    )
                    Spacer(Modifier.size(10.dp))
                    Text(
                        "Connected for ${elapsed}s · waiting for the cuff to finish",
                        style = MaterialTheme.typography.titleMedium
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "This cuff sends nothing while it inflates — it transmits exactly one " +
                        "packet, with the result, the moment the measurement completes. Put " +
                        "it on your arm and press START on the cuff itself; the values land " +
                        "here automatically.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Bluetooth packets received so far: ${vm.bp.notifications}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    "If that stays at 0 through a whole measurement, the cuff is not " +
                        "sending on the channel we subscribed to. The Activity list below " +
                        "shows every packet as it arrives.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (showCategory.isNotBlank()) {
            SectionCard(if (isLive) "Final reading" else "Last recorded reading") {
                if (isLive) {
                    Text(
                        "${live.systolic}/${live.diastolic} mmHg · ${live.pulse} bpm",
                        style = MaterialTheme.typography.titleLarge
                    )
                    Spacer(Modifier.height(4.dp))
                }
                Text(showCategory, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                showTime?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Measured ${SimpleDateFormat("d MMM, HH:mm", Locale.getDefault()).format(Date(it))}" +
                            if (live.calibrated) " · calibration applied" else "",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (live.calibrated && live.rawSystolic != null) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Cuff reported ${live.rawSystolic}/${live.rawDiastolic} · ${live.rawPulse} bpm — " +
                            "history stores that raw value.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // Live stats — count, averages, min/max by period, category breakdown.
        // Derived from the stored readings, so it updates the instant a new
        // reading lands.
        BpStatsCard(mine, active?.name)

        SectionCard(if (active != null) "Trend — ${active?.name}" else "Trend — all profiles") {
            TrendChart(
                series = listOf(
                    Series("Systolic", BpSystolic, recent.map { it.systolic.toFloat() }),
                    Series("Diastolic", BpDiastolic, recent.map { it.diastolic.toFloat() }),
                    Series("Pulse", BpPulse, recent.map { it.pulse.toFloat() })
                ),
                // The 130/80 stage-1 thresholds, so a point is readable at a glance.
                bands = listOf(130f to BpSystolic, 80f to BpDiastolic)
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                LegendDot("Systolic", BpSystolic)
                LegendDot("Diastolic", BpDiastolic)
                LegendDot("Pulse", BpPulse)
            }
        }

        SectionCard("Device") {
            InfoRow("Name", state.info.name.ifBlank { "—" })
            InfoRow("Address", state.info.address.ifBlank { "—" })
            InfoRow("Model", state.info.model.ifBlank { "—" })
            InfoRow("Firmware", state.info.firmware.ifBlank { "—" })
            InfoRow("App version", appVersion())
            InfoRow("Readings stored (this profile)", mine.size.toString())
            InfoRow("Readings stored (all)", readings.size.toString())
        }

        if (state.log.isNotEmpty()) {
            SectionCard("Activity") {
                // One tap to get the whole log off the phone. A diagnostic you
                // have to retype by hand is a diagnostic that never arrives.
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    OutlinedButton(onClick = {
                        shareDiagnostics(
                            context,
                            "Aetos One Health — BP diagnostics",
                            buildString {
                                appendLine("device: ${state.info.name} ${state.info.address}")
                                appendLine("model: ${state.info.model} fw ${state.info.firmware}")
                                appendLine("step: ${state.step} · packets: ${vm.bp.notifications}")
                                appendLine()
                                state.log.forEach { appendLine(it) }
                            }
                        )
                    }) { Text("Share this log") }
                }
                Spacer(Modifier.height(6.dp))
                state.log.reversed().forEach {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun LegendDot(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(9.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(color)
        )
        Text(
            "  $label",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/** Tiny helper so the filter is not recomputed on every unrelated recomposition. */
@Composable
private fun <T> remember2(a: Any?, b: Any?, calc: () -> T): T =
    androidx.compose.runtime.remember(a, b) { calc() }
