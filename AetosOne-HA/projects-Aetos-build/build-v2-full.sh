#!/bin/bash
# Full build-v2: branded frontend + core + OS branding + rpi4 image (rootful).
set -e
BASE=/home/krishna/aetos-build
BR=/home/krishna/projects/Aetos-build/aetos-frontend/branding
OS=$BASE/os
FE=$BASE/frontend

echo "== [1/4] frontend: branding + build (MODERN_ONLY) =="
cd "$FE"
cp -f "$BR"/assets/icons/* public/static/icons/
git apply "$BR"/patches/v2-branding.patch
corepack enable 2>/dev/null || true
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack yarn install --immutable 2>&1 | tail -2
MODERN_ONLY=1 NODE_OPTIONS=--max-old-space-size=6144 corepack yarn build 2>&1 | tail -3
test -d hass_frontend && echo "  frontend built"

echo "== [2/4] branded core container + save tar (rootful) =="
CTX=$BASE/brand-core; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' > "$CTX"/Dockerfile
sudo -n podman build --platform linux/arm64 -t aetos-core:v2 "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v2 ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
sudo -n podman save --format docker-archive -o "$OS"/buildroot-external/package/hassio/aetos-core.tar ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
echo "  core tar: $(ls -lh "$OS"/buildroot-external/package/hassio/aetos-core.tar | awk '{print $5}')"

echo "== [3/4] hassio.mk injection + data partition 8G =="
git -C "$OS" apply "$BR"/patches/haos-hassio-injection.patch
sed -i 's/truncate --size="1280M"/truncate --size="8192M"/' "$OS"/buildroot-external/package/hassio/create-data-partition.sh

echo "== [4/4] build builder + rpi4_64 image (rootful + /dev) =="
cd "$OS"
sudo -n podman build -t hassos:local . 2>&1 | tail -2
mkdir -p output
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" \
  hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT =="; ls -lh "$OS"/output/images/*.img.xz 2>/dev/null || echo "no img"
