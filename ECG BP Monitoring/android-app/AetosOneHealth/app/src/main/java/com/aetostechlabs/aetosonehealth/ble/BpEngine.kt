package com.aetostechlabs.aetosonehealth.ble

import android.content.Context
import com.aetostechlabs.aetosonehealth.data.DeviceKind
import com.aetostechlabs.aetosonehealth.data.DeviceStore
import com.aetostechlabs.aetosonehealth.data.Repository
import com.aetostechlabs.aetosonehealth.data.applyBp
import com.aetostechlabs.aetosonehealth.data.classify
import com.aetostechlabs.aetosonehealth.data.meanArterial
import com.aetostechlabs.aetosonehealth.proto.BpProtocol
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Owns the blood-pressure cuff. Same one-pass scan discipline as [EcgEngine]:
 * the cuff advertises only briefly after its button is pressed, so an endless
 * scan would burn battery while the cuff is asleep anyway.
 */
class BpEngine(
    private val context: Context,
    private val repo: Repository,
    private val devices: DeviceStore,
    private val scope: CoroutineScope,
    private val onReadingSaved: ((String) -> Unit)? = null
) {
    private val ble = BleClient(context)

    private val _state = MutableStateFlow(MonitorState())
    val state: StateFlow<MonitorState> = _state.asStateFlow()

    private val _live = MutableStateFlow(BpLive())
    val live: StateFlow<BpLive> = _live.asStateFlow()

    private var job: Job? = null

    /** Raw notifications received this session — surfaced on the BP screen. */
    var notifications: Int = 0
        private set

    companion object {
        private const val SCAN_TIMEOUT_MS = 30_000L
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    init {
        setStep(Step.IDLE, "Press the cuff's button, then press Scan.")
    }

    private fun setStep(step: Step, detail: String = "") {
        val (title, hint) = StepText.bp(step)
        _state.value = _state.value.copy(
            step = step, title = title, hint = hint, detail = detail,
            connected = step == Step.READY || step == Step.CHECKING || step == Step.RESULT
        )
    }

    private fun log(msg: String) {
        val stamp = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        _state.value = _state.value.copy(log = (_state.value.log + "$stamp  $msg").takeLast(40))
    }

    fun scan() {
        if (job?.isActive == true) return
        job = scope.launch { runPass() }
    }

    fun stop() {
        job?.cancel()
        job = null
        ble.close()
        setStep(Step.IDLE, "Stopped. Press Scan to reconnect.")
    }

    private suspend fun runPass() {
        _state.value = _state.value.copy(attempts = _state.value.attempts + 1)
        try {
            ble.requireAdapter()
            setStep(Step.WAKE)
            // A device the user picked in Add Device wins — its address is
            // exact, where the name prefix is only a guess.
            val saved = devices[DeviceKind.BP]
            val device = ble.scan(
                address = saved?.address,
                namePrefix = if (saved == null) BpProtocol.DEFAULT_NAME else null,
                serviceUuid = null,   // this cuff does not advertise 0xFFF0
                timeoutMs = SCAN_TIMEOUT_MS,
                onTick = { left -> setStep(Step.SCANNING, "$left s left in this pass") }
            )
            if (device == null) {
                pause("The cuff was not advertising during that scan. Press its button, then press Scan.")
                return
            }

            _state.value = _state.value.copy(
                info = _state.value.info.copy(
                    address = device.address, name = ble.deviceName ?: BpProtocol.DEFAULT_NAME
                )
            )
            setStep(Step.CONNECTING, "${ble.deviceName ?: "RBP"} [${device.address}]")
            ble.connect(device)
            log("Link up to ${device.address}")

            setStep(Step.CHECKING, "Link up — reading device information")
            ble.discoverServices()
            // Dump the whole GATT table before doing anything else. When a
            // device connects but never sends, this is the evidence that says
            // whether the expected characteristic exists and can notify.
            ble.describeGatt().forEach { log(it) }
            readDeviceInfo()

            var dropped = false
            ble.onDisconnected { dropped = true }
            // Every notification is decoded, not just 0xFFF1 — the decoder
            // rejects anything that is not ours. Each one is logged raw first:
            // "connected but no reading" is ambiguous until you can see whether
            // bytes are arriving at all, and what they look like.
            ble.onNotification { uuid, data ->
                notifications++
                log("RX ${data.size}B on ${uuid.toString().take(8)}: ${data.toHex()}")
                handle(data)
            }

            if (!subscribeMeasurement()) throw BleError("No notifying characteristic to subscribe to")

            // Some ISSC vendor characteristics only deliver notifications over
            // an authenticated link, and the refusal is silent: the CCCD write
            // reports success and nothing ever arrives. If the phone has not
            // bonded with the cuff, ask for a bond now rather than waiting
            // forever for data that cannot come.
            if (ble.bondState() != android.bluetooth.BluetoothDevice.BOND_BONDED) {
                log("Not bonded — requesting pairing (accept the prompt if it appears)")
                if (!ble.createBond()) log("Pairing request was refused by the phone")
            }

            setStep(Step.READY, "Subscribed — put the cuff on your arm and press its Start button")
            while (!dropped) {
                delay(1000)
                if (!ble.isConnected) break
            }
            pause("The cuff closed the Bluetooth link — that is normal after a measurement. Press Scan to reconnect.")
        } catch (e: BleUnavailable) {
            pause(e.message ?: "Bluetooth unavailable")
        } catch (e: Exception) {
            val msg = e.message ?: e.javaClass.simpleName
            log("Attempt failed: $msg")
            pause("Connection attempt failed: ${msg.take(140)}")
        } finally {
            ble.close()
        }
    }

    private fun pause(reason: String) {
        setStep(Step.IDLE, reason)
        log("Scan paused: $reason")
    }

    private suspend fun readDeviceInfo() {
        val s = BpProtocol.DEVICE_INFO_SERVICE
        _state.value = _state.value.copy(
            info = _state.value.info.copy(
                manufacturer = ble.readString(s, BpProtocol.MANUFACTURER_NAME) ?: "",
                model = ble.readString(s, BpProtocol.MODEL_NUMBER) ?: "",
                serial = ble.readString(s, BpProtocol.SERIAL_NUMBER) ?: "",
                firmware = ble.readString(s, BpProtocol.FIRMWARE_REV) ?: "",
                hardware = ble.readString(s, BpProtocol.HARDWARE_REV) ?: "",
                software = ble.readString(s, BpProtocol.SOFTWARE_REV) ?: ""
            )
        )
    }

    /**
     * Subscribe to the measurement characteristic *and* every other notifying
     * one. The cuff is known to deliver on 0xFFF1, but it also exposes an ISSC
     * transparent-UART service, and a firmware variant could use it instead.
     * Subscribing to everything costs nothing — the decoder rejects any frame
     * that is not ours — and it is the difference between capturing a reading
     * and silently missing it.
     */
    private suspend fun subscribeMeasurement(): Boolean {
        var ok = false
        ble.characteristic(BpProtocol.BP_SERVICE, BpProtocol.BP_MEASUREMENT)?.let {
            if (ble.subscribe(it)) {
                ok = true
                log("Subscribed to measurement 0xFFF1")
            } else {
                log("StartNotify on 0xFFF1 FAILED")
            }
        } ?: log("Characteristic 0xFFF1 not present on this device")

        for (c in ble.notifyingCharacteristics()) {
            if (c.uuid == BpProtocol.BP_MEASUREMENT) continue
            if (ble.subscribe(c)) {
                log("Also listening on ${c.uuid}")
                ok = true
            }
        }
        if (!ok) log("No characteristic accepted a subscription")
        return ok
    }

    private fun handle(data: ByteArray) {
        when (val frame = BpProtocol.decode(data)) {
            is BpProtocol.BpReading -> {
                val profile = repo.activeProfile.value
                val ts = System.currentTimeMillis()
                // Store the RAW decode first: the database always holds what the
                // cuff actually sent, whatever the calibration is set to today.
                repo.addBpReading(
                    ts, frame.systolic, frame.diastolic, frame.pulse,
                    "ble", frame.rawHex, profile?.id
                )
                val cal = repo.loadCalibration(profile?.id)
                val (s, d, p) = cal.applyBp(frame.systolic, frame.diastolic, frame.pulse)
                _live.value = BpLive(
                    systolic = s, diastolic = d, pulse = p,
                    rawSystolic = frame.systolic, rawDiastolic = frame.diastolic,
                    rawPulse = frame.pulse,
                    category = classify(s, d), meanArterial = meanArterial(s, d),
                    readingTime = ts, calibrated = cal.isActive
                )
                log("Reading for ${profile?.name ?: "unassigned"}: $s/$d mmHg, pulse $p bpm")
                setStep(Step.RESULT, "$s/$d mmHg · $p bpm" + if (cal.isActive) " · calibrated" else "")
                onReadingSaved?.invoke("$s/$d mmHg · $p bpm")
            }

            is BpProtocol.RawFrame ->
                log("Unrecognised frame type 0x%02x: %s".format(frame.frameType, frame.rawHex))

            null -> Unit
        }
    }
}
