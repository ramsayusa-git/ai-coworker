package com.aetostechlabs.aetosonehealth.proto

import java.util.UUID

/**
 * RBP1711150377 (ISSC BT5050) custom BLE protocol — ported from the add-on's
 * protocol.py. This cuff does NOT implement the standard Blood Pressure
 * Profile; it uses a vendor 0xFFF0 service instead.
 *
 * Measurement frame:
 *   aa 80 02 0f 01 06 00 0e 01 01 01 01 01 00 d7 00 86 00 67 33
 *   byte0 sync 0xAA | byte1 frame type (0x80 = result) | byte2 sub-type
 *   byte3 payload length | byte4..18 payload | byte19 checksum (algorithm
 *   still unconfirmed, so it is not verified here).
 *
 * Inside the payload: [10] systolic, [12] diastolic, [14] pulse — plain uint8,
 * not BCD. Unknown frame types surface as [RawFrame] so nothing is dropped
 * silently while the protocol is still being refined.
 */
object BpProtocol {
    val BP_SERVICE: UUID = UUID.fromString("0000fff0-0000-1000-8000-00805f9b34fb")
    val BP_MEASUREMENT: UUID = UUID.fromString("0000fff1-0000-1000-8000-00805f9b34fb")
    val BP_WRITE: UUID = UUID.fromString("0000fff2-0000-1000-8000-00805f9b34fb")

    val DEVICE_INFO_SERVICE: UUID = UUID.fromString("0000180a-0000-1000-8000-00805f9b34fb")
    val MANUFACTURER_NAME: UUID = UUID.fromString("00002a29-0000-1000-8000-00805f9b34fb")
    val MODEL_NUMBER: UUID = UUID.fromString("00002a24-0000-1000-8000-00805f9b34fb")
    val SERIAL_NUMBER: UUID = UUID.fromString("00002a25-0000-1000-8000-00805f9b34fb")
    val FIRMWARE_REV: UUID = UUID.fromString("00002a26-0000-1000-8000-00805f9b34fb")
    val HARDWARE_REV: UUID = UUID.fromString("00002a27-0000-1000-8000-00805f9b34fb")
    val SOFTWARE_REV: UUID = UUID.fromString("00002a28-0000-1000-8000-00805f9b34fb")

    private const val SYNC = 0xAA
    private const val RESULT_FRAME_TYPE = 0x80

    const val DEFAULT_NAME = "RBP"
    const val DEFAULT_ADDRESS = "88:1B:99:10:44:D8"

    sealed interface Frame
    data class BpReading(
        val systolic: Int, val diastolic: Int, val pulse: Int, val rawHex: String
    ) : Frame
    data class RawFrame(val frameType: Int, val payloadHex: String, val rawHex: String) : Frame

    fun decode(data: ByteArray): Frame? {
        if (data.size < 4 || (data[0].toInt() and 0xFF) != SYNC) return null
        val length = data[3].toInt() and 0xFF
        if (data.size < 4 + length) return null   // short/segmented frame
        val payload = data.copyOfRange(4, 4 + length)
        val frameType = data[1].toInt() and 0xFF
        val rawHex = data.toHex()
        if (frameType == RESULT_FRAME_TYPE && payload.size >= 15) {
            return BpReading(
                systolic = payload[10].toInt() and 0xFF,
                diastolic = payload[12].toInt() and 0xFF,
                pulse = payload[14].toInt() and 0xFF,
                rawHex = rawHex
            )
        }
        return RawFrame(frameType, payload.toHex(), rawHex)
    }

    fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
