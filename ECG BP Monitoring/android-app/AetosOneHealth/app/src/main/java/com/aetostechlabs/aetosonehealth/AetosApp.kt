package com.aetostechlabs.aetosonehealth

import android.app.Application
import com.aetostechlabs.aetosonehealth.data.DeviceStore
import com.aetostechlabs.aetosonehealth.data.Repository
import com.aetostechlabs.aetosonehealth.notify.Notifier

/**
 * The app has one repository and one notifier for its whole lifetime. That is
 * all the dependency wiring this app needs — a DI framework here would add a
 * build-time annotation processor and buy nothing.
 *
 * Startup is deliberately defensive. Anything that throws in here (a database
 * that will not open, a notification channel the OEM rejects) would otherwise
 * kill the process before a single frame is drawn, and the user would see the
 * app "close immediately" with nothing to go on. Instead the failure is
 * recorded and the app launches into a screen that shows it.
 */
class AetosApp : Application() {

    lateinit var repository: Repository
        private set
    lateinit var notifier: Notifier
        private set
    lateinit var devices: DeviceStore
        private set

    /** Non-null when startup failed; MainActivity shows it instead of the UI. */
    var startupError: Throwable? = null
        private set

    val isReady: Boolean get() = startupError == null

    override fun onCreate() {
        super.onCreate()
        CrashLog.install(this)
        try {
            repository = Repository(this)
            devices = DeviceStore(this)
            notifier = Notifier(this).also { it.createChannels() }
        } catch (t: Throwable) {
            startupError = t
            CrashLog.write(this, t, "Application.onCreate")
        }
    }
}
