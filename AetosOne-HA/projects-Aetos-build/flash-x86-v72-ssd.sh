#!/bin/bash
DEV=/dev/sdb   # USB SSD FPT310M8SSD128G (119.2G) — NOT the system disk (sda)
echo "== flashing aetos-one-x86-64-build-v7.2.img.xz -> $DEV (USB SSD) $(date '+%H:%M') =="
# host-side unmount of any automounted partitions (user-level, no sudo needed) — non-fatal
for p in /dev/sdb[0-9]*; do udisksctl unmount -b "$p" 2>/dev/null || true; umount "$p" 2>/dev/null || true; done
set -e
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v /home/krishna/projects/Aetos-build:/img:ro \
  docker.io/library/alpine:latest sh -c '
    apk add --no-cache xz pv util-linux parted >/dev/null 2>&1
    umount /dev/sdb* 2>/dev/null || true
    echo "writing image to SSD..."
    xzcat /img/aetos-one-x86-64-build-v7.2.img.xz | pv -pterb | dd of=/dev/sdb bs=4M conv=fsync
    sync
    blockdev --rereadpt /dev/sdb 2>/dev/null || true
    echo "== partition table on SSD =="
    parted -s /dev/sdb print 2>/dev/null | grep -iE "hassos|Number|Partition Table"
  '
echo "== FLASH-X86-SSD COMPLETE $(date '+%H:%M') =="
