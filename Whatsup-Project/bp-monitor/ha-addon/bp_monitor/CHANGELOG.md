# Changelog

## 1.0.0 — 2026-09-12
Initial release. Host-Bluetooth source for the RBP1711150377 (ISSC BT5050)
cuff, guided connection flow, MQTT-discovered HA entities (systolic,
diastolic, pulse, status, connected), reading history log.

Protocol decode is best-effort from a single captured frame — see DOCS.md
"Known limitations" before trusting readings for anything but testing.
