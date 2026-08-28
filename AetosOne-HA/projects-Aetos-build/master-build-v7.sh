#!/bin/bash
# Aetos One build-v7 (rpi4_64): all v7 frontend changes + SSL + branding + recovery.
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os
SEED=$BASE/v4-config-seed; PKG=$OS/buildroot-external/package/hassio

echo "== pre-flight =="
tar cf "$PKG/aetos-seed.tar" -C "$SEED" .
echo "  seed $(du -h "$PKG/aetos-seed.tar"|cut -f1) | cards $(find "$SEED/www/community" -name '*.js'|wc -l) | integrations $(ls "$SEED/custom_components"|wc -l) | ssl $(grep -q ssl_cert "$SEED/configuration.yaml" && echo ON || echo off) | branding pkg $([ -f "$SEED/packages/aetos_branding.yaml" ] && echo yes || echo NO)"
grep -q 'aetos-seed.tar' "$PKG/create-data-partition.sh" && echo "  seed-extract OK"
grep -qi 'AETOS ONE' "$OS/buildroot-external/rootfs-overlay/etc/motd" && echo "  motd ASCII banner OK"
[ -s "$OS/buildroot-external/rootfs-overlay/root/.ssh/authorized_keys" ] && echo "  SSH recovery key OK"

echo "== [1/3] frontend build (v7.1) $(date '+%H:%M') =="
cd "$FE"; rm -rf hass_frontend
MODERN_ONLY=1 NODE_OPTIONS=--max-old-space-size=6144 corepack yarn build 2>&1 | tail -3
test -d hass_frontend || { echo "frontend FAILED"; exit 1; }
grep -rlq "ha-config-branding" hass_frontend/frontend_latest/ 2>/dev/null && echo "  branding panel in bundle OK" || echo "  WARN branding panel not found"

echo "== [2/3] branded core (arm64) =="
CTX=$BASE/brand-core-v7; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' > "$CTX"/Dockerfile
sudo -n podman build --platform linux/arm64 -t aetos-core:v71 "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v71 ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
echo "  core tar $(du -h "$PKG"/aetos-core.tar|cut -f1)"

echo "== [3/3] make rpi4_64 $(date '+%H:%M') =="
cp "$PKG"/aetos-core.tar "$OS"/output/build/hassio-1.0.0/images/aetos-core.tar 2>/dev/null || true
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed "$OS"/output/images/rootfs.erofs "$OS"/output/images/data.ext4 "$OS"/output/images/*.img*
mkdir -p "$BASE/haos-cache"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v7.1.img.xz && echo "  -> deliverables" || echo "no img"
echo "== BUILD-V7.1-RPI4 DONE =="
