# ECG BP Monitoring — what is in this folder

Two Bluetooth health devices, integrated twice over: as Home Assistant add-ons
on the Aetos One hub, and as a native Android app that talks to them directly.

- **ikinloop ecg2** (Z3518A) — ECG waveform, heart rate, RR interval
- **RBP1711150377** (ISSC BT5050) — blood-pressure cuff

Last synced 13 September 2026 (Android app v1.1.0).

## Folders

| Folder | What it holds |
|---|---|
| `ha-addon/` | Source of the two Home Assistant add-ons. **Verified byte-for-byte identical to what is running** on the hub at `/addons/` — 34 files, all matching. |
| `android-app/` | The native Android app: Gradle project, signed APK and AAB, Play listing assets. |
| `tools/` | `hassh.py` (run a command or push a file to the hub over SSH), plus the BLE probe scripts used to reverse-engineer both protocols. |
| `releases/` | Archived add-on release tarballs. |
| `bp-monitor/`, `ecg-monitor/` | Earlier working directories, superseded by `ha-addon/`. Kept until you say otherwise — nothing here references them. |

## Home Assistant add-ons

Both at version **1.3.0**, installed as local add-ons (`local_bp_monitor`,
`local_ecg2_monitor`), each with an Ingress dashboard and MQTT-discovered
entities.

A note on the version number: the scan-control fix shipped on 13 Sep was
deployed as a rebuild at 1.3.0 rather than a version bump. Supervisor's local
store cache would not offer an "update" for a bumped local add-on, and a
rebuild only runs when the installed and config versions match. Rather than
leave the running add-ons claiming a version that was never installable, both
CHANGELOGs carry the fix as an amendment under 1.3.0. The next real change
should bump to 1.3.1 cleanly.

### Deploying a change

