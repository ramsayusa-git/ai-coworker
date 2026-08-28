# Aetos One — Offline flashable HAOS build plan (Option B)

**Decision:** flashable **HAOS `.img`** appliance images, **RPi4 (arm64) first**, then
**generic x86-64**. Branded frontend (20260624.5 / core 2026.7.2) already built + approved.

## Dev-server capacity (confirmed)
- Disk 114 GB free · 8 CPU · 15 GB RAM · `qemu-aarch64` registered (arm64 cross-build OK).
- Adequate for a HAOS buildroot build (needs ~40–60 GB working space, hours of CPU).

## How HAOS branding works (the hard part)
HAOS is Buildroot Linux that runs Supervisor, which runs the **HA Core container** (where
the branded frontend lives) and **Apps** (add-ons) as separate containers. So a branded
appliance = HAOS built to ship/use a **branded core container** + OS-level branding.

## Build toolchain
- `git clone --recursive https://github.com/home-assistant/operating-system` (large; pulls
  Buildroot submodule).
- Build via the official builder container:
  `docker run --rm --privileged -v $PWD:/build -w /build ghcr.io/home-assistant/os-builder:<ver> make rpi4-64`
- Output: `output/images/haos_rpi4-64-<ver>.img.xz` (flashable). Repeat `make generic-x86-64`.

## Staged plan (de-risked)

### Stage 0 — Toolchain spike (vanilla build)
Build a **stock** `rpi4-64` HAOS image first, unbranded, to prove the toolchain/resources
work on the dev-server end-to-end. ~2–4 hrs. If this fails (disk/RAM/time), we rethink host.

### Stage 1 — Branded core container (arm64)
`FROM ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2` + COPY branded
`hass_frontend` + update-lock config → branded arm64 core image (COPY-only, minimal qemu).

### Stage 2 — Inject branding into the OS build
- **Core:** configure the OS build to **preload** our branded core image so first boot uses
  it offline (instead of pulling stock from ghcr). This is the key R&D step — locate the
  image-preload / version pin in `buildroot-external` and point it at our image.
- **OS-level:** hostname → `aetosone`, `/etc/os-release` NAME → Aetos One, boot splash /
  Plymouth logo → Aetos shield, disable/hide OS + core update channels (update-lock).

### Stage 3 — Build branded rpi4 image
`make rpi4-64` with the injected branding → `haos_rpi4-64-*.img.xz`. Verify by flashing to
a Pi (or QEMU boot for x86 later).

### Stage 4 — Apps offline
Preload the chosen add-on images (File Editor, Advanced SSH & Web Terminal, Mosquitto,
Samba) into the OS build so they're installable offline, or first-boot provision them.

### Stage 5 — Repeat for generic-x86-64
Branded x86-64 core image → `make generic-x86-64` → `.img.xz`. x86 image is QEMU-bootable
on the dev-server for a full smoke test.

## Honest risks
- **Time:** ~2–4 hrs per arch per build; several rebuilds expected → this is a multi-hour,
  multi-session effort, not a quick task.
- **Custom-core injection (Stage 2)** is the real unknown — HAOS doesn't officially support
  swapping in a custom core image; expect investigation and possible dead-ends. Fallback:
  ship stock HAOS + a first-boot script that installs the branded frontend into the core
  container (less "baked in" but far more reliable).
- **RAM (15 GB)** is on the lower side for buildroot; build may be slow or need swap.
- HAOS updates would replace the core → the update-lock is essential.

## Approval gate
Proposed start: **Stage 0 (vanilla rpi4 build)** to validate the toolchain before investing
in the branded pipeline. Approve to begin, or adjust scope (e.g. accept the first-boot
fallback instead of custom-core injection).
