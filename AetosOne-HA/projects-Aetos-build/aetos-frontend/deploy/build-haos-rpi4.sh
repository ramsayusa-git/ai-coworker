#!/usr/bin/env bash
# Reproducible recipe: build a branded Aetos One HAOS .img for RPi4 (arm64).
# Run on an x86-64 Linux host with docker/podman + qemu-aarch64 registered,
# ~60 GB free disk, and the approved branded frontend build available.
#
# Prereqs already produced by the fork build:
#   - branded frontend at $FRONTEND/hass_frontend  (core 2026.7.2 / fe 20260624.5)
set -euo pipefail

WORK=${WORK:-/home/krishna/aetos-build}
FRONTEND=${FRONTEND:-$WORK/frontend}

# 1) Branded arm64 CORE container (frontend baked in) — COPY-only, minimal qemu.
mkdir -p "$WORK/brand-core-rpi4"
cp -r "$FRONTEND/hass_frontend" "$WORK/brand-core-rpi4/hass_frontend"
cat > "$WORK/brand-core-rpi4/Dockerfile" <<'DOCKER'
FROM ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
COPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/
LABEL org.aetos.brand="Aetos One"
DOCKER
podman build --platform linux/arm64 -t aetos-one-ha:rpi4-2026.7.2 "$WORK/brand-core-rpi4"

# 2) Save it tagged as the image HAOS expects for rpi4, for offline preload.
podman tag aetos-one-ha:rpi4-2026.7.2 \
  ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
podman save --format docker-archive -o "$WORK/aetos-core-rpi4.tar" \
  ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2

# 3) Clone HAOS OS repo (shallow) + place the branded core tar for preload.
[ -d "$WORK/os" ] || git clone --depth 1 --recurse-submodules --shallow-submodules \
  https://github.com/home-assistant/operating-system.git "$WORK/os"
cp "$WORK/aetos-core-rpi4.tar" "$WORK/os/buildroot-external/package/hassio/aetos-core.tar"

# 4) INJECTION — apply the saved patch to hassio.mk:
#    pins core=2026.7.2, drops stock-core fetch, preloads our aetos-core.tar.
#    (Patch: branding/patches/haos-hassio-injection.patch)
git -C "$WORK/os" apply "${BRANDING_DIR:-$PWD}/branding/patches/haos-hassio-injection.patch" \
  || echo "patch may already be applied"

# NOTE: This step (create-data-partition.sh) does a loop-mount + Docker-in-Docker,
# so it REQUIRES a rootful host with real Docker (won't run on rootless podman).
# On such a host it completes without modification.

# 5) Build the builder image, then the OS image.
cd "$WORK/os"
docker build -t hassos:local .
mkdir -p output
docker run --rm --privileged \
  -v "$PWD:/build" -v "$WORK/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" \
  hassos:local make rpi4_64
# Output: output/images/haos_rpi4-64-*.img.xz   (flashable, branded, offline core)

# TODO (remaining branding, applied via rootfs-overlay before build):
#   - hostname -> aetosone ; /etc/os-release NAME -> Aetos One
#   - boot splash / Plymouth logo -> Aetos shield
#   - update-lock (disable OS + core update channels)
#   - preload chosen add-on images (File Editor, Advanced SSH, Mosquitto, Samba)
# For x86-64: repeat with base generic-x86-64-homeassistant + `make generic_x86_64`.
