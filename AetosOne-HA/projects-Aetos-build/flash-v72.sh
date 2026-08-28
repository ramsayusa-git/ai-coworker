#!/bin/bash
set -e
DEV=/dev/sdb
echo "== flashing aetos-one-rpi4-build-v7.2.img.xz -> $DEV $(date '+%H:%M') =="
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v /home/krishna/projects/Aetos-build:/img:ro \
  docker.io/library/alpine:latest sh -c '
    apk add --no-cache xz pv util-linux parted >/dev/null 2>&1
    umount /dev/sdb* 2>/dev/null || true
    echo "writing image to card..."
    xzcat /img/aetos-one-rpi4-build-v7.2.img.xz | pv -pterb | dd of=/dev/sdb bs=4M conv=fsync
    sync
    blockdev --rereadpt /dev/sdb 2>/dev/null || true
    echo "== partition table on card =="
    parted -s /dev/sdb print 2>/dev/null | grep -iE "hassos|Number|Partition Table"
  '
echo "== FLASH-V72 COMPLETE $(date '+%H:%M') =="
