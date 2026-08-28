#!/bin/bash
# Aetos One build-v6 — generic_x86_64. Branded x86-64 core + same v6 seed/overlay.
# NOTE: full from-scratch buildroot compile for amd64 (multi-hour).
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os
PKG=$OS/buildroot-external/package/hassio
CORE=ghcr.io/home-assistant/generic-x86-64-homeassistant:2026.7.2

echo "== [1/3] branded x86-64 core $(date '+%H:%M') =="
test -d "$FE/hass_frontend" || { echo "frontend missing"; exit 1; }
CTX=$BASE/brand-core-v6-x86; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM %s\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' "$CORE" > "$CTX"/Dockerfile
sudo -n podman build --platform linux/amd64 -t aetos-core:v6-x86 "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v6-x86 "$CORE"
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar "$CORE"
echo "  x86 core tar $(du -h "$PKG"/aetos-core.tar|cut -f1)"

echo "== [2/3] refresh seed tar =="
tar cf "$PKG/aetos-seed.tar" -C "$BASE/v4-config-seed" .

echo "== [3/3] make generic_x86_64 $(date '+%H:%M') =="
cp "$PKG"/aetos-core.tar "$OS"/output/build/hassio-1.0.0/images/aetos-core.tar 2>/dev/null || true
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed "$OS"/output/images/rootfs.erofs "$OS"/output/images/data.ext4 "$OS"/output/images/*.img*
mkdir -p "$BASE/haos-cache"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT x86 $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v6.img.xz && echo "  -> deliverables" || echo "no img"
echo "== BUILD-V6-X86 DONE =="
