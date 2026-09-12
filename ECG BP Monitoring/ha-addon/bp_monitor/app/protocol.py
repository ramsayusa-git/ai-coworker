"""RBP1711150377 (ISSC BT5050 chip) custom BLE protocol.

Not the standard Bluetooth Blood Pressure Profile — GATT dump showed a
vendor service instead:
  service 0000fff0  notify char 0000fff1 (measurement)   write char 0000fff2
  service 49535343-fe7d-4ae5-8fa9-9fafd205e455 (ISSC transparent UART,
      chars 000069fe read/write, 00000318 write/notify) — unused for readings

Standard Device Information Service (0000180a) IS present and used as-is:
  2A29 manufacturer  2A24 model  2A25 serial  2A26 firmware
  2A27 hardware      2A28 software

Captured measurement frame (one sample, 12 Sep 2026, hand-squeeze test —
NOT a validated on-arm reading, so field offsets below are a best-effort
decode pending confirmation against a real measurement):

  aa 80 02 0f 01 06 00 0e 01 01 01 01 01 00 d7 00 86 00 67 33
  ^0 ^1 ^2 ^3 <--------------- payload (15 bytes) ------------> ^19

  byte0        0xAA   sync
  byte1        0x80   frame type (0x80 seen = measurement result)
  byte2        0x02   sub-type / unknown
  byte3        0x0F   payload length (15)
  byte4..18    payload — byte14=systolic, byte16=diastolic, byte18=pulse,
               each a raw uint8 (mmHg / bpm directly, not BCD: 0xD7 has a
               'D' nibble which isn't a valid BCD digit). bytes 4..13
               (mostly 0x01 flags + a 0x000e field) not yet decoded —
               likely status/irregular-heartbeat/motion flags + a record
               index.
  byte19       checksum — algorithm not yet confirmed (plain sum/XOR over
               bytes 0..18 didn't reproduce 0x33); not verified here.

Unknown frame types are still surfaced as RawFrame so nothing is silently
dropped while the protocol is refined with more real captures.
"""
from __future__ import annotations

from dataclasses import dataclass

SYNC = 0xAA
RESULT_FRAME_TYPE = 0x80

BP_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"
BP_MEASUREMENT_UUID = "0000fff1-0000-1000-8000-00805f9b34fb"
BP_WRITE_UUID = "0000fff2-0000-1000-8000-00805f9b34fb"

MANUFACTURER_NAME_UUID = "00002a29-0000-1000-8000-00805f9b34fb"
MODEL_NUMBER_UUID = "00002a24-0000-1000-8000-00805f9b34fb"
SERIAL_NUMBER_UUID = "00002a25-0000-1000-8000-00805f9b34fb"
FIRMWARE_REV_UUID = "00002a26-0000-1000-8000-00805f9b34fb"
HARDWARE_REV_UUID = "00002a27-0000-1000-8000-00805f9b34fb"
SOFTWARE_REV_UUID = "00002a28-0000-1000-8000-00805f9b34fb"


@dataclass
class BpReading:
    systolic: int
    diastolic: int
    pulse: int
    raw_hex: str


@dataclass
class RawFrame:
    """A frame we received but don't (yet) know how to interpret fully."""
    frame_type: int
    payload_hex: str
    raw_hex: str


def decode(data: bytes):
    """Decode one notify payload from 0000fff1. Returns BpReading, RawFrame,
    or None if the bytes don't even look like a framed packet."""
    if not data or data[0] != SYNC or len(data) < 4:
        return None
    length = data[3]
    if len(data) < 4 + length:
        return None  # short/segmented frame — MTU has always fit 20B so far
    payload = data[4:4 + length]
    frame_type = data[1]
    raw_hex = data.hex()
    if frame_type == RESULT_FRAME_TYPE and len(payload) >= 15:
        return BpReading(
            systolic=payload[10],
            diastolic=payload[12],
            pulse=payload[14],
            raw_hex=raw_hex,
        )
    return RawFrame(frame_type=frame_type, payload_hex=payload.hex(), raw_hex=raw_hex)
