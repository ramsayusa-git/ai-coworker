#!/bin/bash
echo "=== stop v9.7.1 build tree ==="
pkill -TERM -P 188764 2>/dev/null
kill -TERM 188764 2>/dev/null
sleep 3
pkill -TERM -f "master-build-v72.sh" 2>/dev/null
sleep 2
sudo pkill -TERM -f "hassos-rpi4" 2>/dev/null
sudo pkill -TERM -f "podman run --rm --privileged" 2>/dev/null
sleep 3
echo "survivors:"; ps aux | grep -iE "master-build|rpi4_64|hassos-rpi4" | grep -v grep | head || echo none
echo "=== drop caches (oomd already masked) ==="
sync; sudo sysctl -w vm.drop_caches=1 >/dev/null 2>&1; free -h | head -2
echo "=== launch v9.7.2 ==="
cd /home/krishna/projects/Aetos-build
nohup bash master-build-v72.sh > /home/krishna/aetos-build/v972-rpi4-build.log 2>&1 &
echo "V972 PID $!"
sleep 6
head -10 /home/krishna/aetos-build/v972-rpi4-build.log
