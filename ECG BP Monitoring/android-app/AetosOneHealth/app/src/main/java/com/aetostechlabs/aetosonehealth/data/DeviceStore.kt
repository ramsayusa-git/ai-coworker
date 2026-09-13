package com.aetostechlabs.aetosonehealth.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class DeviceKind { ECG, BP }

/**
 * A device the user has picked, remembered by MAC address.
 *
 * Matching by address beats matching by advertised name: two cuffs in the same
 * room both answer to "RBP", a replacement unit has a different name entirely,
 * and some firmware omits the name from the advertisement altogether. The name
 * is kept only so the UI has something readable to show.
 */
data class SavedDevice(
    val kind: DeviceKind,
    val address: String,
    val name: String
)

/**
 * Remembers which physical device is the ECG sensor and which is the cuff.
 *
 * Small enough for SharedPreferences, and deliberately separate from the health
 * database — losing a device pairing should never risk a reading.
 */
class DeviceStore(context: Context) {

    private val prefs = context.getSharedPreferences("devices", Context.MODE_PRIVATE)

    private val _devices = MutableStateFlow(load())
    val devices: StateFlow<Map<DeviceKind, SavedDevice>> = _devices.asStateFlow()

    private fun load(): Map<DeviceKind, SavedDevice> = buildMap {
        for (kind in DeviceKind.entries) {
            val addr = prefs.getString("${kind.name}_address", null) ?: continue
            val name = prefs.getString("${kind.name}_name", "") ?: ""
            put(kind, SavedDevice(kind, addr, name))
        }
    }

    fun save(kind: DeviceKind, address: String, name: String) {
        prefs.edit()
            .putString("${kind.name}_address", address)
            .putString("${kind.name}_name", name)
            .apply()
        _devices.value = load()
    }

    fun forget(kind: DeviceKind) {
        prefs.edit()
            .remove("${kind.name}_address")
            .remove("${kind.name}_name")
            .apply()
        _devices.value = load()
    }

    operator fun get(kind: DeviceKind): SavedDevice? = _devices.value[kind]
}
