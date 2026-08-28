#!/bin/bash
# Resume the x86-64 v6 build after the reboot. Buildroot picks up where it stopped.
set -e
BASE=/home/krishna/aetos-build; OS=$BASE/os; PKG=$OS/buildroot-external/package/hassio
mkdir -p "$BASE/haos-cache"
cd "$OS"
echo "== resume make generic_x86_64 $(date '+%F %H:%M') =="
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT $(date '+%F %H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v6.img.xz && echo "  -> deliverables" || echo "no img"
echo "== RESUME-X86 DONE =="
