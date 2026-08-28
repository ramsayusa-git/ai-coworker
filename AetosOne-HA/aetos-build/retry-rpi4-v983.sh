#!/bin/bash
# Kill the stuck rpi4 v9.8.3 build and cleanly resume the image step.
set -e
BASE=/home/krishna/aetos-build; OS=$BASE/os
echo "== kill stuck build $(date '+%H:%M') =="
pkill -TERM -f "master-build-v72.sh" 2>/dev/null || true
pkill -TERM -f "build-v982.sh" 2>/dev/null || true
sleep 3
# stop the make container + any nested dind, clear leftovers
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sudo umount "$OS/output/build/hassio-1.0.0/data" 2>/dev/null || true
sudo umount "$OS/output/images/data" 2>/dev/null || true
echo "== free memory =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed "$OS"/output/images/data.ext4 "$OS"/output/images/rootfs.erofs "$OS"/output/images/*.img*
# ensure build-dir dind-import has the pre-warm + core tar
cp "$OS/buildroot-external/package/hassio/dind-import-containers.sh" "$OS/output/build/hassio-1.0.0/dind-import-containers.sh"
mkdir -p "$OS/output/build/hassio-1.0.0/images"
cp "$OS/buildroot-external/package/hassio/aetos-core.tar" "$OS/output/build/hassio-1.0.0/images/aetos-core.tar"
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
sudo sysctl -w vm.dirty_background_bytes=134217728 >/dev/null 2>&1 || true
sudo sysctl -w vm.dirty_bytes=536870912 >/dev/null 2>&1 || true
free -h | head -2
echo "== resume make rpi4_64 $(date '+%H:%M') =="
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
rc=${PIPESTATUS[0]}
echo "== make rc=$rc $(date '+%H:%M') =="
if ls "$OS"/output/images/*.img.xz >/dev/null 2>&1; then
  cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v7.2.img.xz
  echo "  -> deliverable(tmp): aetos-one-rpi4-build-v7.2.img.xz"
else
  echo "  no img (rc=$rc)"
fi
sudo sysctl -w vm.dirty_background_bytes=0 >/dev/null 2>&1 || true
sudo sysctl -w vm.dirty_bytes=0 >/dev/null 2>&1 || true
echo "== RETRY-RPI4-V983 DONE $(date '+%H:%M') =="
