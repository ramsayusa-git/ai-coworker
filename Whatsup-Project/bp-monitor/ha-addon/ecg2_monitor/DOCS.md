# ECG2 Monitor

Live ECG dashboard for the **ikinloop ecg2** (model Z3518A) Bluetooth ECG sensor,
running as a Home Assistant add-on with an Ingress web UI.

## What it does

- Connects to the ecg2 over the Home Assistant host's Bluetooth adapter (or receives
  the stream from a PC running `ecg_bridge.py` over MQTT — auto-selected).
- Guided, step-by-step connection flow in the UI: **Turn on device → Scanning →
  Connecting → Checking device → Skin contact → Signal check → Live**. Each step is
  driven by the real device state, with a hint telling you what to do.
- Live 10 s ECG trace (bedside-monitor sweep, 25 mm/s-style grid), filtered
  (0.5–40 Hz band-pass + mains notch) with optional raw overlay and gain.
- Heart rate from a QRS detector, plus the device's own HR, RR interval, battery,
  skin-contact state and a signal-quality check.
- Session recording to `/share/ecg2/sessions/*.csv` (idx, t_s, seq, raw, filtered)
  with list / download / delete from the UI.
- Home Assistant entities via MQTT discovery (needs the Mosquitto broker add-on):
  `sensor.ecg2_heart_rate`, `sensor.ecg2_heart_rate_device`, `sensor.ecg2_rr_interval`,
  `sensor.ecg2_battery`, `sensor.ecg2_signal_quality`, `sensor.ecg2_status`,
  `sensor.ecg2_source`, `binary_sensor.ecg2_skin_contact`, `binary_sensor.ecg2_connected`,
  `switch.ecg2_recording`.

## Installation

### Option A — local add-on folder (no GitHub needed)

1. Install the **Samba share** or **Advanced SSH & Web Terminal** add-on if you
   don't have one.
2. Copy the whole `ecg2_monitor` folder into the `/addons` share on the
   Home Assistant box, so you have `/addons/ecg2_monitor/config.yaml`.
3. Settings → Add-ons → Add-on Store → ⋮ (top right) → **Check for updates**.
4. Scroll to **Local add-ons**, open **ECG2 Monitor**, click **Install**
   (the image is built on the box; first build takes a couple of minutes).
5. Turn on **Show in sidebar** and **Start on boot**, then **Start**.
6. Open **ECG Monitor** in the sidebar.

### Option B — add-on repository

Push the `ha-addon` folder (the one containing `repository.yaml`) to a GitHub repo,
then Settings → Add-ons → Add-on Store → ⋮ → **Repositories** → paste the repo URL.

## Options

| Option | Default | Meaning |
|---|---|---|
| `source` | `auto` | `auto` = host Bluetooth first, MQTT bridge as fallback. `ble`, `mqtt`, or `replay` to force one. |
| `device_address` | `12:16:00:00:06:63` | BLE address of your ecg2. |
| `device_name` | `ikinloop` | Name prefix used when scanning (fallback to address). |
| `scan_timeout` | `20` | Seconds per scan round before asking you to wake the device again. |
| `mqtt_raw_topic` | `ecg2/raw` | Topic `ecg_bridge.py` publishes to. |
| `mqtt_host` / `mqtt_port` / `mqtt_user` / `mqtt_password` | (empty) | Leave empty to use the Mosquitto add-on automatically via the Supervisor. |
| `discovery_prefix` | `homeassistant` | MQTT discovery prefix. |
| `mains_hz` | `50` | Mains frequency for the notch filter (`60` in the Americas). |
| `log_level` | `info` | |

## Guided test procedure

Do this the first time, and any time it does not connect:

1. **Turn on device** — press the button on the ecg2 (or put it on). It only
   advertises for a few seconds after waking, and it will *not* advertise while the
   phone app holds it. Close the phone app first.
2. **Scanning** — the step turns orange and counts down. If it goes back to step 1
   with "Not advertising", press the button again and wait.
3. **Connecting / Checking device** — should take 2–5 s. Model, firmware and
   battery appear in the header/tiles.
4. **Skin contact** — put both electrodes on the skin. The device starts streaming
   by itself; nothing to press.
5. **Signal check** — hold still ~4 s. "Good"/"Fair" moves you to **Live**;
   "Noisy"/"Flat" means poor electrode contact.
6. **Live** — trace scrolls, heart flashes on each beat. Press **● Record** to save
   a session; it appears in *Recorded sessions* with a download link.

Bluetooth can be stopped/started from the UI (**Stop Bluetooth** / **Start**) and
**Reconnect** forces a fresh scan.

## Using the PC bridge instead of host Bluetooth

If the Home Assistant box has no Bluetooth adapter (or it's flaky), run the bridge on
a PC that has one:

```
pip install bleak paho-mqtt
python ecg_bridge.py --host <HA-IP> --user <mqtt-user> --password <mqtt-pass>
```

The bridge prints the same six guided steps. The add-on switches to
"Source: mqtt" automatically as soon as packets arrive.

## Notes

- `host_dbus: true` is required so bleak can talk to the host's BlueZ. The
  Home Assistant Bluetooth integration and this add-on can share the adapter.
- Writing to the vendor characteristic `92e86c7a-…` drops the link; the add-on never
  writes to the device.
- The ECG stream is ~530 samples/s, 8 samples per 18-byte notification.
- The 6-byte 1 Hz status frame is `02 <contact> 03 <device HR> 04 00`.
- This is not a medical device. Do not use it for diagnosis.
