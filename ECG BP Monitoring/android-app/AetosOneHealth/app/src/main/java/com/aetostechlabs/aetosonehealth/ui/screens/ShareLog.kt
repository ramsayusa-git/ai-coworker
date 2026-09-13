package com.aetostechlabs.aetosonehealth.ui.screens

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Hands a diagnostic log to the system share sheet, as text *and* as a file.
 *
 * Both, deliberately: chat apps paste the text straight into a message, while
 * mail clients, Drive and bug trackers want something to attach. Offering only
 * one of the two means the log stops at whichever app the person happened to
 * pick — and a log that cannot leave the phone is no use to anyone.
 */
fun shareDiagnostics(context: Context, subject: String, body: String) {
    val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
    val file = runCatching {
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        File(dir, "aetos-log-$stamp.txt").apply { writeText(body) }
    }.getOrNull()

    val uri = file?.let {
        runCatching {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", it)
        }.getOrNull()
    }

    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, body)
        if (uri != null) {
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }
    context.startActivity(Intent.createChooser(intent, subject))
}
