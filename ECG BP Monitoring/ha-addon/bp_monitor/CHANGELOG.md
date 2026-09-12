# Changelog

## 1.1.1 — 2026-09-12
**Actually fixes the connect.** v1.1.0 moved to raw D-Bus but still failed with
`org.bluez.Error.BREDR.ProfileUnavailable`, because the problem was never which
API issued the connect — it was how BlueZ had *cached* the device.

`Device1.Connect()` connects every supported profile, and for a device BlueZ has
recorded as dual-mode it tries the BR/EDR profiles first. This cuff has none, so
the call fails however many times it is retried. Scanning with a
`Transport="le"` discovery filter makes BlueZ record the cuff as LE-only, and
`Connect()` then performs a plain LE connection.

(This is also why the original probe script worked and the add-on did not:
bleak's scanner sets an LE discovery filter, so the cached record was LE. The
add-on's unfiltered scan re-cached it as dual-mode.)

- Discovery now always sets `SetDiscoveryFilter {Transport: "le"}`.
- A record left behind by an unfiltered scan is detected (it carries a BR/EDR
  `Class` property) and removed so it can be re-learned over LE.
- The recovery ladder no longer repeats a call that cannot succeed: on
  `ProfileUnavailable` it tries `Adapter1.ConnectDevice` with an explicit LE
  address type, then forgets the cached record and re-discovers under the LE
  filter.

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
