package com.aetostechlabs.aetosonehealth

import android.content.Context
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Persists the last uncaught exception so a crash is recoverable information
 * rather than the app simply disappearing.
 *
 * An app that dies inside Application.onCreate never reaches an Activity, so a
 * crash screen alone would never be seen — which is why the handler is
 * installed as the very first thing the process does, and why startup work is
 * wrapped so the app still launches far enough to show what went wrong.
 */
object CrashLog {

    private const val FILE = "last-crash.txt"

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching { write(app, error, "uncaught on ${thread.name}") }
            previous?.uncaughtException(thread, error)
        }
    }

    fun write(context: Context, error: Throwable, where: String) {
        val sw = StringWriter()
        error.printStackTrace(PrintWriter(sw))
        val text = buildString {
            appendLine("Aetos One Health ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            appendLine(SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date()))
            appendLine("${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            appendLine("context: $where")
            appendLine()
            append(sw.toString())
        }
        runCatching { File(context.filesDir, FILE).writeText(text) }
    }

    fun read(context: Context): String? =
        runCatching {
            val f = File(context.filesDir, FILE)
            if (f.exists()) f.readText() else null
        }.getOrNull()

    fun clear(context: Context) {
        runCatching { File(context.filesDir, FILE).delete() }
    }
}
