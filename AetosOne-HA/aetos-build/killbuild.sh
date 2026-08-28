#!/bin/bash
sudo pkill -9 -f build-rpi4-v9811.sh 2>/dev/null
sudo pkill -9 -f master-build-v72.sh 2>/dev/null
sudo pkill -9 -f make 2>/dev/null
sleep 2
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sudo umount /home/krishna/aetos-build/os/output/build/hassio-1.0.0/data 2>/dev/null || true
rm -f /home/krishna/aetos-build/os/output/images/*.img* /home/krishna/aetos-build/os/output/images/rootfs.erofs /home/krishna/aetos-build/os/output/images/data.ext4 2>/dev/null
rm -f /home/krishna/aetos-build/os/output/build/hassio-1.0.0/.stamp_images_installed 2>/dev/null
echo "killed+cleaned"; pgrep -f master-build-v72 >/dev/null && echo STILL || echo gone
