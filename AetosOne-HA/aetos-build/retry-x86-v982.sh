#!/bin/bash
# Resume the x86 v9.8.2 build after the dind OOM (Error 137). Frees memory hard,
# clears leftover dind containers + stale data mount, then re-runs make (redoes
# the image-install dind + rootfs + image only; core/toolchain already built).
set -e
BASE=/home/krishna/aetos-build; OS=$BASE/os-x86

echo "== free memory + clear leftovers $(date '+%H:%M') =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
# remove any leftover rootful podman containers (the killed dind)
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
# unmount a stale loop data mount if the failed run left one
sudo umount "$OS/output/build/hassio-1.0.0/data" 2>/dev/null || true
# fresh data.ext4 next run
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed "$OS"/output/images/data.ext4 "$OS"/output/images/rootfs.erofs "$OS"/output/images/*.img*
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
# make dirty pages flush sooner to cut peak RAM during the big loop-fs writes
sudo sysctl -w vm.dirty_background_bytes=134217728 >/dev/null 2>&1 || true
sudo sysctl -w vm.dirty_bytes=536870912 >/dev/null 2>&1 || true
free -h | head -2

echo "== resume make generic_x86_64 $(date '+%H:%M') =="
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache-x86:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
rc=${PIPESTATUS[0]}
echo "== make rc=$rc $(date '+%H:%M') =="

echo "== RESULT $(date '+%H:%M') =="
if ls "$OS"/output/images/*.img.xz >/dev/null 2>&1; then
  cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v7.2.img.xz
  echo "  -> deliverable(tmp): aetos-one-x86-64-build-v7.2.img.xz"
else
  echo "  no img (rc=$rc)"
fi
# restore normal dirty ratios
sudo sysctl -w vm.dirty_background_bytes=0 >/dev/null 2>&1 || true
sudo sysctl -w vm.dirty_bytes=0 >/dev/null 2>&1 || true
echo "== RETRY-X86-V982 DONE $(date '+%H:%M') =="
