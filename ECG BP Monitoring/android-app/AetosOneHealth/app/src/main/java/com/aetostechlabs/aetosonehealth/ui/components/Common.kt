package com.aetostechlabs.aetosonehealth.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aetostechlabs.aetosonehealth.ble.MonitorState
import com.aetostechlabs.aetosonehealth.ble.Step

@Composable
fun SectionCard(
    title: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            if (title != null) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
            }
            content()
        }
    }
}

@Composable
fun StatusPill(state: MonitorState) {
    val (bg, fg, label) = when {
        state.step == Step.LIVE -> Triple(Color(0xFFE2F5EC), Color(0xFF12724B), "Live")
        state.connected -> Triple(Color(0xFFE2F5EC), Color(0xFF12724B), "Connected")
        state.step.isWorking -> Triple(Color(0xFFFFF0E0), Color(0xFF9A5200), state.title)
        else -> Triple(Color(0xFFF0F1F5), Color(0xFF5A6478), "Not connected")
    }
    Row(
        Modifier.clip(RoundedCornerShape(999.dp)).background(bg).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(8.dp).clip(RoundedCornerShape(999.dp)).background(fg))
        Spacer(Modifier.width(7.dp))
        Text(label, color = fg, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * The guided step panel. The Scan button lives here and is ALWAYS present —
 * disabled with a "Scanning…" label while a pass is in flight, never hidden.
 * A control that vanishes is how a user ends up asking how to start a scan.
 */
@Composable
fun StepPanel(
    state: MonitorState,
    onScan: () -> Unit,
    scanLabel: String = "Scan for the device",
    modifier: Modifier = Modifier
) {
    SectionCard(modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (state.step.isWorking) {
                CircularProgressIndicator(
                    Modifier.size(18.dp),
                    strokeWidth = 2.5.dp,
                    color = MaterialTheme.colorScheme.secondary
                )
                Spacer(Modifier.width(10.dp))
            }
            Text(state.title, style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(6.dp))
        Text(
            state.hint,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        AnimatedVisibility(state.detail.isNotBlank()) {
            Column {
                Spacer(Modifier.height(10.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(10.dp)
                ) {
                    Text(
                        state.detail,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // The label follows the actual state. It previously read
            // "Scanning…" whenever the button was disabled, which meant a
            // connected, idle-and-waiting device showed a greyed "Scanning…" —
            // the one thing guaranteed to look broken when it is working.
            val connected = state.step == Step.READY || state.step == Step.LIVE
            Button(
                onClick = onScan,
                enabled = state.canScan,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Icon(Icons.Filled.Search, contentDescription = null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    when {
                        state.canScan -> scanLabel
                        connected -> "Connected"
                        else -> "Scanning…"
                    }
                )
            }
            if (state.attempts > 0) {
                Text(
                    "pass ${state.attempts}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun BigValue(
    label: String,
    value: String,
    unit: String,
    accent: Color,
    modifier: Modifier = Modifier,
    busy: Boolean = false
) {
    // While a measurement is in progress and the device has not yet produced a
    // number, the tile pulses instead of sitting on a static dash. It is an
    // honest "working" indicator: the value it shows is still no value.
    val pulse = rememberInfiniteTransition(label = "busy")
    val alpha by pulse.animateFloat(
        initialValue = 0.25f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
        label = "busyAlpha"
    )
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(RoundedCornerShape(2.dp)).background(accent))
                Spacer(Modifier.width(7.dp))
                Text(
                    label,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.height(6.dp))
            if (busy && value == "—") {
                Text(
                    "•••",
                    style = MaterialTheme.typography.headlineMedium,
                    color = accent.copy(alpha = alpha)
                )
            } else {
                Text(
                    value,
                    style = MaterialTheme.typography.headlineMedium,
                    color = if (value == "—") MaterialTheme.colorScheme.outline else accent
                )
            }
            Text(
                unit,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
