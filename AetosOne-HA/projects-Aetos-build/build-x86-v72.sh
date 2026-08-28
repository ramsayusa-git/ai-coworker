#!/bin/bash
# Aetos One build-v7.2 (generic_x86_64). Run AFTER the rpi4 build finishes.
# Recreates a CLEAN os-x86 tree (source only, no arm64 output) to avoid arch-mixing.
# Needs a terminal with sudo (rootful podman --privileged).
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os-x86
SRC=$BASE/os
PKG=$OS/buildroot-external/package/hassio
CORE=ghcr.io/home-assistant/generic-x86-64-homeassistant:2026.7.2

echo "== [0/4] (re)create clean os-x86 from os/ (exclude output/.git) $(date '+%H:%M') =="
mkdir -p "$OS"
rsync -a --delete --exclude 'output/' --exclude '.git/' "$SRC"/ "$OS"/
date +%s > $OS/buildroot-external/rootfs-overlay/usr/share/aetos/build-epoch  # aetos-clock-guard: stamp build date
echo "  os-x86 ready ($(du -sh "$OS" 2>/dev/null|cut -f1))"

echo "== [1/4] x86 branded core $(date '+%H:%M') =="
CTX=$BASE/brand-core-v72-x86; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM %s\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' "$CORE" > "$CTX"/Dockerfile
sudo -n podman build --platform linux/amd64 -t aetos-core:v72x "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v72x "$CORE"
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar "$CORE"
echo "  core tar $(du -h "$PKG"/aetos-core.tar|cut -f1)"

echo "== [2/4] seed =="
tar cf "$PKG/aetos-seed.tar" -C "$BASE/v4-config-seed" .

echo "== [3/4] make generic_x86_64 (own cache) $(date '+%H:%M') =="
mkdir -p "$BASE/haos-cache-x86"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache-x86:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== [4/4] RESULT $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v7.2.img.xz && echo "  -> deliverable: aetos-one-x86-64-build-v7.2.img.xz" || echo "no img"
echo "== BUILD-X86-V72 DONE $(date '+%H:%M') =="
