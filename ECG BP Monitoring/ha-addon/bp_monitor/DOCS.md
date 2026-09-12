# BP Monitor — Home Assistant add-on

Live blood-pressure dashboard (Ingress) for the **RBP1711150377** BLE cuff
(chip: ISSC BT5050), with a guided connection flow and MQTT-discovered
Home Assistant entities. Sibling add-on to **ECG2 Monitor** — same box,
same pattern (host Bluetooth via `host_dbus`, aiohttp + Ingress UI, MQTT
discovery).

## Options

| Option | Description |
|---|---|
| `source` | `ble` (default), `mqtt`, `auto`, or `replay` (demo data, no hardware) |
| `device_address` | Cuff's BLE MAC (`88:1B:99:10:44:D8` for this unit) |
| `device_name` | Advertised name prefix to also match on (`RBP`) |
| `scan_timeout` | Seconds per scan pass before retrying |
| `mqtt_raw_topic` | Topic a bridge would publish raw notify bytes on, for `source: mqtt` |
| `mqtt_host`/`port`/`user`/`password` | Leave `mqtt_host` blank to auto-use the Mosquitto add-on via Supervisor |
| `discovery_prefix` | HA MQTT discovery prefix (`homeassistant`) |
| `log_level` | `debug`/`info`/`warning`/`error` |

## Guided test procedure

1. Open the **BP Monitor** panel.
2. Press the cuff's own power button — the UI moves through
   *Turn on cuff → Scanning → Connecting → Checking device → Ready*.
3. With the cuff on your arm, press its own **Start** button to begin a
   measurement. The add-on does not trigger measurements remotely — it
   only listens.
4. When the cuff finishes, the reading (systolic/diastolic/pulse) appears
   in the tiles, in Home Assistant, and in the history table below.

## Home Assistant entities (MQTT discovery)

`sensor.bp_systolic`, `sensor.bp_diastolic`, `sensor.bp_pulse`,
`sensor.bp_last_reading`, `sensor.bp_status`, `sensor.bp_source`,
`binary_sensor.bp_connected`.

## Known limitations (read before trusting a reading)

This cuff does **not** use the standard Bluetooth Blood Pressure Profile.
Its protocol was reverse-engineered from a single captured notification
frame (see `app/protocol.py` for the full byte-level notes), so:

- The systolic/diastolic/pulse byte offsets are a best-effort decode from
  one sample and have **not** been cross-checked against the cuff's own
  display on a real, on-arm reading yet.
- The frame checksum algorithm is unknown — the add-on does not verify
  it, so a corrupted packet could in principle be misread.
- Roughly a dozen payload bytes (status/flag bits, a record index) are
  still unidentified.

**Before relying on this add-on's numbers for anything but testing,**
take a measurement, compare the three values shown here against the
cuff's own screen, and tell whoever maintains this add-on if they don't
match — the offsets in `protocol.py` will need adjusting.

## Bluetooth notes specific to this cuff

The cuff advertises as dual-mode (BR/EDR + LE), which makes BlueZ's
profile negotiation flaky: a fresh GATT connect sometimes raises
`org.bluez.Error.BREDR.ProfileUnavailable` even though a retry a moment
later succeeds. The add-on retries the connect up to 3 times before
giving up and returning to the *wake* step.

The cuff advertises only briefly — right after its own Start button is
pressed, or for a short pairing window. If the *Scanning* step keeps
timing out, press the cuff's button again right after the UI shows
*Turn on cuff*.
