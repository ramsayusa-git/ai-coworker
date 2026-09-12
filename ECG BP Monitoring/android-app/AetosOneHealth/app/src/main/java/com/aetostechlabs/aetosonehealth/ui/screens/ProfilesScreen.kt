package com.aetostechlabs.aetosonehealth.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aetostechlabs.aetosonehealth.data.Calibration
import com.aetostechlabs.aetosonehealth.ui.CalField
import com.aetostechlabs.aetosonehealth.ui.MonitorViewModel
import com.aetostechlabs.aetosonehealth.ui.components.SectionCard

@Composable
fun ProfilesScreen(vm: MonitorViewModel, modifier: Modifier = Modifier) {
    val profiles by vm.profiles.collectAsState()
    val active by vm.activeProfile.collectAsState()
    val cal by vm.calibration.collectAsState()
    var newName by remember { mutableStateOf("") }
    var newNote by remember { mutableStateOf("") }

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SectionCard("Who is being measured") {
            Text(
                "New readings are filed against the selected profile. Choose nobody and they " +
                    "stay unassigned until you file them later.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = active == null,
                    onClick = { vm.selectProfile(null) },
                    label = { Text("Unassigned") }
                )
            }
            Spacer(Modifier.height(8.dp))
            profiles.forEach { p ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    FilterChip(
                        selected = active?.id == p.id,
                        onClick = { vm.selectProfile(p.id) },
                        label = { Text(p.name) }
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        p.note,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = { vm.deleteProfile(p.id) }) {
                        Icon(Icons.Filled.Delete, "Delete ${p.name}")
                    }
                }
            }
            if (profiles.isEmpty()) {
                Text(
                    "No profiles yet — add one below.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        SectionCard("Add a profile") {
            OutlinedTextField(
                value = newName,
                onValueChange = { newName = it },
                label = { Text("Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = newNote,
                onValueChange = { newNote = it },
                label = { Text("Note (optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = {
                    if (newName.isNotBlank()) {
                        vm.addProfile(newName, newNote)
                        newName = ""; newNote = ""
                    }
                },
                enabled = newName.isNotBlank()
            ) {
                Icon(Icons.Filled.Add, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Add profile")
            }
        }

        CalibrationCard(vm, cal, active?.name)
    }
}

/**
 * Calibration lives on its own labelled card, in plain sight. An icon-only
 * entry point for something a user is actively hunting for is not
 * discoverable — that lesson came from the hub dashboards.
 */
@Composable
fun CalibrationCard(
    vm: MonitorViewModel,
    cal: Calibration,
    who: String?,
    modifier: Modifier = Modifier
) {
    SectionCard(
        if (who != null) "Calibration — $who" else "Calibration — unassigned readings",
        modifier
    ) {
        Text(
            "Align the app with your device's own screen. Offsets are applied when a value is " +
                "shown or exported; the raw measurement is always what gets stored, so you can " +
                "change these at any time without losing history.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(14.dp))

        Stepper("Systolic", cal.systolic, "mmHg") { vm.nudge(CalField.SYSTOLIC, it) }
        Stepper("Diastolic", cal.diastolic, "mmHg") { vm.nudge(CalField.DIASTOLIC, it) }
        Stepper("Pulse", cal.pulse, "bpm") { vm.nudge(CalField.PULSE, it) }
        Stepper("Heart rate (ECG)", cal.hr, "bpm") { vm.nudge(CalField.HR, it) }

        Spacer(Modifier.height(12.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                if (cal.isActive) "Offsets are active" else "No offsets applied",
                style = MaterialTheme.typography.labelMedium,
                color = if (cal.isActive) MaterialTheme.colorScheme.secondary
                else MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedButton(onClick = { vm.resetCalibration() }, enabled = cal.isActive) {
                Text("Reset to zero")
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "Range is limited to ±${Calibration.LIMIT}.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun Stepper(label: String, value: Int, unit: String, onNudge: (Int) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        FilledTonalButton(
            onClick = { onNudge(-1) },
            contentPadding = ButtonDefaults.TextButtonContentPadding
        ) { Icon(Icons.Filled.Remove, "Decrease $label", Modifier.size(18.dp)) }
        Text(
            text = (if (value > 0) "+$value" else "$value") + " $unit",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.width(96.dp).padding(horizontal = 8.dp)
        )
        FilledTonalButton(
            onClick = { onNudge(1) },
            contentPadding = ButtonDefaults.TextButtonContentPadding
        ) { Icon(Icons.Filled.Add, "Increase $label", Modifier.size(18.dp)) }
    }
}
