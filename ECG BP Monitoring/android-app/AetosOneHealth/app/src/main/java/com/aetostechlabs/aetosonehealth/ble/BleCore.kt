package com.aetostechlabs.aetosonehealth.ble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import java.util.UUID

val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

/** The permissions the app must hold before any scan or connect. */
fun blePermissions(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
        arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    else
        arrayOf(
            Manifest.permission.BLUETOOTH, Manifest.permission.BLUETOOTH_ADMIN,
            Manifest.permission.ACCESS_FINE_LOCATION
        )

fun Context.hasBlePermissions(): Boolean = blePermissions().all {
    ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
}

class BleUnavailable(msg: String) : Exception(msg)
class BleError(msg: String) : Exception(msg)

/**
 * A small suspend wrapper over Android's callback-based GATT API.
 *
 * Two details matter for these particular devices, both learned the hard way on
 * the hub:
 *  - Connect over the LE transport explicitly (TRANSPORT_LE). The BP cuff gets
 *    cached as dual-mode by some stacks, and an auto-transport connect then
 *    tries BR/EDR profiles the cuff does not have and fails outright.
 *  - Stop scanning before connecting; leaving the scanner running makes the
 *    connect flaky on many phones.
 */
@SuppressLint("MissingPermission")
class BleClient(private val context: Context) {

    private val manager: BluetoothManager? =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val adapter: BluetoothAdapter?
        get() = manager?.adapter

    private var gatt: BluetoothGatt? = null
    private var onNotify: ((UUID, ByteArray) -> Unit)? = null
    private var onDisconnect: (() -> Unit)? = null

    private var connectResult: CompletableDeferred<Unit>? = null
    private var servicesResult: CompletableDeferred<Unit>? = null
    private var readResult: CompletableDeferred<ByteArray?>? = null
    private var writeDescResult: CompletableDeferred<Boolean>? = null

    var deviceAddress: String? = null
        private set
    var deviceName: String? = null
        private set

    val isConnected: Boolean
        get() = deviceAddress != null && gatt != null &&
            manager?.getConnectedDevices(BluetoothProfile.GATT)
                ?.any { it.address == deviceAddress } == true

    fun requireAdapter(): BluetoothAdapter {
        val a = adapter ?: throw BleUnavailable("This phone has no Bluetooth adapter")
        if (!a.isEnabled) throw BleUnavailable("Bluetooth is switched off")
        if (!context.hasBlePermissions()) throw BleUnavailable("Bluetooth permission not granted")
        return a
    }

    // ------------------------------------------------------------- scanning
    /**
     * One scan pass. Returns the first device matching [address] (preferred) or
     * whose name starts with [namePrefix], or null when the pass times out. The
     * app never loops the scanner by itself — exactly like the hub add-ons.
     */
    suspend fun scan(
        address: String?,
        namePrefix: String?,
        serviceUuid: UUID?,
        timeoutMs: Long,
        onTick: ((Int) -> Unit)? = null
    ): BluetoothDevice? {
        val scanner = requireAdapter().bluetoothLeScanner
            ?: throw BleUnavailable("Bluetooth LE scanner unavailable")
        val found = CompletableDeferred<BluetoothDevice>()

        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val dev = result.device ?: return
                val name = result.scanRecord?.deviceName ?: runCatching { dev.name }.getOrNull()
                val addrMatch = address != null && dev.address.equals(address, ignoreCase = true)
                val nameMatch = !namePrefix.isNullOrBlank() &&
                    name?.startsWith(namePrefix, ignoreCase = true) == true
                if (addrMatch || nameMatch) {
                    deviceName = name
                    if (!found.isCompleted) found.complete(dev)
                }
            }

            override fun onScanFailed(errorCode: Int) {
                if (!found.isCompleted) found.completeExceptionally(
                    BleError("Bluetooth scan failed (code $errorCode)")
                )
            }
        }

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .build()
        // An empty filter list scans everything; a service filter is used when
        // the device advertises one, because it is far kinder to the battery.
        val filters = serviceUuid?.let {
            listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(it)).build())
        } ?: emptyList()

        scanner.startScan(filters, settings, cb)
        return try {
            withTimeout(timeoutMs) {
                if (onTick != null) {
                    var left = (timeoutMs / 1000).toInt()
                    while (!found.isCompleted && left > 0) {
                        onTick(left)
                        delay(1000)
                        left--
                    }
                }
                found.await()
            }
        } catch (e: TimeoutCancellationException) {
            null
        } finally {
            runCatching { scanner.stopScan(cb) }
        }
    }

    // ------------------------------------------------------------ connecting
    suspend fun connect(device: BluetoothDevice, timeoutMs: Long = 20_000) {
        close()
        deviceAddress = device.address
        val deferred = CompletableDeferred<Unit>()
        connectResult = deferred
        gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        try {
            withTimeout(timeoutMs) { deferred.await() }
        } catch (e: TimeoutCancellationException) {
            close()
            throw BleError("Timed out opening the Bluetooth link")
        }
    }

    suspend fun discoverServices(timeoutMs: Long = 15_000) {
        val g = gatt ?: throw BleError("Not connected")
        val deferred = CompletableDeferred<Unit>()
        servicesResult = deferred
        if (!g.discoverServices()) throw BleError("Could not start service discovery")
        try {
            withTimeout(timeoutMs) { deferred.await() }
        } catch (e: TimeoutCancellationException) {
            throw BleError("Timed out reading the device's services")
        }
    }

    fun characteristic(service: UUID, char: UUID): BluetoothGattCharacteristic? =
        gatt?.getService(service)?.getCharacteristic(char)

    /** Every notifying/indicating characteristic the device exposes. */
    fun notifyingCharacteristics(): List<BluetoothGattCharacteristic> =
        gatt?.services.orEmpty().flatMap { it.characteristics }.filter {
            it.properties and (BluetoothGattCharacteristic.PROPERTY_NOTIFY or
                BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
        }

    suspend fun readString(service: UUID, char: UUID): String? {
        val c = characteristic(service, char) ?: return null
        val g = gatt ?: return null
        val deferred = CompletableDeferred<ByteArray?>()
        readResult = deferred
        if (!g.readCharacteristic(c)) return null
        val bytes = runCatching { withTimeout(5_000) { deferred.await() } }.getOrNull()
            ?: return null
        return bytes.toString(Charsets.UTF_8).trim().takeIf { it.isNotEmpty() }
    }

    suspend fun subscribe(c: BluetoothGattCharacteristic): Boolean {
        val g = gatt ?: return false
        if (!g.setCharacteristicNotification(c, true)) return false
        val cccd = c.getDescriptor(CCCD) ?: return false
        val indicate = c.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0
        val value = if (indicate) BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
        else BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        val deferred = CompletableDeferred<Boolean>()
        writeDescResult = deferred
        val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeDescriptor(cccd, value) == BluetoothGatt.GATT_SUCCESS
        } else {
            @Suppress("DEPRECATION")
            run {
                cccd.value = value
                g.writeDescriptor(cccd)
            }
        }
        if (!started) return false
        return runCatching { withTimeout(5_000) { deferred.await() } }.getOrDefault(false)
    }

    fun onNotification(cb: (UUID, ByteArray) -> Unit) {
        onNotify = cb
    }

    fun onDisconnected(cb: () -> Unit) {
        onDisconnect = cb
    }

    fun requestMtu(mtu: Int = 247) {
        runCatching { gatt?.requestMtu(mtu) }
    }

    fun close() {
        runCatching { gatt?.disconnect() }
        runCatching { gatt?.close() }
        gatt = null
    }

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> connectResult?.complete(Unit)
                BluetoothProfile.STATE_DISCONNECTED -> {
                    connectResult?.takeIf { !it.isCompleted }?.completeExceptionally(
                        BleError("The device refused or dropped the connection (status $status)")
                    )
                    onDisconnect?.invoke()
                }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) servicesResult?.complete(Unit)
            else servicesResult?.completeExceptionally(
                BleError("Service discovery failed (status $status)")
            )
        }

        @Deprecated("Superseded in API 33; still delivered on older devices")
        @Suppress("DEPRECATION")
        override fun onCharacteristicRead(
            g: BluetoothGatt,
            c: BluetoothGattCharacteristic,
            status: Int
        ) {
            readResult?.complete(if (status == BluetoothGatt.GATT_SUCCESS) c.value else null)
        }

        override fun onCharacteristicRead(
            g: BluetoothGatt,
            c: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            readResult?.complete(if (status == BluetoothGatt.GATT_SUCCESS) value else null)
        }

        @Deprecated("Superseded in API 33; still delivered on older devices")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            c.value?.let { onNotify?.invoke(c.uuid, it.copyOf()) }
        }

        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            c: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            onNotify?.invoke(c.uuid, value.copyOf())
        }

        override fun onDescriptorWrite(
            g: BluetoothGatt,
            d: BluetoothGattDescriptor,
            status: Int
        ) {
            writeDescResult?.complete(status == BluetoothGatt.GATT_SUCCESS)
        }
    }
}
