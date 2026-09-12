package com.aetostechlabs.aetosonehealth.proto

import java.util.UUID

/**
 * ikinloop ecg2 (Z3518A) packet decoding — a direct port of the add-on's
 * protocol.py, which was reverse-engineered from live captures.
 *
 * 0x2A37 notifications carry either:
 *  - 6 bytes, 1 Hz vendor TLV status frame: `02 <contact 0/1> 03 <hr bpm> 04 00`
 *  - 18 bytes, ~66 pkt/s: `[seq u16 BE][8 x int16 BE ECG samples]`
 *
 * Note the vendor characteristic 92e86c7a-… must never be written to: doing so
 * drops the connection.
 */
object EcgProtocol {
    val HEART_RATE_SERVICE: UUID = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
    val HR_MEASUREMENT: UUID = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")
    val BATTERY_SERVICE: UUID = UUID.fromString("0000180f-0000-1000-8000-00805f9b34fb")
    val BATTERY_LEVEL: UUID = UUID.fromString("00002a19-0000-1000-8000-00805f9b34fb")
    val DEVICE_INFO_SERVICE: UUID = UUID.fromString("0000180a-0000-1000-8000-00805f9b34fb")
    val MODEL_NUMBER: UUID = UUID.fromString("00002a24-0000-1000-8000-00805f9b34fb")
    val FIRMWARE_REV: UUID = UUID.fromString("00002a26-0000-1000-8000-00805f9b34fb")
    val HARDWARE_REV: UUID = UUID.fromString("00002a27-0000-1000-8000-00805f9b34fb")

    const val NOMINAL_FS = 530.0f
    const val SAMPLES_PER_PACKET = 8
    const val DEFAULT_NAME = "ikinloop"
    const val DEFAULT_ADDRESS = "12:16:00:00:06:63"

    sealed interface Packet
    data class EcgPacket(val seq: Int, val samples: IntArray) : Packet {
        override fun equals(other: Any?) =
            other is EcgPacket && seq == other.seq && samples.contentEquals(other.samples)
        override fun hashCode() = 31 * seq + samples.contentHashCode()
    }
    data class ContactPacket(val contact: Boolean, val hr: Int) : Packet

    fun decode(data: ByteArray): Packet? {
        val n = data.size
        if (n == 18) {
            val seq = ((data[0].toInt() and 0xFF) shl 8) or (data[1].toInt() and 0xFF)
            val samples = IntArray(SAMPLES_PER_PACKET) { i ->
                val hi = data[2 + i * 2].toInt()          // signed on purpose
                val lo = data[3 + i * 2].toInt() and 0xFF
                (hi shl 8) or lo
            }
            return EcgPacket(seq, samples)
        }
        if (n == 6 && data[0].toInt() == 0x02 && data[2].toInt() == 0x03 && data[4].toInt() == 0x04) {
            return ContactPacket(data[1].toInt() != 0, data[3].toInt() and 0xFF)
        }
        if (n in 2..8) {
            // Standard HR Measurement fallback, for firmware that speaks it.
            val flags = data[0].toInt() and 0xFF
            val hr = if (flags and 1 != 0)
                (data[1].toInt() and 0xFF) or ((data[2].toInt() and 0xFF) shl 8)
            else data[1].toInt() and 0xFF
            val contact = if (flags and 0x02 != 0) (flags and 0x04) != 0 else hr > 0
            return ContactPacket(contact, hr)
        }
        return null
    }
}
