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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.platform.LocalContext
import android.content.Context
import android.content.Intent
import com.aetostechlabs.aetosonehealth.ui.MonitorViewModel
import com.aetostechlabs.aetosonehealth.ui.components.BigValue
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
                "Systolic", live.systolic?.toString() ?: "—", "mmHg · upper",
                BpSystolic, Modifier.weight(1f)
            )
            BigValue(
                "Diastolic", live.diastolic?.toString() ?: "—", "mmHg · lower",
                BpDiastolic, Modifier.weight(1f)
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BigValue("Pulse", live.pulse?.toString() ?: "—", "bpm", BpPulse, Modifier.weight(1f))
            BigValue(
                "Mean arterial", live.meanArterial?.let { "%.1f".format(it) } ?: "—", "mmHg",
                MaterialTheme.colorScheme.primary, Modifier.weight(1f)
            )
        }

        // Connected with nothing to show is the confusing state: the cuff only
        // sends a frame when *it* completes a measurement, so say so plainly
        // rather than leaving four dashes on screen.
        if (state.connected && live.systolic == null) {
            SectionCard("Waiting for a measurement") {
                Text(
                    "The link is up. This cuff stays silent until a measurement finishes, " +
                        "then sends exactly one packet with the result — it transmits nothing " +
                        "else, ever. Put it on your arm and press START on the cuff itself.",
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

        if (live.category.isNotBlank()) {
            SectionCard {
                Text(live.category, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                live.readingTime?.let {
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
                        shareText(
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
                    }) { Text("Send this log") }
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

private fun shareText(context: Context, subject: String, body: String) {
    val i = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, body)
    }
    context.startActivity(Intent.createChooser(i, subject))
}
