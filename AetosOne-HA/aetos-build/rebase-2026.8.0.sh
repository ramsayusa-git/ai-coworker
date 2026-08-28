#!/bin/bash
# Pull the latest rpi4 Core image (2026.8.0) and extract its frontend so we can
# re-apply Aetos branding on top of the newest Home Assistant.
set -e
BASE=/home/krishna/aetos-build
VER=2026.8.0
IMG=ghcr.io/home-assistant/raspberrypi4-64-homeassistant:$VER
echo "=== pull $IMG (arm64) $(date '+%H:%M') ==="
sudo podman pull --platform linux/arm64 "$IMG" 2>&1 | tail -3
echo "=== create temp container + extract hass_frontend ==="
CID=$(sudo podman create --platform linux/arm64 "$IMG")
echo "cid=$CID"
FEDIR=$(sudo podman exec "$CID" true 2>/dev/null; sudo podman run --rm --platform linux/arm64 "$IMG" sh -c 'ls -d /usr/local/lib/python3.*/site-packages/hass_frontend 2>/dev/null | head -1' 2>/dev/null)
echo "frontend path in image: $FEDIR"
rm -rf /tmp/newfe && mkdir -p /tmp/newfe
sudo podman cp "$CID:$FEDIR" /tmp/newfe/hass_frontend
sudo podman rm "$CID" >/dev/null 2>&1
sudo chown -R "$(id -u):$(id -g)" /tmp/newfe 2>/dev/null || true
echo "=== extracted ==="
ls /tmp/newfe/hass_frontend/frontend_latest/ | head -3
echo "chunks: $(ls /tmp/newfe/hass_frontend/frontend_latest/*.js 2>/dev/null | wc -l)"
echo "REBASE-EXTRACT DONE $(date '+%H:%M')"
