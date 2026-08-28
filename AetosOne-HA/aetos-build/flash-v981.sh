#!/bin/bash
DEV=/dev/sdb
IMG=/home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v9.8.1.img.xz
RM=$(lsblk -dno RM "$DEV" 2>/dev/null)
if [ "$RM" != "1" ]; then echo "REFUSING: $DEV not removable (RM=$RM)"; exit 1; fi
echo "target: $DEV size=$(lsblk -dno SIZE $DEV) model=$(lsblk -dno MODEL $DEV) removable=$RM"
for p in ${DEV}?*; do sudo umount "$p" 2>/dev/null && echo "  umounted $p"; done
echo "=== flashing v9.8.1 $(date +%T) ==="
xz -dc "$IMG" | sudo dd of="$DEV" bs=4M oflag=direct conv=fsync status=none
echo "=== dd done, syncing $(date +%T) ==="
sync
sudo partprobe "$DEV" 2>/dev/null
lsblk "$DEV"
echo "=== FLASH COMPLETE $(date +%T) ==="
