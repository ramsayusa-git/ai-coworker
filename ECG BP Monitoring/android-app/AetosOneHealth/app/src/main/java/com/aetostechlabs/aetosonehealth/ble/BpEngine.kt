package com.aetostechlabs.aetosonehealth.ble

import android.content.Context
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
    private val scope: CoroutineScope,
    private val onReadingSaved: ((String) -> Unit)? = null
) {
    private val ble = BleClient(context)

    private val _state = MutableStateFlow(MonitorState())
    val state: StateFlow<MonitorState> = _state.asStateFlow()

    private val _live = MutableStateFlow(BpLive())
    val live: StateFlow<BpLive> = _live.asStateFlow()

    private var job: Job? = null

    companion object {
        private const val SCAN_TIMEOUT_MS = 30_000L
    }

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
            val device = ble.scan(
                address = null,
                namePrefix = BpProtocol.DEFAULT_NAME,
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
            readDeviceInfo()

            var dropped = false
            ble.onDisconnected { dropped = true }
            // Every notification is decoded, not just 0xFFF1: when the expected
            // characteristic is absent we fall back to subscribing to all of
            // them, and the frame decoder rejects anything that is not ours.
            ble.onNotification { _, data -> handle(data) }

            if (!subscribeMeasurement()) throw BleError("No notifying characteristic to subscribe to")

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

    private suspend fun subscribeMeasurement(): Boolean {
        ble.characteristic(BpProtocol.BP_SERVICE, BpProtocol.BP_MEASUREMENT)?.let {
            if (ble.subscribe(it)) return true
        }
        var ok = false
        for (c in ble.notifyingCharacteristics()) {
            if (ble.subscribe(c)) {
                log("Fallback subscription on ${c.uuid}")
                ok = true
            }
        }
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
