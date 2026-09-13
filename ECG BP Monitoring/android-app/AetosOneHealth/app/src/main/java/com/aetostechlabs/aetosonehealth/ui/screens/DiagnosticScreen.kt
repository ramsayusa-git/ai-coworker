package com.aetostechlabs.aetosonehealth.ui.screens

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.aetostechlabs.aetosonehealth.ui.components.SectionCard

/**
 * Shown when startup failed, or when a previous run crashed. The point is that
 * the trace can leave the phone: a stack trace the user cannot copy is barely
 * better than the app closing silently.
 */
@Composable
fun DiagnosticScreen(
    trace: String,
    onDismiss: () -> Unit,
    fatal: Boolean,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SectionCard(if (fatal) "The app could not start" else "The app closed unexpectedly") {
            Text(
                if (fatal)
                    "Something failed while starting up, so the main screen is not safe to " +
                        "show. The details below say what went wrong — send them over and " +
                        "they will point straight at the cause."
                else
                    "The previous run ended in a crash. The details below were saved at the " +
                        "time. Send them over, then dismiss this screen to carry on.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { share(context, trace) }) { Text("Send details") }
                if (!fatal) OutlinedButton(onClick = onDismiss) { Text("Dismiss") }
            }
        }

        SectionCard("Details") {
            Text(
                trace,
                style = MaterialTheme.typography.labelSmall,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.horizontalScroll(rememberScrollState())
            )
        }
    }
}

private fun share(context: Context, text: String) {
    val i = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "Aetos One Health — crash details")
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(i, "Send crash details"))
}
