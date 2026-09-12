# Changelog

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
