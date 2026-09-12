package com.aetostechlabs.aetosonehealth.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.aetostechlabs.aetosonehealth.MainActivity
import com.aetostechlabs.aetosonehealth.R

class Notifier(private val context: Context) {

    companion object {
        const val CHANNEL_MONITOR = "monitor"
        const val CHANNEL_READINGS = "readings"
        const val ID_READING = 2001
        const val ID_SERVICE = 2002
    }

    private val manager = NotificationManagerCompat.from(context)

    fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val monitor = NotificationChannel(
            CHANNEL_MONITOR,
            context.getString(R.string.notif_channel_monitor),
            NotificationManager.IMPORTANCE_LOW
        ).apply { description = "Shown while a device is connected" }

        val readings = NotificationChannel(
            CHANNEL_READINGS,
            context.getString(R.string.notif_channel_readings),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply { description = "A new measurement has been recorded" }

        manager.createNotificationChannels(listOf(monitor, readings))
    }

    private fun canPost(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        context, 0,
        Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    fun readingRecorded(title: String, text: String) {
        if (!canPost()) return
        val n = NotificationCompat.Builder(context, CHANNEL_READINGS)
            .setSmallIcon(R.mipmap.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        runCatching { manager.notify(ID_READING, n) }
    }

    fun monitoring(text: String) = NotificationCompat.Builder(context, CHANNEL_MONITOR)
        .setSmallIcon(R.mipmap.ic_launcher_foreground)
        .setContentTitle(context.getString(R.string.app_name))
        .setContentText(text)
        .setContentIntent(openApp())
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()
}
