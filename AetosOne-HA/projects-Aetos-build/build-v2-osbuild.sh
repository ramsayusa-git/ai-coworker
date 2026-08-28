#!/bin/bash
# Re-run ONLY the build-v2 OS build step (steps 1-3 already done: frontend, core tar, injection).
set -e
BASE=/home/krishna/aetos-build
OS=$BASE/os
mkdir -p "$BASE/haos-cache"            # the dir that was missing
cd "$OS"
sudo -n podman image exists hassos:local || sudo -n podman build -t hassos:local . 2>&1 | tail -2
mkdir -p output
echo "== building rpi4_64 (build-v2) $(date) =="
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" \
  hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && \
  cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v2.img.xz || echo "no img"
