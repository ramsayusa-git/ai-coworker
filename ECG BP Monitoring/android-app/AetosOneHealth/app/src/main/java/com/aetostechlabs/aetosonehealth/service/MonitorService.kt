package com.aetostechlabs.aetosonehealth.service

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import com.aetostechlabs.aetosonehealth.AetosApp
import com.aetostechlabs.aetosonehealth.notify.Notifier

/**
 * Keeps the process alive while a device is connected, so a wear or a cuff
 * measurement is not cut short when the screen goes off. It holds no BLE state
 * of its own — the engines live in the view models; this is purely the
 * foreground-service promise Android requires for connected-device work.
 */
class MonitorService : Service() {

    companion object {
        const val EXTRA_TEXT = "text"

        fun start(context: Context, text: String) {
            val i = Intent(context, MonitorService::class.java).putExtra(EXTRA_TEXT, text)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                context.startForegroundService(i)
            else context.startService(i)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MonitorService::class.java))
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Monitoring"
        val notifier = (application as AetosApp).notifier
        ServiceCompat.startForeground(
            this, Notifier.ID_SERVICE, notifier.monitoring(text),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            else 0
        )
        return START_STICKY
    }
}
