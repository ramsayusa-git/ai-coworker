package com.aetostechlabs.aetosonehealth.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * One entry in the "Add a device" list.
 *
 * `rssi` is kept because it is the only honest way to tell two identically
 * named devices apart: the one in your hand is the strong one.
 */
data class FoundDevice(
    val address: String,
    val name: String?,
    val rssi: Int,
    val connectable: Boolean,
    val services: List<String> = emptyList()
) {
    val label: String get() = name?.takeIf { it.isNotBlank() } ?: "(no name)"

    /** A rough guess at what this is, from the name and advertised services. */
    val guess: DeviceKind?
        get() {
            val n = (name ?: "").lowercase()
            return when {
                n.startsWith("ikinloop") || n.contains("ecg") -> DeviceKind.ECG
                n.startsWith("rbp") || n.contains("bp") -> DeviceKind.BP
                services.any { it.startsWith("0000180d") } -> DeviceKind.ECG   // Heart Rate
                services.any { it.startsWith("0000fff0") } -> DeviceKind.BP
                else -> null
            }
        }
}

/** Re-exported so the UI layer does not import the data package for one enum. */
typealias DeviceKind = com.aetostechlabs.aetosonehealth.data.DeviceKind

/**
 * A plain "show me everything nearby" scanner for the Add Device screen.
 *
 * Deliberately unfiltered: the whole point is to surface a device whose name we
 * do not already know. It runs for a bounded window and is always stopped —
 * an LE scan left running is a real battery drain, and Android will eventually
 * throttle an app that starts too many.
 */
@SuppressLint("MissingPermission")
class DeviceScanner(private val context: Context) {

    private val _results = MutableStateFlow<List<FoundDevice>>(emptyList())
    val results: StateFlow<List<FoundDevice>> = _results.asStateFlow()

    private val _scanning = MutableStateFlow(false)
    val scanning: StateFlow<Boolean> = _scanning.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var callback: ScanCallback? = null
    private val seen = linkedMapOf<String, FoundDevice>()

    private val scanner
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)
            ?.adapter?.bluetoothLeScanner

    fun start() {
        if (_scanning.value) return
        _error.value = null

        if (!context.hasBlePermissions()) {
            _error.value = "Bluetooth permission has not been granted."
            return
        }
        val s = scanner ?: run {
            _error.value = "Bluetooth is off, or this phone has no LE scanner."
            return
        }

        seen.clear()
        _results.value = emptyList()

        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val dev = result.device ?: return
                val record = result.scanRecord
                val found = FoundDevice(
                    address = dev.address,
                    name = record?.deviceName ?: runCatching { dev.name }.getOrNull(),
                    rssi = result.rssi,
                    connectable = result.isConnectable,
                    services = record?.serviceUuids.orEmpty().map { it.uuid.toString() }
                )
                // Keep the best-known version of each address: a later
                // advertisement often carries the name when the first did not.
                val existing = seen[dev.address]
                seen[dev.address] = when {
                    existing == null -> found
                    found.name.isNullOrBlank() && !existing.name.isNullOrBlank() ->
                        existing.copy(rssi = found.rssi)
                    else -> found
                }
                _results.value = seen.values.sortedByDescending { it.rssi }
            }

            override fun onScanFailed(errorCode: Int) {
                _scanning.value = false
                _error.value = "Bluetooth scan failed (code $errorCode)."
            }
        }
        callback = cb

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .build()

        runCatching { s.startScan(emptyList(), settings, cb) }
            .onFailure {
                _error.value = it.message ?: "Could not start the scan."
                return
            }
        _scanning.value = true
    }

    fun stop() {
        val cb = callback ?: return
        runCatching { scanner?.stopScan(cb) }
        callback = null
        _scanning.value = false
    }
}
