#!/bin/bash
echo "=== syntax check create-data-partition.sh ==="
bash -n /home/krishna/aetos-build/os/buildroot-external/package/hassio/create-data-partition.sh && echo "cdp bash -n OK"
grep -c "addon-images\|addon-apps" /home/krishna/aetos-build/os/buildroot-external/package/hassio/create-data-partition.sh | sed 's/^/addon refs left: /'
echo "=== stop any running build ==="
pkill -TERM -f "master-build-v72.sh" 2>/dev/null
sleep 2
sudo podman ps -q 2>/dev/null | while read id; do echo "rm container $id"; sudo podman rm -f "$id" 2>/dev/null; done
sleep 3
ps aux | grep -iE "master-build|make rpi4_64|podman run" | grep -v grep | head || echo "no survivors"
echo "=== drop caches ==="; sync; sudo sysctl -w vm.drop_caches=1 >/dev/null 2>&1; free -h | head -2
echo "=== launch v9.8 ==="
cd /home/krishna/projects/Aetos-build
nohup bash master-build-v72.sh > /home/krishna/aetos-build/v98-rpi4-build.log 2>&1 &
echo "V98 PID $!"
sleep 8
head -12 /home/krishna/aetos-build/v98-rpi4-build.log
