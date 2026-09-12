# Aetos One Health — native Android app

Kotlin / Jetpack Compose app that talks **directly over Bluetooth LE** to two
devices, with no hub in the loop:

- **ikinloop ecg2** (Z3518A) — live ECG waveform, heart rate, RR interval
- **RBP1711150377** (ISSC BT5050) blood-pressure cuff — systolic, diastolic, pulse

## Why it is built this way

The protocol decoders and the DSP are straight ports of the two Home Assistant
add-ons running on the Aetos One hub, so both implementations agree byte for
byte on what a frame means. Three decisions are worth knowing about before
changing anything:

**Scan once, then wait.** Neither device advertises continuously — they wake for
a few seconds after a button press or when worn. An endless scan would keep the
phone's radio busy while the device is asleep. So one pass runs on demand, and a
pass that finds nothing parks the app in an idle state with a plain-language
reason. The Scan button is *always* on screen — greyed with a "Scanning…" label
while a pass runs, never hidden. A control that disappears is how someone ends
up asking how to start a scan at all.

**LE transport, explicitly.** The BP cuff gets cached as dual-mode by some
Bluetooth stacks. An auto-transport `connectGatt` then tries BR/EDR profiles the
cuff does not have and fails outright, no matter how many times you retry. The
app passes `TRANSPORT_LE` so the phone never goes down that path.

**Raw in, calibrated out.** Readings are stored exactly as the device reported
them. Calibration offsets are applied when a value is displayed or exported, so
changing an offset re-interprets the whole history rather than corrupting it,
and the original measurement is never lost.

## Layout

```
app/src/main/java/com/aetostechlabs/aetosonehealth/
  proto/      EcgProtocol, BpProtocol — frame decoders
  dsp/        Biquad filters, Pan-Tompkins-lite QRS detector, signal quality
  ble/        BleClient (suspend wrapper over GATT), EcgEngine, BpEngine, state
  data/       HealthDb (SQLite), Repository, models, calibration
  ui/         Compose screens, charts, theme
  export/     CSV + PDF export via the share sheet
  notify/     Notification channels
  service/    Foreground service so a session survives the screen going off
```

## Build

```bash
export ANDROID_HOME=/path/to/android-sdk
./gradlew :app:testDebugUnitTest    # decoder + DSP tests
./gradlew :app:assembleRelease      # signed APK
./gradlew :app:bundleRelease        # signed AAB for Play
```

Release signing reads `keystore.properties` at the repo root (git-ignored;
`keystore.properties.sample` shows the shape). Without it the release build
still configures, it just produces an unsigned artifact.

## Permissions

`BLUETOOTH_SCAN` (with `neverForLocation`) and `BLUETOOTH_CONNECT` on Android
12+; the legacy trio below that. `POST_NOTIFICATIONS` for the reading alert, and
a connected-device foreground service. **No `INTERNET` permission** — nothing
leaves the phone.

## Known open items

Carried over from the hub work, unchanged here:

- The BP frame's checksum algorithm is not confirmed, so frames are not
  checksum-verified. Bytes 4..13 of the payload (flags / record index) are
  undecoded.
- The systolic/diastolic/pulse byte offsets come from a single captured frame
  and should be confirmed against the cuff's own screen. Until then, treat a
  surprising reading as a decode question first.

Not a diagnostic device. Discuss any clinical concern with a clinician.
