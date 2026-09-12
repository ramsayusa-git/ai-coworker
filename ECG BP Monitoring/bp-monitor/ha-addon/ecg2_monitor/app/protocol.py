"""ikinloop ecg2 (Z3518A) packet decoding, per the reverse-engineered notes.

0x2A37 notifications carry either:
  * 6 bytes  TLV status frame at 1 Hz: `02 <contact 0/1> 03 <device HR bpm> 04 00`
             e.g. `02 00 03 00 04 00` = no contact, `02 01 03 5e 04 00` = contact, 94 bpm
  * 18 bytes `[seq u16 BE][8 x int16 BE ECG samples]` -> ECG stream (~66 pkt/s)
"""
from __future__ import annotations

import struct
from dataclasses import dataclass

HR_MEASUREMENT_UUID = "00002a37-0000-1000-8000-00805f9b34fb"
BATTERY_LEVEL_UUID = "00002a19-0000-1000-8000-00805f9b34fb"
MODEL_NUMBER_UUID = "00002a24-0000-1000-8000-00805f9b34fb"
FIRMWARE_REV_UUID = "00002a26-0000-1000-8000-00805f9b34fb"
HARDWARE_REV_UUID = "00002a27-0000-1000-8000-00805f9b34fb"

NOMINAL_FS = 530.0          # measured ~530 samples/s
SAMPLES_PER_PACKET = 8


@dataclass
class EcgPacket:
    seq: int
    samples: tuple[int, ...]


@dataclass
class ContactPacket:
    contact: bool
    hr: int            # device's own HR estimate (0 = none yet)


def decode(data: bytes) -> EcgPacket | ContactPacket | None:
    n = len(data)
    if n == 18:
        seq = struct.unpack_from(">H", data, 0)[0]
        samples = struct.unpack_from(">8h", data, 2)
        return EcgPacket(seq, samples)
    if n == 6 and data[0] == 0x02 and data[2] == 0x03 and data[4] == 0x04:
        # Vendor TLV status frame, 1 Hz: 02 <contact 0/1> 03 <hr bpm> 04 <?>
        return ContactPacket(bool(data[1]), int(data[3]))
    if n >= 2 and n <= 8:
        flags = data[0]
        hr = struct.unpack_from("<H", data, 1)[0] if flags & 1 else data[1]
        # flags bit1 = contact supported, bit2 = contact detected
        contact = bool(flags & 0x04) if flags & 0x02 else hr > 0
        return ContactPacket(contact, hr)
    return None
