package com.aetostechlabs.aetosonehealth.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import kotlin.math.roundToInt
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aetostechlabs.aetosonehealth.data.hrBand
import com.aetostechlabs.aetosonehealth.ui.MonitorViewModel
import com.aetostechlabs.aetosonehealth.ui.components.BigValue
import com.aetostechlabs.aetosonehealth.ui.components.EcgWaveform
import com.aetostechlabs.aetosonehealth.ui.components.SectionCard
import com.aetostechlabs.aetosonehealth.ui.components.StepPanel
import com.aetostechlabs.aetosonehealth.ui.theme.AetosOrange
import com.aetostechlabs.aetosonehealth.ui.theme.BpPulse
import com.aetostechlabs.aetosonehealth.ui.theme.EcgTrace

@Composable
fun EcgScreen(vm: MonitorViewModel, modifier: Modifier = Modifier) {
    val state by vm.ecg.state.collectAsState()
    val live by vm.ecg.live.collectAsState()
    val cal by vm.calibration.collectAsState()
    val active by vm.activeProfile.collectAsState()
    val sessions by vm.repo.sessions.collectAsState()

    // Same rule as the BP screen: when nothing is streaming, fall back to the
    // last recorded session rather than showing dashes. A screen full of dashes
    // over a database full of readings reads as "it stopped working".
    val lastSession = remember(sessions, active?.id) {
        (if (active == null) sessions else sessions.filter { it.profileId == active?.id })
            .firstOrNull { it.hrAvg != null }
    }
    val streaming = live.hr != null
    val showHr = live.hr ?: lastSession?.hrAvg?.roundToInt()
    val showRr = live.rrMs ?: showHr?.takeIf { it > 0 }?.let { (60000.0 / it).roundToInt() }
    val showBeats = if (streaming) live.beats else (lastSession?.beats ?: 0)

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        StepPanel(state, onScan = { vm.ecg.scan() }, scanLabel = "Scan for the sensor")

        SectionCard("Live trace") {
            EcgWaveform(live.waveform)
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "Signal: ${live.quality.ifBlank { "—" }}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    if (live.contact) "Electrode contact OK" else "No contact",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (live.contact) EcgTrace else MaterialTheme.colorScheme.error
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BigValue(
                "Heart rate", showHr?.toString() ?: "—",
                showHr?.let { if (streaming) hrBand(it) else "last session average" } ?: "bpm",
                EcgTrace, Modifier.weight(1f)
            )
            BigValue(
                "RR interval", showRr?.toString() ?: "—", "ms", BpPulse, Modifier.weight(1f)
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BigValue(
                "Beats", showBeats.toString(),
                if (streaming) "detected" else "last session", AetosOrange, Modifier.weight(1f)
            )
            BigValue(
                "Device HR", live.deviceHr?.toString() ?: "—", "sensor's own estimate",
                MaterialTheme.colorScheme.primary, Modifier.weight(1f)
            )
        }

        if (cal.hr != 0 && live.rawHr != null) {
            SectionCard("Calibration in effect") {
                Text(
                    "Showing ${live.hr} bpm — the sensor reported ${live.rawHr} bpm and your " +
                        "offset of ${if (cal.hr > 0) "+" else ""}${cal.hr} is applied for display. " +
                        "History keeps the raw value.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        SectionCard("Device") {
            InfoRow("Name", state.info.name.ifBlank { "—" })
            InfoRow("Address", state.info.address.ifBlank { "—" })
            InfoRow("Model", state.info.model.ifBlank { "—" })
            InfoRow("Firmware", state.info.firmware.ifBlank { "—" })
            InfoRow("Samples this session", live.samples.toString())
        }

        if (state.log.isNotEmpty()) {
            SectionCard("Activity") {
                state.log.takeLast(8).reversed().forEach {
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
fun InfoRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