The SSH add-on user now owns `/addons/bp_monitor` and `/addons/ecg2_monitor`
(set once via the SSH add-on's root `init_commands`), so pushing is direct:

```bash
cd "ECG BP Monitoring"
python3 tools/hassh.py --put ha-addon/bp_monitor/app/static/index.html \
                             /addons/bp_monitor/app/static/index.html
```

Then rebuild through the connector so the container picks it up — the app is
baked into the image at build time, so a restart alone serves the old files:

```
ha_manage_app(slug="local_bp_monitor", action="rebuild")
```

Verify what is actually being served, rather than what is on disk:

```
ha_manage_app(slug="local_bp_monitor", path="/index.html")
```

## Android app

`android-app/AetosOneHealth/` — Kotlin / Jetpack Compose, package
`com.aetostechlabs.aetosonehealth`, **v1.1.0** (versionCode 4). Talks BLE
straight to both devices; the hub is not involved. The protocol decoders and the
DSP are ports of the add-ons' `protocol.py` and `dsp.py`, so phone and hub read
a frame identically.

| File | What |
|---|---|
| `AetosOneHealth-1.1.0.apk` | Signed release, sideload this |
| `AetosOneHealth-1.1.0.aab` | Signed bundle for Play |
| `AetosOneHealth-1.1.0-debug.apk` | Unminified debug build; installs **alongside** the release as a separate app (`…aetosonehealth.debug`). If the release crashes and this one runs, the problem is R8, not the code. |
| `mapping-1.1.0.txt.gz` | R8 mapping for decoding release stack traces. Regenerates on every release build at `app/build/outputs/mapping/release/`. |

Only the current version is kept here. Older APKs are deleted on each release
so there is never a question of which file is the live one.

**`aetosone-release.jks` and `keystore.properties` live in that project folder
and are irreplaceable.** Back them up somewhere else. Losing the key means the
app can never be updated on Play under the same identity.

Play listing assets are in `android-app/store-assets/`: feature graphic, 512
icon, and a privacy-policy page to publish at a public URL. Still outstanding
are two or more phone screenshots, which have to be captured from the real app
on a real phone.

### Version history

**v1.1.0 — Devices tab, "Add New Device".** An unfiltered LE scan lists
everything nearby by signal strength, with name, MAC and dBm, tagging likely
matches from the advertised name and service UUIDs. A picked device is saved and
matched **by MAC address** from then on. Name-prefix matching remains the
fallback when nothing is saved, so behaviour is unchanged until a device is
picked. Name matching is a guess that breaks on a replacement unit, a
differently named one, or two cuffs in one room; an address does not.

**v1.0.2 — renamed to "BP Monitor"** (nav, history tab, PDF export), and BP
diagnostics: every Bluetooth notification is logged as raw hex on the BP screen
with a running packet count, and the app now subscribes to *every* notifying
characteristic rather than only falling back to them. This exists because "the
cuff connects but shows no reading" is ambiguous — the cuff transmits only when
it completes its own measurement, so dashes can be correct behaviour. The packet
log separates "no data arriving" from "data arriving that we fail to decode".

### v1.0.1 — the app closed immediately on launch

The database switched on write-ahead logging with
`execSQL("PRAGMA journal_mode=WAL")`. That pragma returns a row, and Android's
`execSQL` rejects statements that return data on some versions — and it ran
inside `Application.onCreate`, so the throw killed the process before a frame
was drawn. Exactly the "tap the icon, nothing happens" symptom. It now uses the
helper API, `setWriteAheadLoggingEnabled(true)`, from the constructor.

Note this was a real defect that produces that symptom, not a confirmed
diagnosis of that particular crash — no phone was attached to prove it. So the
same build also makes the failure legible instead of silent:

- An uncaught-exception handler is installed as the first thing the process
  does, writing the trace to `filesDir/last-crash.txt`.
- Startup work in `Application.onCreate` is wrapped, so a failure there still
  lets the app launch into a screen showing the trace with a **Send details**
  button. An app that dies in `onCreate` never reaches an Activity, which is why
  a crash screen alone would never have been seen.
- R8 now keeps `ViewModel` constructors (created reflectively, so R8 was free to
  strip them) and keeps line numbers so release traces are readable.

`tools/adb` is included because the machine had none. With USB debugging on:
`tools/adb logcat -c`, launch the app, then `tools/adb logcat | grep -i aetos`.

## Three things that were hard-won

**The cuff would not connect until discovery was filtered to LE.**
`Device1.Connect()` connects every *supported* profile, and for a device BlueZ
has cached as dual-mode it tries the BR/EDR profiles first — of which this cuff
has none — so the call fails with `BREDR.ProfileUnavailable` no matter how many
times it is retried. The fix is at discovery time:
`SetDiscoveryFilter {Transport: "le"}`. The Android app's equivalent is passing
`TRANSPORT_LE` to `connectGatt`.

**Scan once, then wait.** Neither device advertises continuously. Looping the
scanner keeps the adapter busy for nothing and makes two add-ons fight over one
dongle. One pass runs on demand; a pass that finds nothing parks with a
plain-language reason.

**Raw in, calibrated out.** Readings are stored exactly as the device sent them;
calibration offsets apply at display and export. Changing an offset
re-interprets the whole history instead of corrupting it.

## Still open

- The BP frame's checksum algorithm is unconfirmed (0x33 and 0x2f seen), so
  frames are not checksum-verified. Payload bytes 4..13 are undecoded.
- The systolic/diastolic/pulse byte offsets come from a single captured frame
  and should be confirmed against the cuff's own screen. Treat a surprising
  reading as a decode question before reaching for the calibration steppers.
- **In the Android app the cuff connects but no reading appears.** Not yet
  diagnosed. Needs the BP screen's Activity log captured during a real
  measurement: packets arriving with no reading points at the decoder, zero
  packets points at the wrong characteristic. The ECG side is confirmed working
  on real hardware, so the BLE stack and DSP are not in question.
- The hub's Home Assistant instance name still reads "Aetos One". Changing it
  needs one field in Settings → System → General; the connector blocks that
  write.
