#!/bin/bash
# Resume rpi4 v7.1 build ALONE (no make clean — buildroot continues from 225 pkgs).
set -e
BASE=/home/krishna/aetos-build; OS=$BASE/os; PKG=$OS/buildroot-external/package/hassio
mkdir -p "$BASE/haos-cache"
cd "$OS"
echo "== resume make rpi4_64 $(date '+%F %H:%M') =="
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT $(date '+%F %H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v7.1.img.xz && echo "  -> deliverables" || echo "no img"
echo "== RESUME-RPI4-V71 DONE =="
