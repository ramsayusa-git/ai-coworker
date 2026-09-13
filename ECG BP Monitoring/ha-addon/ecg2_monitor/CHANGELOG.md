# Changelog

## 1.3.0 — 2026-09-13
**Scans once instead of forever.** The add-on used to loop wake → scan → wake
→ scan indefinitely, keeping the Bluetooth adapter busy for nothing and leaving
a permanent "Scanning for ecg2" pill in the header — with two add-ons sharing
one dongle, both were hammering it. It now runs a single scan pass at start and
then stops, reporting why: the device wasn't advertising, the link closed, or a
connect attempt failed.

A **Scan** button sits in the step panel, with a second in the header next to
Calibration, so scanning can be restarted. Both are the same single action,
backed by `POST /api/scan`.

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
header, not a bare icon. A dot appears on it whenever an offset is active.

**All displayed values now align off the one offset.** RR interval is derived
from heart rate, so calibrating HR shifts RR with it — previously the dashboard
could show a calibrated heart rate next to an uncalibrated interval that
contradicted it (65 bpm alongside 800 ms). The RR tile shows the measured value
underneath when an offset is active, and `hr_samples` still stores both the
measured heart rate and the measured interval, so the raw record is intact.

## 1.2.2 — 2026-09-12
Dropped "Home Assistant" from the dashboard's own wording: the scanning hint
now reads "Keep it within 2 m of the hub", and the raw-capture rows refer to
"the 'Recording' switch on the hub". The box is branded Aetos One Hub, so the
underlying platform's name has no business appearing in the product UI. Code
comments still say Home Assistant where they describe what the add-on talks to.

## 1.2.1 — 2026-09-12
Calibration was buried in the Profiles tab. There is now a **gear button at the
top right** opening a settings sheet with the active-profile selector and the
heart-rate calibration stepper, plus reset and a link through to profile
management. A dot on the gear shows when the offset is non-zero. The stepper
stays in the Profiles tab too — both render from the same state. Escape or a
click outside closes the sheet.

## 1.2.0 — 2026-09-12
**Profiles.** Every wear is attributed to a profile. A selector in the top bar
sets who is being recorded; the new Profiles tab adds, renames, selects and
deletes them. Deleting a profile **keeps** its sessions (they become
Unassigned). Sessions can be filtered per profile and reassigned from their
row, and stats/trends/CSV are profile-aware. If a profile is created or
switched *during* a wear, the open session moves with it — otherwise the live
view and the stored history would disagree.

**Calibration.** A plus/minus stepper for a per-profile heart-rate offset, to
align the add-on against a reference you trust. `hr_samples` always stores the
rate the QRS detector actually measured; the offset is applied when a value is
displayed or published, so recalibrating re-aligns the whole history rather
than corrupting it, and the CSV carries both measured and calibrated columns.
The RR interval is deliberately left uncalibrated — it is a directly measured
time between beats.

**Dashboard parity with BP Monitor.** Heart rate, RR interval and battery now
sit in a prominent three-card readout row, followed by a colour-coded verdict
banner giving the heart-rate zone against the adult resting reference range —
or a plain "signal is noisy, treat this as unreliable" when the quality tag
says so.

Existing databases migrate in place (`sessions.profile_id`, `profiles.cal_hr`).

## 1.1.0 — 2026-09-12
SQLite session history with automatic per-wear recording, HR sampled every 2 s,
rebuilt dashboard (top tab bar, full step detail, reworked charts and ECG-paper
waveform), and removal of the start/stop/reconnect controls.
