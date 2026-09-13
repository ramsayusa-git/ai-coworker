# Changelog

## 1.3.0 — 2026-09-13
**Scans once instead of forever.** The add-on used to loop wake → scan → wake
→ scan indefinitely, which kept the Bluetooth adapter busy for nothing, left a
permanent "Scanning" pill in the header, and meant two add-ons sharing one
dongle were both hammering it. It now runs a single scan pass when the add-on
starts and then stops, reporting why it stopped: the cuff wasn't advertising,
the link closed after a measurement, or a connect attempt failed.

Because scanning stops, there has to be a way to start it again — so a **Scan**
button sits in the step panel, and a second one in the header next to
Calibration. This is not a return of the start/stop/reconnect trio: both are
the same single action, backed by `POST /api/scan`.

*Amended later the same day:* the button was first hidden whenever a pass was
running, and its click handler disabled it and relied on the next WebSocket
status broadcast to re-enable it. With the socket down it stayed grey forever,
label stuck on "Scanning…", with no visible way to scan at all. Both buttons
are now always present — disabled and labelled "Scanning…" during a pass — a
single helper owns their enabled state, and an 8-second fallback re-reads
`/api/status` if no broadcast arrives. A control that vanishes is how someone
ends up asking how to start a scan.

## 1.2.3 — 2026-09-13
The calibration control was still being missed, so the gear is now a clearly
labelled **"Calibration"** button in the accent colour at the top right of the
header, not a bare icon. A dot appears on it whenever an offset is active. It
opens the same sheet: the active-profile selector and plus/minus steppers for
systolic, diastolic and pulse.

## 1.2.2 — 2026-09-12
Dropped "Home Assistant" from the dashboard's own wording — the scanning hint
now reads "Keep the cuff within 2 m of the hub". The box is branded Aetos One
Hub, so the underlying platform's name has no business appearing in the product
UI. Code comments and docstrings still say Home Assistant where they describe
what the add-on actually talks to; renaming those would make the source lie.

## 1.2.1 — 2026-09-12
Calibration was buried in the Profiles tab and people could not find it. There
is now a **gear button at the top right** opening a settings sheet with the
active-profile selector and the calibration steppers for **all three values**
(systolic, diastolic, pulse) in one place, plus reset and a link through to
profile management. A dot on the gear shows when any offset is non-zero, so a
calibrated dashboard is never silently calibrated. The steppers stay in the
Profiles tab too — both render from the same state and stay in sync. Escape or
a click outside closes the sheet.

## 1.2.0 — 2026-09-12
**Profiles.** The cuff is normally shared, so every reading is now attributed
to a profile. A selector in the top bar sets who the next measurement is for;
the new Profiles tab adds, renames, selects and deletes them. Deleting a
profile **keeps** its readings (they become Unassigned) rather than destroying
them. History can be filtered per profile, any past reading can be reassigned
from its row, and averages/trends/CSV are all profile-aware.

**Calibration.** Plus/minus steppers per value (systolic, diastolic, pulse),
stored per profile, to align the add-on with the cuff's own screen. The
database always stores **exactly what the cuff sent** — offsets are applied
when a value is displayed or published. So recalibrating later re-aligns the
whole history instead of baking a guess into the data, and the CSV export
carries both the raw and the calibrated columns. Offsets are clamped to
+/-40 and the +/- buttons send the new absolute value, so a double-tap can
never double-apply.

Aggregates stay exact across profiles with different offsets: each row is
shifted by its own profile's offset inside the SQL, not afterwards.

Existing databases migrate in place — `readings.profile_id` and the profile
calibration columns are added on first start, and the readings already stored
are preserved and left Unassigned.

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
