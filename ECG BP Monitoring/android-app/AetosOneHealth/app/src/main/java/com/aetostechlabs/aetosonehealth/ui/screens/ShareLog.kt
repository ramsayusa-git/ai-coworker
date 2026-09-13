package com.aetostechlabs.aetosonehealth.ui.screens

import android.content.Context
import android.content.Intent

/**
 * Sends a diagnostic log off the phone in one tap. A log you have to retype by
 * hand is a log that never reaches anyone who can act on it.
 */
fun shareDiagnostics(context: Context, subject: String, body: String) {
    val i = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, body)
    }
    context.startActivity(Intent.createChooser(i, subject))
}
