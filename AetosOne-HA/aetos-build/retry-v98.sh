#!/bin/bash
echo "=== kill leftover build procs ==="
pkill -TERM -f "master-build-v72.sh" 2>/dev/null
sleep 2
echo "=== remove leftover podman containers (free memory) ==="
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
echo "=== ensure oomd masked ==="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1
echo "=== drop caches hard ==="
sync
sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1
free -h | head -2
echo "=== relaunch v9.8 ==="
cd /home/krishna/projects/Aetos-build
nohup bash master-build-v72.sh > /home/krishna/aetos-build/v98-rpi4-build.log 2>&1 &
echo "V98 PID $!"
sleep 6
head -10 /home/krishna/aetos-build/v98-rpi4-build.log
