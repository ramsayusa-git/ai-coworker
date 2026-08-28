#!/bin/bash
# Clean rootful finish of the Aetos One RPi4 HAOS image.
# The 31GB Buildroot output is valid (target ownership is handled by fakeroot);
# only the root-requiring final steps (data partition + image assembly) get redone
# correctly under rootful podman. Offline local-tar method (branded core preloaded).
set -e
BASE=/home/krishna/aetos-build
OS=$BASE/os

echo "== [1/3] normalize ownership of build tree + caches to uid 1001 (via rootful podman) =="
sudo -n podman run --rm -v "$BASE":/w docker.io/library/alpine:latest \
  sh -c 'chown -R 1001:1001 /w/os /w/haos-cache'
echo "  owner of build tree now uid: $(stat -c '%u' "$OS/output/build/hassio-1.0.0" 2>/dev/null)"

echo "== [2/3] build the hassos:local builder image (rootful) =="
cd "$OS"
sudo -n podman build -t hassos:local . 2>&1 | grep -viE 'systemd|linger|Emulate' | tail -4

echo "== [3/3] finish rpi4_64 (rootful + /dev for loop-mount; builder runs its own dockerd) =="
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID=1001 -e BUILDER_GID=1001 \
  hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'

echo "== RESULT =="
ls -lh "$OS/output/images/"*.img* 2>/dev/null || echo "no .img produced"
