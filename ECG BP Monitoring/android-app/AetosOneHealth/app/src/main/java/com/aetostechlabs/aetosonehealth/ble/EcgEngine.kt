package com.aetostechlabs.aetosonehealth.ble

import android.content.Context
import com.aetostechlabs.aetosonehealth.data.DeviceKind
import com.aetostechlabs.aetosonehealth.data.DeviceStore
import com.aetostechlabs.aetosonehealth.data.Repository
import com.aetostechlabs.aetosonehealth.data.applyHr
import com.aetostechlabs.aetosonehealth.dsp.EcgFilter
import com.aetostechlabs.aetosonehealth.dsp.QrsDetector
import com.aetostechlabs.aetosonehealth.dsp.SignalQuality
import com.aetostechlabs.aetosonehealth.proto.EcgProtocol
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
import kotlin.math.roundToInt

/**
 * Owns the ECG device: one scan pass on demand, then a live session.
 *
 * Scanning never loops on its own. A pass that finds nothing, or a link that
 * drops, parks the engine in [Step.IDLE] with a reason the UI shows verbatim —
 * looping the scanner keeps the radio busy for nothing and drains the battery,
 * and the user is the one who knows when the sensor is actually awake.
 */
class EcgEngine(
    private val context: Context,
    private val repo: Repository,
    private val devices: DeviceStore,
    private val scope: CoroutineScope,
    private val mainsHz: Int = 50,
    private val onReadingSaved: ((String) -> Unit)? = null
) {
    private val ble = BleClient(context)
    private val fs = EcgProtocol.NOMINAL_FS.toDouble()

    private var filter = EcgFilter(fs, mainsHz)
    private var qrs = QrsDetector(fs)
    private var quality = SignalQuality(fs)

    private val _state = MutableStateFlow(MonitorState())
    val state: StateFlow<MonitorState> = _state.asStateFlow()

    private val _live = MutableStateFlow(EcgLive())
    val live: StateFlow<EcgLive> = _live.asStateFlow()

    /** True once Scan has been pressed — see [BpEngine.sessionStarted]. */
    private val _sessionStarted = MutableStateFlow(false)
    val sessionStarted: StateFlow<Boolean> = _sessionStarted.asStateFlow()

    private var job: Job? = null
    private var sessionId: Long? = null
    private var sampleCount = 0
    private var lastHrLog = 0L
    private val wave = ArrayDeque<Float>(WAVE_LEN)

    companion object {
        /** ~4 s of trace at 530 Hz, decimated by 4 for the display. */
        private const val WAVE_LEN = 530
        private const val DECIMATE = 4
        private const val SCAN_TIMEOUT_MS = 20_000L
    }

    init {
        setStep(Step.IDLE, "Press Scan when the sensor is awake.")
        repo.closeOrphanSessions()
    }

    // --------------------------------------------------------------- state
    private fun setStep(step: Step, detail: String = "") {
        val (title, hint) = StepText.ecg(step)
        _state.value = _state.value.copy(
            step = step, title = title, hint = hint, detail = detail,
            connected = step == Step.READY || step == Step.LIVE || step == Step.CHECKING
        )
    }

    private fun log(msg: String) {
        val stamp = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val entry = "$stamp  $msg"
        _state.value = _state.value.copy(log = (_state.value.log + entry).takeLast(40))
    }

    /** One more scan pass — this is what the Scan button calls. */
    fun scan() {
        if (job?.isActive == true) return
        // Clear the readout: a new wear starts from nothing.
        _live.value = EcgLive()
        _sessionStarted.value = true
        job = scope.launch { runPass() }
    }

    fun stop() {
        job?.cancel()
        job = null
        _sessionStarted.value = false
        closeSession("stopped")
        ble.close()
        setStep(Step.IDLE, "Stopped. Press Scan to reconnect.")
    }

    // ----------------------------------------------------------- the pass
    private suspend fun runPass() {
        _state.value = _state.value.copy(attempts = _state.value.attempts + 1)
        try {
            ble.requireAdapter()
            setStep(Step.WAKE)
            // A device the user picked in Add Device wins: matching on its
            // address is exact, where a name prefix is a guess that fails on a
            // replacement unit or a differently named one.
            val saved = devices[DeviceKind.ECG]
            val device = ble.scan(
                address = saved?.address,
                namePrefix = if (saved == null) EcgProtocol.DEFAULT_NAME else null,
                serviceUuid = if (saved == null) EcgProtocol.HEART_RATE_SERVICE else null,
                timeoutMs = SCAN_TIMEOUT_MS,
                onTick = { left -> setStep(Step.SCANNING, "$left s left in this pass") }
            )
            if (device == null) {
                pause("The sensor was not advertising during that scan. Wake it, then press Scan.")
                return
            }

            _state.value = _state.value.copy(
                info = _state.value.info.copy(
                    address = device.address, name = ble.deviceName ?: EcgProtocol.DEFAULT_NAME
                )
            )
            setStep(Step.CONNECTING, "${ble.deviceName ?: "ecg2"} [${device.address}]")
            ble.connect(device)
            log("Link up to ${device.address}")

            setStep(Step.CHECKING, "Link up — reading device information")
            ble.discoverServices()
            ble.requestMtu()
            readDeviceInfo()

            var dropped = false
            ble.onDisconnected { dropped = true }
            ble.onNotification { uuid, data ->
                if (uuid == EcgProtocol.HR_MEASUREMENT) handle(data)
            }

            if (!subscribeStream()) throw BleError("No notifying characteristic to subscribe to")

            resetDsp()
            sessionId = repo.openSession(repo.activeProfile.value?.id)
            _live.value = _live.value.copy(sessionId = sessionId)
            setStep(Step.READY, "Subscribed — waiting for electrode contact")

            while (!dropped) {
                delay(1000)
                if (!ble.isConnected) break
            }
            pause("The sensor closed the Bluetooth link. Press Scan to reconnect.")
        } catch (e: BleUnavailable) {
            pause(e.message ?: "Bluetooth unavailable")
        } catch (e: Exception) {
            val msg = e.message ?: e.javaClass.simpleName
            log("Attempt failed: $msg")
            pause("Connection attempt failed: ${msg.take(140)}")
        } finally {
            closeSession("ended")
            ble.close()
        }
    }

    private fun pause(reason: String) {
        setStep(Step.IDLE, reason)
        log("Scan paused: $reason")
    }

    private suspend fun readDeviceInfo() {
        val model = ble.readString(EcgProtocol.DEVICE_INFO_SERVICE, EcgProtocol.MODEL_NUMBER)
        val fw = ble.readString(EcgProtocol.DEVICE_INFO_SERVICE, EcgProtocol.FIRMWARE_REV)
        val hw = ble.readString(EcgProtocol.DEVICE_INFO_SERVICE, EcgProtocol.HARDWARE_REV)
        val batt = ble.characteristic(EcgProtocol.BATTERY_SERVICE, EcgProtocol.BATTERY_LEVEL)
            ?.let { ble.readString(EcgProtocol.BATTERY_SERVICE, EcgProtocol.BATTERY_LEVEL) }
        _state.value = _state.value.copy(
            info = _state.value.info.copy(
                model = model ?: "", firmware = fw ?: "", hardware = hw ?: "",
                battery = batt?.firstOrNull()?.code
            )
        )
    }

    /**
     * Subscribe to 0x2A37. If that characteristic is missing on a firmware
     * variant, fall back to every notifying characteristic so a stream is never
     * silently missed.
     */
    private suspend fun subscribeStream(): Boolean {
        ble.characteristic(EcgProtocol.HEART_RATE_SERVICE, EcgProtocol.HR_MEASUREMENT)?.let {
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

    // -------------------------------------------------------------- frames
    private fun handle(data: ByteArray) {
        when (val pkt = EcgProtocol.decode(data)) {
            is EcgProtocol.ContactPacket -> {
                _live.value = _live.value.copy(
                    contact = pkt.contact,
                    deviceHr = pkt.hr.takeIf { it > 0 }
                )
                if (pkt.contact && _state.value.step == Step.READY) setStep(Step.LIVE)
                if (!pkt.contact && _state.value.step == Step.LIVE) {
                    setStep(Step.READY, "Contact lost — reseat the electrodes")
                }
            }

            is EcgProtocol.EcgPacket -> {
                val cal = repo.calibration.value
                for (raw in pkt.samples) {
                    val filtered = filter.process(raw.toDouble())
                    quality.push(raw.toDouble())
                    qrs.process(filtered)
                    sampleCount++
                    if (sampleCount % DECIMATE == 0) {
                        if (wave.size == WAVE_LEN) wave.removeFirst()
                        wave.addLast(filtered.toFloat())
                    }
                }
                val (label, score) = quality.assess()
                val rawHr = qrs.hrBpm
                val shownHr = rawHr?.let { cal.applyHr(it).roundToInt() }
                // RR follows the same offset as HR, otherwise the screen would
                // show a heart rate and an interval that contradict each other.
                val rr = shownHr?.takeIf { it > 0 }?.let { (60000.0 / it).roundToInt() }
                _live.value = _live.value.copy(
                    hr = shownHr,
                    rawHr = rawHr?.roundToInt(),
                    rrMs = rr,
                    quality = label,
                    qualityScore = score,
                    beats = qrs.beats,
                    samples = sampleCount,
                    waveform = wave.toFloatArray()
                )
                if (_state.value.step == Step.READY && shownHr != null) setStep(Step.LIVE)
                maybeLogHr(shownHr)
            }

            null -> Unit
        }
    }

    /** One stored HR point every 5 s — enough for a trend, cheap to keep. */
    private fun maybeLogHr(hr: Int?) {
        val sid = sessionId ?: return
        if (hr == null || hr <= 0) return
        val now = System.currentTimeMillis()
        if (now - lastHrLog < 5_000) return
        lastHrLog = now
        // Stored RAW: the offset is re-applied on read, so a later calibration
        // change re-interprets the whole history instead of baking in the old one.
        repo.addHrSample(sid, _live.value.rawHr ?: hr)
    }

    private fun resetDsp() {
        filter = EcgFilter(fs, mainsHz)
        qrs = QrsDetector(fs)
        quality = SignalQuality(fs)
        wave.clear()
        sampleCount = 0
        _live.value = EcgLive()
    }

    private fun closeSession(why: String) {
        val sid = sessionId ?: return
        sessionId = null
        repo.closeSession(sid, _live.value.quality.ifEmpty { why }, sampleCount)
        onReadingSaved?.invoke("ECG session saved")
        _live.value = _live.value.copy(sessionId = null)
    }
}
