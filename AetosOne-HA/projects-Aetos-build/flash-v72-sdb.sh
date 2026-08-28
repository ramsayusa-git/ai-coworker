#!/bin/bash
echo "=== Unmounting sdb partitions ==="
for p in /dev/sdb1 /dev/sdb2 /dev/sdb3 /dev/sdb4 /dev/sdb5 /dev/sdb6 /dev/sdb7 /dev/sdb8; do
  udisksctl unmount -b "$p" 2>/dev/null || sudo umount "$p" 2>/dev/null || true
done
echo "remaining sdb mounts:"; mount | grep -i /dev/sdb || echo "(none)"
echo "=== Flashing v7.2 image to /dev/sdb ==="
xzcat /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v7.2.img.xz | sudo dd of=/dev/sdb bs=4M conv=fsync iflag=fullblock status=progress
echo "=== syncing ==="
sudo sync
echo "=== DONE flashing ==="
