#!/bin/bash
echo "=== kill both master-build wrappers ==="
pkill -TERM -f "master-build-v72.sh" 2>/dev/null
sleep 2
echo "=== stop ALL podman build containers (the make runs inside them) ==="
sudo podman ps --format "{{.ID}} {{.Command}}" 2>/dev/null | grep -iE "make|rpi4|build" | awk '{print $1}' | while read id; do echo "stopping $id"; sudo podman rm -f "$id" 2>/dev/null; done
# also any podman still running
sudo podman ps -q 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sleep 3
echo "=== survivors ==="; ps aux | grep -iE "master-build|make rpi4_64|podman run" | grep -v grep | head || echo none
echo "=== clean drop caches ==="; sync; sudo sysctl -w vm.drop_caches=1 >/dev/null 2>&1; free -h | head -2
echo "=== launch ONE clean v9.7.2 ==="
cd /home/krishna/projects/Aetos-build
nohup bash master-build-v72.sh > /home/krishna/aetos-build/v972-rpi4-build.log 2>&1 &
echo "V972 PID $!"
sleep 8
head -12 /home/krishna/aetos-build/v972-rpi4-build.log
