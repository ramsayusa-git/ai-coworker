#!/bin/bash
# Clean build-v4: current seed (editable dashboard + all components) -> fresh
# frontend (top-menu + shield + footers) -> branded core -> HAOS image.
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os
SEED=$BASE/v4-config-seed; PKG=$OS/buildroot-external/package/hassio

echo "== rebuild seed tar from current seed =="
tar cf "$PKG/aetos-seed.tar" -C "$SEED" .
echo "  seed $(du -h "$PKG/aetos-seed.tar"|cut -f1) | cards $(find "$SEED/www/community" -name '*.js'|wc -l) | integrations $(ls "$SEED/custom_components"|wc -l) | dashboard $([ -f "$SEED/.storage/lovelace.aetos_one" ] && echo editable || echo MISSING)"
grep -q 'aetos-seed.tar' "$PKG/create-data-partition.sh" && echo "  create-data-partition: seed-extract OK" || { echo "  FIX create-data-partition"; exit 1; }
grep -qi 'Aetos One OS' "$OS/buildroot-external/rootfs-overlay/etc/motd" && echo "  motd: rebranded OK" || echo "  motd: NOT rebranded"

echo "== [1/3] fresh frontend build (MODERN_ONLY) $(date '+%H:%M') =="
cd "$FE"; rm -rf hass_frontend
MODERN_ONLY=1 NODE_OPTIONS=--max-old-space-size=6144 corepack yarn build 2>&1 | tail -3
test -d hass_frontend || { echo "frontend build FAILED"; exit 1; }
grep -rlq "aetos-top-nav" hass_frontend/frontend_latest/ 2>/dev/null && echo "  top-nav in bundle OK" || echo "  WARN top-nav not found in bundle"
echo "  frontend built $(date '+%H:%M')"

echo "== [2/3] branded core =="
CTX=$BASE/brand-core-v4; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' > "$CTX"/Dockerfile
sudo -n podman build --platform linux/arm64 -t aetos-core:v4 "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v4 ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
echo "  core tar $(du -h "$PKG"/aetos-core.tar|cut -f1)"

echo "== [3/3] HAOS image (make rpi4_64) $(date '+%H:%M') =="
cp "$PKG"/aetos-core.tar "$OS"/output/build/hassio-1.0.0/images/aetos-core.tar 2>/dev/null || true
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed "$OS"/output/images/rootfs.erofs "$OS"/output/images/*.img*
mkdir -p "$BASE/haos-cache"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v4.img.xz && echo "  -> deliverables" || echo "no img"
echo "== BUILD-V4-CLEAN DONE =="
