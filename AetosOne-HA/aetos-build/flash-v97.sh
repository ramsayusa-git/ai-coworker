#!/bin/bash
DEV=/dev/sdb
IMG=/home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v9.7.img.xz
# Safety: only ever write to a REMOVABLE device.
RM=$(lsblk -dno RM "$DEV" 2>/dev/null)
MODEL=$(lsblk -dno MODEL "$DEV" 2>/dev/null)
SIZE=$(lsblk -dno SIZE "$DEV" 2>/dev/null)
if [ "$RM" != "1" ]; then echo "REFUSING: $DEV is not removable (RM=$RM)"; exit 1; fi
echo "target: $DEV  size=$SIZE  model=$MODEL  removable=$RM"
echo "unmounting any mounted partitions on $DEV ..."
for p in ${DEV}?*; do sudo umount "$p" 2>/dev/null && echo "  umounted $p"; done
echo "=== flashing v9.7 (decompress + write) $(date +%T) ==="
xz -dc "$IMG" | sudo dd of="$DEV" bs=4M oflag=direct conv=fsync status=none
echo "=== dd done, syncing $(date +%T) ==="
sync
sudo partprobe "$DEV" 2>/dev/null
echo "=== resulting partitions ==="
lsblk "$DEV"
echo "=== FLASH COMPLETE $(date +%T) ==="
