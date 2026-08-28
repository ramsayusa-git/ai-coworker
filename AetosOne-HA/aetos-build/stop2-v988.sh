#!/bin/bash
sudo pkill -9 -f build-rpi4-v988.sh 2>/dev/null
sudo pkill -9 -f master-build-v72.sh 2>/dev/null
sudo pkill -9 -f make 2>/dev/null
sudo pkill -9 -f hassos:local 2>/dev/null
sleep=0
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sleep 3
BASE=/home/krishna/aetos-build
sudo umount "$BASE/os/output/build/hassio-1.0.0/data" 2>/dev/null || true
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
rm -f "$BASE"/os/output/images/*.img* "$BASE"/os/output/images/rootfs.erofs "$BASE"/os/output/images/data.ext4 2>/dev/null
rm -f "$BASE"/os/output/build/hassio-1.0.0/.stamp_images_installed 2>/dev/null
echo "FULLSTOP $(date '+%H:%M:%S')"
pgrep -f master-build-v72.sh >/dev/null && echo "master STILL alive" || echo "master gone"
sudo podman ps 2>/dev/null | tail -n +2 | wc -l | xargs echo "containers running:"
