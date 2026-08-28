#!/bin/bash
# v7.1 rpi4: the OS output/ is x86_64 from the last build -> make clean, then
# rebuild rpi4 (arm64) fresh. Frontend + arm64 core tar already built this run.
set -e
BASE=/home/krishna/aetos-build; OS=$BASE/os; PKG=$OS/buildroot-external/package/hassio
echo "== verify arm64 core tar present =="
ls -lh "$PKG/aetos-core.tar" | awk '{print $5}'
sudo -n podman images 2>/dev/null | grep -E 'raspberrypi4-64-homeassistant' | head -1
tar cf "$PKG/aetos-seed.tar" -C "$BASE/v4-config-seed" .
mkdir -p "$BASE/haos-cache"
cd "$OS"
echo "== make clean (switch x86_64 -> arm64) $(date '+%H:%M') =="
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  hassos:local make clean 2>&1 | tail -3
echo "== make rpi4_64 (fresh) $(date '+%H:%M') =="
cp "$PKG"/aetos-core.tar "$OS"/output/build/hassio-1.0.0/images/aetos-core.tar 2>/dev/null || true
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v7.1.img.xz && echo "  -> deliverables" || echo "no img"
echo "== REBUILD-RPI4-V71 DONE =="
