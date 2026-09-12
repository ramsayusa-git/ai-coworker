package com.aetostechlabs.aetosonehealth.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.aetostechlabs.aetosonehealth.AetosApp
import com.aetostechlabs.aetosonehealth.ble.BpEngine
import com.aetostechlabs.aetosonehealth.ble.EcgEngine
import com.aetostechlabs.aetosonehealth.ble.Step
import com.aetostechlabs.aetosonehealth.data.Calibration
import com.aetostechlabs.aetosonehealth.data.Profile
import com.aetostechlabs.aetosonehealth.service.MonitorService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class MonitorViewModel(app: Application) : AndroidViewModel(app) {

    private val appCtx = app as AetosApp
    val repo = appCtx.repository
    private val notifier = appCtx.notifier

    val ecg = EcgEngine(app, repo, viewModelScope) { text ->
        notifier.readingRecorded("ECG session saved", text)
    }
    val bp = BpEngine(app, repo, viewModelScope) { text ->
        notifier.readingRecorded("New blood-pressure reading", text)
    }

    val profiles: StateFlow<List<Profile>> = repo.profiles
    val activeProfile: StateFlow<Profile?> = repo.activeProfile
    val calibration: StateFlow<Calibration> = repo.calibration

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    init {
        // The foreground service tracks whichever device is currently up, so a
        // wear or a measurement survives the screen going off.
        viewModelScope.launch {
            combine(ecg.state, bp.state) { e, b -> e.step to b.step }.collect { (es, bs) ->
                val busy = es == Step.LIVE || es == Step.READY || bs == Step.READY
                if (busy) {
                    val what = when {
                        es == Step.LIVE -> "ECG streaming"
                        es == Step.READY -> "ECG sensor connected"
                        else -> "BP cuff connected"
                    }
                    MonitorService.start(getApplication(), what)
                } else {
                    MonitorService.stop(getApplication())
                }
            }
        }
    }

    fun clearMessage() { _message.value = null }
    fun say(text: String) { _message.value = text }

    // ------------------------------------------------------------ profiles
    fun addProfile(name: String, note: String = "") {
        repo.addProfile(name, note)
            .onSuccess { p ->
                // A profile created mid-wear should own that wear rather than
                // leaving it stranded as unassigned.
                repo.reattributeOpenSession(p.id)
                say("Profile \"${p.name}\" added")
            }
            .onFailure { say(it.message ?: "Could not add that profile") }
    }

    fun selectProfile(id: Long?) = repo.setActiveProfile(id)
    fun renameProfile(id: Long, name: String, note: String) = repo.updateProfile(id, name, note)
    fun deleteProfile(id: Long) = repo.deleteProfile(id)

    // --------------------------------------------------------- calibration
    /**
     * The steppers send the new ABSOLUTE offset, never a delta, so a double-tap
     * on a slow screen can never apply the same nudge twice.
     */
    fun setCalibration(cal: Calibration) =
        repo.setCalibration(activeProfile.value?.id, cal)

    fun nudge(field: CalField, by: Int) {
        val c = calibration.value
        val next = when (field) {
            CalField.SYSTOLIC -> c.copy(systolic = Calibration.clamp(c.systolic + by))
            CalField.DIASTOLIC -> c.copy(diastolic = Calibration.clamp(c.diastolic + by))
            CalField.PULSE -> c.copy(pulse = Calibration.clamp(c.pulse + by))
            CalField.HR -> c.copy(hr = Calibration.clamp(c.hr + by))
        }
        setCalibration(next)
    }

    fun resetCalibration() = repo.resetCalibration(activeProfile.value?.id)

    // ------------------------------------------------------------- history
    fun deleteBpReading(id: Long) = repo.deleteBpReading(id)
    fun deleteSession(id: Long) = repo.deleteSession(id)

    override fun onCleared() {
        ecg.stop()
        bp.stop()
        MonitorService.stop(getApplication())
        super.onCleared()
    }
}

enum class CalField { SYSTOLIC, DIASTOLIC, PULSE, HR }
