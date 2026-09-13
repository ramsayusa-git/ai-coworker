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
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.aetostechlabs.aetosonehealth.data.hrBand
import com.aetostechlabs.aetosonehealth.ui.MonitorViewModel
import com.aetostechlabs.aetosonehealth.ui.components.BigValue
import com.aetostechlabs.aetosonehealth.ui.components.EcgStatsCard
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

    // Same rule as the BP screen: the last recorded session fills the tiles
    // until Scan is pressed, then they clear so this wear's numbers are
    // unmistakably this wear's.
    val started by vm.ecg.sessionStarted.collectAsState()
    val result by vm.ecg.lastResult.collectAsState()
    val wearing = state.step == com.aetostechlabs.aetosonehealth.ble.Step.LIVE ||
        state.step == com.aetostechlabs.aetosonehealth.ble.Step.READY
    val lastSession = remember(sessions, active?.id, started) {
        if (started) null
        else (if (active == null) sessions else sessions.filter { it.profileId == active?.id })
            .firstOrNull { it.hrAvg != null }
    }
    val context = LocalContext.current
    // The sensor sends its own heart-rate estimate once a second, independent of
    // our QRS detector. If the detector has not locked on yet, show that rather
    // than a dash: the device is telling us the answer and there is no reason to
    // withhold it.
    val streaming = wearing && (live.hr != null || live.deviceHr != null)
    val fromDetector = wearing && live.hr != null
    val finalHr = if (!wearing) result?.hrAvg?.roundToInt() else null
    val showHr = when {
        wearing -> live.hr ?: live.deviceHr
        else -> finalHr ?: lastSession?.hrAvg?.roundToInt()
    }
    val showRr = live.rrMs ?: showHr?.takeIf { it > 0 }?.let { (60000.0 / it).roundToInt() }
    val showBeats = when {
        wearing -> live.beats
        result != null -> result!!.beats
        else -> lastSession?.beats ?: 0
    }

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
                busy = wearing && showHr == null,
                label = "Heart rate", value = showHr?.toString() ?: "—", unit =
                showHr?.let {
                    when {
                        fromDetector -> hrBand(it) + " · live"
                        wearing && live.deviceHr != null -> "bpm · sensor estimate · live"
                        finalHr != null -> "session result · average"
                        else -> "last session average"
                    }
                } ?: (if (wearing) "waiting for beats…" else "bpm"),
                accent = EcgTrace, modifier = Modifier.weight(1f)
            )
            BigValue(
                "RR interval", showRr?.toString() ?: "—", "ms", BpPulse, Modifier.weight(1f),
                busy = wearing && showRr == null
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BigValue(
                "Beats", showBeats.toString(),
                when {
                    wearing -> "detected · live"
                    result != null -> "session result"
                    else -> "last session"
                }, AetosOrange, Modifier.weight(1f)
            )
            BigValue(
                "Device HR", live.deviceHr?.toString() ?: "—", "sensor's own estimate",
                MaterialTheme.colorScheme.primary, Modifier.weight(1f)
            )
        }

        // After the wear ends, the final result of THIS wear — what you read
        // once the live numbers stop moving.
        if (!wearing && result != null) {
            val r = result!!
            SectionCard("Session result") {
                Text(
                    r.hrAvg?.let { "%.0f bpm average".format(it) } ?: "No beats detected",
                    style = MaterialTheme.typography.titleLarge
                )
                Spacer(Modifier.height(6.dp))
                InfoRow("Duration", "${r.durationSec} s")
                InfoRow("Heart rate range",
                    if (r.hrMin != null && r.hrMax != null) "${r.hrMin}–${r.hrMax} bpm" else "—")
                InfoRow("Beats", r.beats.toString())
                InfoRow("Signal quality", r.quality.ifBlank { "—" })
                InfoRow("Samples", r.samples.toString())
            }
        }

        // Live stats — sessions, wear time, HR average / range by period.
        EcgStatsCard(
            if (active == null) sessions else sessions.filter { it.profileId == active?.id },
            active?.name
        )

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
            InfoRow("App version", appVersion())
            InfoRow("Sessions stored (this profile)", sessions.count {
                active == null || it.profileId == active?.id
            }.toString())
            InfoRow("Sessions stored (all)", sessions.size.toString())
        }

        if (state.log.isNotEmpty()) {
            SectionCard("Activity") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    OutlinedButton(onClick = {
                        shareDiagnostics(
                            context,
                            "Aetos One Health — ECG diagnostics",
                            buildString {
                                appendLine("app ${appVersion()}")
                                appendLine("device: ${state.info.name} ${state.info.address}")
                                appendLine("model: ${state.info.model} fw ${state.info.firmware}")
                                appendLine("step: ${state.step} · hr: ${live.hr} · beats: ${live.beats}")
                                appendLine("samples: ${live.samples} · quality: ${live.quality}")
                                appendLine("sessions stored: ${sessions.size}")
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
