#!/bin/bash
# build-v3fix: package the ACTUAL footer frontend into the core (previous flash
# used a stale core), rebrand /etc/motd, regenerate rootfs + data partition + image.
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os
PKG=$OS/buildroot-external/package/hassio

echo "== [1/4] rebuild core from CURRENT footer frontend =="
test -f "$FE/hass_frontend/frontend_latest/69788.146719f817ddd80b.js" || { echo "footer bundle missing"; exit 1; }
CTX=$BASE/brand-core-v3fix; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' > "$CTX"/Dockerfile
sudo -n podman build --platform linux/arm64 -t aetos-core:v3fix "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v3fix ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
echo "  fresh core tar: $(stat -c '%y' "$PKG"/aetos-core.tar | cut -d. -f1)"

echo "== [2/4] rebrand /etc/motd (overlay + target) =="
MOTD_OVL=$OS/buildroot-external/rootfs-overlay/etc/motd
sed -i 's/Home Assistant OS/Aetos One OS/; s/Home Assistant CLI/Aetos One CLI/' "$MOTD_OVL"
sed -i 's/Home Assistant OS/Aetos One OS/; s/Home Assistant CLI/Aetos One CLI/' "$OS"/output/target/etc/motd 2>/dev/null || true
echo "  motd now: $(sed 's/\x1b\[[0-9;]*m//g' "$MOTD_OVL" | head -1)"

echo "== [3/4] force rootfs + image regen =="
cp "$PKG"/aetos-core.tar "$OS"/output/build/hassio-1.0.0/images/aetos-core.tar
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed
rm -f "$OS"/output/images/rootfs.erofs "$OS"/output/images/*.img*
mkdir -p "$BASE/haos-cache"

echo "== [4/4] make rpi4_64 =="
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" \
  hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'

echo "== RESULT (v3fix: footer + motd + HTTPS) =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && \
  cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v3.img.xz && \
  echo "  copied to deliverables" || echo "no img"
