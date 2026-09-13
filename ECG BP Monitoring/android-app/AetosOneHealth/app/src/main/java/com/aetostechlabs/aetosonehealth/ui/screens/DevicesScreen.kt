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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aetostechlabs.aetosonehealth.ble.FoundDevice
import com.aetostechlabs.aetosonehealth.data.DeviceKind
import com.aetostechlabs.aetosonehealth.ui.MonitorViewModel
import com.aetostechlabs.aetosonehealth.ui.components.SectionCard

/**
 * "Add a device" — an unfiltered scan of everything nearby, so a unit whose
 * name the app does not already know can still be picked.
 *
 * Once picked, a device is matched by MAC address rather than by advertised
 * name. That is the point of the screen: name matching guesses, an address is
 * exact, and it is what makes a replacement or second unit work at all.
 */
@Composable
fun DevicesScreen(vm: MonitorViewModel, modifier: Modifier = Modifier) {
    val found by vm.scanner.results.collectAsState()
    val scanning by vm.scanner.scanning.collectAsState()
    val error by vm.scanner.error.collectAsState()
    val saved by vm.devices.devices.collectAsState()
    var picking by remember { mutableStateOf<FoundDevice?>(null) }

    // Never leave an LE scan running behind the user's back.
    DisposableEffect(Unit) { onDispose { vm.scanner.stop() } }

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SectionCard("Your devices") {
            Text(
                "The app can find the standard ECG sensor and RBP cuff on its own. Pick a " +
                    "device here when yours has a different name, when you have more than " +
                    "one, or when automatic matching is not finding it — a picked device is " +
                    "matched by its Bluetooth address, which is exact.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(14.dp))
            SavedRow("ECG sensor", saved[DeviceKind.ECG]?.let { "${it.name} · ${it.address}" },
                onForget = { vm.forgetDevice(DeviceKind.ECG) })
            Spacer(Modifier.height(8.dp))
            SavedRow("BP Monitor", saved[DeviceKind.BP]?.let { "${it.name} · ${it.address}" },
                onForget = { vm.forgetDevice(DeviceKind.BP) })
        }

        SectionCard("Add a new device") {
            Text(
                "Wake the device first — press its button or put it on. Both of these " +
                    "advertise for only a few seconds after waking, so start the scan with " +
                    "the device already awake.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (scanning) {
                    OutlinedButton(onClick = { vm.scanner.stop() }) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Stop scanning")
                    }
                } else {
                    Button(onClick = { vm.scanner.start() }) {
                        Icon(Icons.Filled.Search, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Scan for devices")
                    }
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    "${found.size} found",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            error?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error)
            }
        }

        if (found.isEmpty() && !scanning) {
            SectionCard {
                Text(
                    "Nothing found yet. Press Scan with the device awake and within about " +
                        "two metres of the phone.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        found.forEach { d ->
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Bluetooth, null,
                        Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                d.label,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            d.guess?.let {
                                Spacer(Modifier.width(8.dp))
                                Tag(if (it == DeviceKind.ECG) "looks like ECG" else "looks like BP")
                            }
                        }
                        Text(
                            d.address,
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            "signal ${d.rssi} dBm" +
                                if (!d.connectable) " · not connectable" else "",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    TextButton(onClick = { picking = d }) { Text("Use this") }
                }
            }
        }
    }

    picking?.let { d ->
        AlertDialog(
            onDismissRequest = { picking = null },
            title = { Text("Use ${d.label}?") },
            text = {
                Text(
                    "Which device is this? The app will match it by its address " +
                        "(${d.address}) from now on."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.saveDevice(DeviceKind.ECG, d)
                    picking = null
                }) { Text("ECG sensor") }
            },
            dismissButton = {
                TextButton(onClick = {
                    vm.saveDevice(DeviceKind.BP, d)
                    picking = null
                }) { Text("BP Monitor") }
            }
        )
    }
}

@Composable
private fun SavedRow(label: String, value: String?, onForget: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.titleMedium)
            Text(
                value ?: "Not set — found automatically by name",
                style = MaterialTheme.typography.labelSmall,
                fontFamily = if (value != null) FontFamily.Monospace else FontFamily.Default,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (value != null) TextButton(onClick = onForget) { Text("Forget") }
    }
}

@Composable
private fun Tag(text: String) {
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.secondaryContainer)
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSecondaryContainer
        )
    }
}
