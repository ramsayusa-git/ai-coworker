#!/bin/bash
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os-x86
PKG=$OS/buildroot-external/package/hassio
CORE=ghcr.io/home-assistant/generic-x86-64-homeassistant:2026.7.2
echo "== [1/3] x86 branded core $(date '+%H:%M') =="
CTX=$BASE/brand-core-v71-x86; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM %s\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' "$CORE" > "$CTX"/Dockerfile
sudo -n podman build --platform linux/amd64 -t aetos-core:v71x "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v71x "$CORE"
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar "$CORE"
echo "== [2/3] seed =="
tar cf "$PKG/aetos-seed.tar" -C "$BASE/v4-config-seed" .
echo "== [3/3] make generic_x86_64 (os-x86, own cache) $(date '+%H:%M') =="
mkdir -p "$BASE/haos-cache-x86"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache-x86:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v7.1.img.xz && echo "  -> deliverables" || echo "no img"
echo "== BUILD-X86-V71 DONE =="
