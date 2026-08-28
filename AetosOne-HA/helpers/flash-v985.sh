#!/bin/bash
DEV=/dev/sdc
IMG=/home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v9.8.5.img.xz
# --- SAFETY: only flash a small USB removable that is NOT root and NOT the data drive ---
RM=$(lsblk -dno RM "$DEV" 2>/dev/null)
TRAN=$(lsblk -dno TRAN "$DEV" 2>/dev/null)
SIZE=$(lsblk -dnbo SIZE "$DEV" 2>/dev/null)
ROOTSRC=$(findmnt -no SOURCE / 2>/dev/null)
DATASRC=$(findmnt -no SOURCE /run/media/krishna/data-backup 2>/dev/null)
echo "target=$DEV rm=$RM tran=$TRAN size=$((SIZE/1024/1024/1024))G root=$ROOTSRC data=$DATASRC"
[ "$RM" = "1" ]     || { echo "REFUSE: $DEV not removable"; exit 1; }
[ "$TRAN" = "usb" ] || { echo "REFUSE: $DEV not USB"; exit 1; }
[ "$SIZE" -lt 34359738368 ] || { echo "REFUSE: $DEV >32G, not an SD card"; exit 1; }
case "$ROOTSRC" in /dev/sdc*) echo "REFUSE: root is on $DEV"; exit 1;; esac
case "$DATASRC" in /dev/sdc*) echo "REFUSE: data-backup is on $DEV"; exit 1;; esac
[ -f "$IMG" ] || { echo "REFUSE: image missing $IMG"; exit 1; }

echo "=== unmounting any $DEV partitions ==="
for p in ${DEV}?*; do sudo umount "$p" 2>/dev/null && echo "  umounted $p"; done
echo "=== flashing v9.8.4 -> $DEV $(date +%T) ==="
xz -dc "$IMG" | sudo dd of="$DEV" bs=4M oflag=direct conv=fsync status=none
echo "=== syncing $(date +%T) ==="
sync; sudo partprobe "$DEV" 2>/dev/null
lsblk "$DEV"
echo "=== FLASH COMPLETE $(date +%T) ==="
