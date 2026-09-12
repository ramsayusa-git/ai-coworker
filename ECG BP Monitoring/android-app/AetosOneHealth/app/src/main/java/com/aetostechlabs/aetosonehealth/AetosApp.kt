package com.aetostechlabs.aetosonehealth

import android.app.Application
import com.aetostechlabs.aetosonehealth.data.Repository
import com.aetostechlabs.aetosonehealth.notify.Notifier

/**
 * The app has one repository and one notifier for its whole lifetime. That is
 * all the dependency wiring this app needs — a DI framework here would add a
 * build-time annotation processor and buy nothing.
 */
class AetosApp : Application() {

    lateinit var repository: Repository
        private set
    lateinit var notifier: Notifier
        private set

    override fun onCreate() {
        super.onCreate()
        repository = Repository(this)
        notifier = Notifier(this).also { it.createChannels() }
    }
}
