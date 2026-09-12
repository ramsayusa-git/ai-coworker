package com.aetostechlabs.aetosonehealth.ble

/**
 * The guided-step model, carried over from the hub add-ons because it is what
 * makes these devices usable: both of them advertise only for a few seconds
 * after a button press, so the user needs to be told exactly what to do next.
 */
enum class Step(val order: Int) {
    IDLE(-1),
    WAKE(0),
    SCANNING(1),
    CONNECTING(2),
    CHECKING(3),
    READY(4),
    LIVE(5),
    RESULT(5),
    ERROR(-1);

    val isWorking: Boolean
        get() = this == WAKE || this == SCANNING || this == CONNECTING || this == CHECKING
}

data class DeviceInfo(
    val name: String = "",
    val address: String = "",
    val manufacturer: String = "",
    val model: String = "",
    val serial: String = "",
    val firmware: String = "",
    val hardware: String = "",
    val software: String = "",
    val battery: Int? = null
)

data class MonitorState(
    val step: Step = Step.IDLE,
    val title: String = "",
    val hint: String = "",
    val detail: String = "",
    val connected: Boolean = false,
    val attempts: Int = 0,
    val info: DeviceInfo = DeviceInfo(),
    val log: List<String> = emptyList()
) {
    /**
     * Scanning is offered whenever nothing is already running. The control is
     * always present in the UI — greyed while a pass is in flight — so it can
     * never disappear and leave the user with no way to start one.
     */
    val canScan: Boolean get() = !step.isWorking && step != Step.READY && step != Step.LIVE
}

/** ECG-specific live values, on top of the shared state. */
data class EcgLive(
    val hr: Int? = null,
    val rrMs: Int? = null,
    val rawHr: Int? = null,
    val contact: Boolean = false,
    val deviceHr: Int? = null,
    val quality: String = "",
    val qualityScore: Double = 0.0,
    val beats: Int = 0,
    val samples: Int = 0,
    val sessionId: Long? = null,
    val waveform: FloatArray = FloatArray(0)
) {
    override fun equals(other: Any?) = other is EcgLive &&
        hr == other.hr && rrMs == other.rrMs && contact == other.contact &&
        quality == other.quality && beats == other.beats && samples == other.samples &&
        waveform.contentEquals(other.waveform)

    override fun hashCode(): Int {
        var r = hr ?: 0
        r = 31 * r + beats
        r = 31 * r + waveform.contentHashCode()
        return r
    }
}

/** BP-specific live values. */
data class BpLive(
    val systolic: Int? = null,
    val diastolic: Int? = null,
    val pulse: Int? = null,
    val rawSystolic: Int? = null,
    val rawDiastolic: Int? = null,
    val rawPulse: Int? = null,
    val category: String = "",
    val meanArterial: Double? = null,
    val readingTime: Long? = null,
    val calibrated: Boolean = false
)

internal object StepText {
    fun ecg(step: Step): Pair<String, String> = when (step) {
        Step.IDLE -> "Not scanning" to
            "Bluetooth scanning is off so the phone's radio stays free. Put the sensor on, then press Scan."
        Step.WAKE -> "Wake the sensor" to
            "Wear the ECG sensor or press its button. It advertises for only a few seconds after waking."
        Step.SCANNING -> "Scanning for the sensor" to
            "Looking for the ikinloop ecg2 over Bluetooth. Keep it within 2 m of the phone."
        Step.CONNECTING -> "Connecting" to "Sensor found — opening the Bluetooth link."
        Step.CHECKING -> "Checking device" to
            "Reading model and firmware, and subscribing to the ECG stream."
        Step.READY -> "Ready — waiting for contact" to
            "Connected. Hold the electrodes or wear the strap; the trace starts as soon as contact is made."
        Step.LIVE -> "Live" to "Streaming ECG. Stay still for the cleanest trace."
        Step.RESULT -> "Session recorded" to "The wear has been saved to history."
        Step.ERROR -> "Connection lost" to "If the sensor went to sleep, wake it and press Scan."
    }

    fun bp(step: Step): Pair<String, String> = when (step) {
        Step.IDLE -> "Not scanning" to
            "Bluetooth scanning is off so the phone's radio stays free. Press the button on the cuff, then press Scan."
        Step.WAKE -> "Turn on the cuff" to
            "Press the power/start button on the cuff. It only advertises for a few seconds after waking."
        Step.SCANNING -> "Scanning for the cuff" to
            "Looking for the RBP cuff over Bluetooth. Keep it within 2 m of the phone."
        Step.CONNECTING -> "Connecting" to "Cuff found — opening the Bluetooth link."
        Step.CHECKING -> "Checking device" to
            "Reading model/firmware and subscribing to the measurement channel."
        Step.READY -> "Ready — start a measurement" to
            "Connected. Put the cuff on your arm and press its own Start button; the reading appears here automatically."
        Step.LIVE -> "Measuring" to "The cuff is inflating. Keep your arm still."
        Step.RESULT -> "Reading received" to "Latest measurement is shown below."
        Step.ERROR -> "Connection lost" to "If the cuff went to sleep, press its button and press Scan."
    }
}
