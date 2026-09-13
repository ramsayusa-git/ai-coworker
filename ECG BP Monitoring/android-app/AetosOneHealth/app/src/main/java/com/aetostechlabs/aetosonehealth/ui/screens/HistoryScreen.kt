package com.aetostechlabs.aetosonehealth.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aetostechlabs.aetosonehealth.export.Exporter
import com.aetostechlabs.aetosonehealth.ui.MonitorViewModel
import com.aetostechlabs.aetosonehealth.ui.components.SectionCard
import com.aetostechlabs.aetosonehealth.ui.components.Series
import com.aetostechlabs.aetosonehealth.ui.components.TrendChart
import com.aetostechlabs.aetosonehealth.ui.theme.BpDiastolic
import com.aetostechlabs.aetosonehealth.ui.theme.BpSystolic
import com.aetostechlabs.aetosonehealth.ui.theme.EcgTrace
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val fmt = SimpleDateFormat("d MMM yyyy · HH:mm", Locale.getDefault())

@Composable
fun HistoryScreen(vm: MonitorViewModel, modifier: Modifier = Modifier) {
    var tab by remember { mutableIntStateOf(0) }
    val active by vm.activeProfile.collectAsState()
    val readings by vm.repo.bpReadings.collectAsState()
    val sessions by vm.repo.sessions.collectAsState()
    val cal by vm.calibration.collectAsState()
    val context = LocalContext.current

    // History follows the active profile, because that is what every other
    // screen is showing; "All profiles" is what you get with none selected.
    val bpRows = remember(readings, active?.id) {
        if (active == null) readings else readings.filter { it.profileId == active?.id }
    }
    val ecgRows = remember(sessions, active?.id) {
        if (active == null) sessions else sessions.filter { it.profileId == active?.id }
    }

    Column(modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = tab) {
            Tab(tab == 0, onClick = { tab = 0 }, text = { Text("BP Monitor") })
            Tab(tab == 1, onClick = { tab = 1 }, text = { Text("ECG sessions") })
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                active?.name ?: "All profiles",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f)
            )
            AssistChip(
                onClick = {
                    val f = if (tab == 0)
                        Exporter.bpCsv(context, bpRows, active?.name ?: "")
                    else Exporter.ecgCsv(context, ecgRows, active?.name ?: "")
                    Exporter.share(context, f, "text/csv")
                },
                label = { Text("CSV") },
                leadingIcon = { Icon(Icons.Filled.Share, null, Modifier.size(16.dp)) }
            )
            AssistChip(
                onClick = {
                    val f = Exporter.report(
                        context, active?.name ?: "", bpRows, ecgRows, cal.isActive
                    )
                    Exporter.share(context, f, "application/pdf")
                },
                label = { Text("PDF") },
                leadingIcon = { Icon(Icons.Filled.Share, null, Modifier.size(16.dp)) }
            )
        }

        if (tab == 0) {
            LazyColumn(
                Modifier.fillMaxSize().padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                item {
                    SectionCard("Last 20 readings") {
                        val recent = bpRows.take(20).reversed()
                        TrendChart(
                            listOf(
                                Series("Systolic", BpSystolic, recent.map { it.systolic.toFloat() }),
                                Series("Diastolic", BpDiastolic, recent.map { it.diastolic.toFloat() })
                            ),
                            bands = listOf(130f to BpSystolic, 80f to BpDiastolic)
                        )
                    }
                }
                if (bpRows.isEmpty()) {
                    item { EmptyNote("No blood-pressure readings recorded yet.") }
                }
                items(bpRows, key = { it.id }) { r ->
                    SectionCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${r.systolic}/${r.diastolic} mmHg",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    "${r.pulse} bpm · MAP ${"%.1f".format(r.meanArterial)} · ${r.category}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    fmt.format(Date(r.ts)) +
                                        (r.profileName?.let { " · $it" } ?: " · unassigned"),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(onClick = { vm.deleteBpReading(r.id) }) {
                                Icon(Icons.Filled.Delete, "Delete reading")
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(16.dp)) }
            }
        } else {
            LazyColumn(
                Modifier.fillMaxSize().padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                item {
                    SectionCard("Average heart rate per session") {
                        val recent = ecgRows.take(20).reversed().mapNotNull { it.hrAvg?.toFloat() }
                        TrendChart(listOf(Series("Avg HR", EcgTrace, recent)))
                    }
                }
                if (ecgRows.isEmpty()) {
                    item { EmptyNote("No ECG sessions recorded yet.") }
                }
                items(ecgRows, key = { it.id }) { s ->
                    SectionCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    s.hrAvg?.let { "%.1f bpm average".format(it) } ?: "No beats detected",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    "${s.durationSec} s · ${s.beats} beats · signal ${s.quality}" +
                                        if (s.hrMin != null && s.hrMax != null)
                                            " · ${s.hrMin}–${s.hrMax} bpm" else "",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    fmt.format(Date(s.startedAt)) +
                                        (s.profileName?.let { " · $it" } ?: " · unassigned"),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(onClick = { vm.deleteSession(s.id) }) {
                                Icon(Icons.Filled.Delete, "Delete session")
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
}

@Composable
private fun EmptyNote(text: String) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(18.dp)
    ) {
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
