# Changelog

## 1.1.0 — 2026-09-12
**Fixes the Bluetooth connection.** The cuff would never connect: bleak's
high-level connect fails against it with
`org.bluez.Error.BREDR.ProfileUnavailable` because the cuff advertises
dual-mode. The BLE source now drives BlueZ directly over D-Bus
(`app/bledbus.py`) and issues a plain `Device1.Connect()` with discovery
stopped first — the sequence that was proven to work against this hardware —
with an escalating recovery ladder (Disconnect → RemoveDevice → rediscover)
between attempts.

Also in this release:
- **Local database.** Readings are stored in SQLite at
  `/share/bp_monitor/bp_monitor.db` instead of a flat JSONL file, with
  derived mean arterial pressure and an AHA category per reading. Any
  existing `history.jsonl` is imported once on first start. Unrecognised
  notification frames are kept too, for further protocol work.
- **History.** New History tab: 7-day / 30-day / all-time averages, a trend
  chart, and a paged table of every reading with CSV export and per-row
  delete.
- **Rebuilt dashboard.** The side menu moved to a top navigation bar, the
  guided steps now show the full working detail of the current step rather
  than truncating it, the charts and colour palette were reworked, and the
  Start / Stop / Reconnect buttons are gone — the add-on manages the link
  itself and retries on its own.

## 1.0.0 — 2026-09-12
Initial release. Host-Bluetooth source for the RBP1711150377 (ISSC BT5050)
cuff, guided connection flow, MQTT-discovered HA entities (systolic,
diastolic, pulse, status, connected), reading history log.
