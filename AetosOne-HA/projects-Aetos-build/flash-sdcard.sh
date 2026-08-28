#!/bin/bash
set -e
DEV=/dev/sdb
IMG=/home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v1.img.xz
echo "== flashing $(basename "$IMG") -> $DEV =="
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v /home/krishna/projects/Aetos-build:/img:ro \
  docker.io/library/alpine:latest sh -c '
    apk add --no-cache xz pv util-linux >/dev/null 2>&1
    umount /dev/sdb* 2>/dev/null || true
    echo "writing (decompressed ~5.4GB)..."
    xzcat /img/aetos-one-rpi4-build-v1.img.xz | pv -pterb | dd of=/dev/sdb bs=4M conv=fsync
    sync
    partprobe /dev/sdb 2>/dev/null || true
    echo "== new partition table on card =="
    lsblk -o NAME,SIZE,FSTYPE,LABEL /dev/sdb
  '
echo "== FLASH COMPLETE =="
