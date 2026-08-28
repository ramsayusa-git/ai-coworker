#!/bin/bash
# build-v3: rebuild frontend (footer + hide-updates) -> new core -> reload data
# partition -> new image. Reuses the v2 os tree for speed.
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os

echo "== [1/4] rebuild frontend v3 (MODERN_ONLY) $(date) =="
cd "$FE"; rm -rf hass_frontend
MODERN_ONLY=1 NODE_OPTIONS=--max-old-space-size=6144 corepack yarn build 2>&1 | tail -3
test -d hass_frontend && echo "  frontend v3 built"

echo "== [2/4] rebuild branded core (v3) =="
CTX=$BASE/brand-core-v3; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' > "$CTX"/Dockerfile
sudo -n podman build --platform linux/arm64 -t aetos-core:v3 "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v3 ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
sudo -n podman save --format docker-archive -o "$OS"/buildroot-external/package/hassio/aetos-core.tar ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
echo "  core v3 tar: $(ls -lh "$OS"/buildroot-external/package/hassio/aetos-core.tar | awk '{print $5}')"

echo "== [3/4] wait for flash to finish (avoid /dev contention) =="
while pgrep -f flash-v2.sh >/dev/null 2>&1; do sleep 30; done
echo "  flash done, proceeding"

echo "== [4/4] reload data partition with v3 core + rebuild image =="
cp "$OS"/buildroot-external/package/hassio/aetos-core.tar "$OS"/output/build/hassio-1.0.0/images/aetos-core.tar
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed "$OS"/output/images/*.img*
mkdir -p "$BASE/haos-cache"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" \
  hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT (v3) =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && \
  cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v3.img.xz || echo "no img"
