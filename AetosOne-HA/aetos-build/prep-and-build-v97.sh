#!/bin/bash
sync
sudo sysctl -w vm.drop_caches=1 >/dev/null 2>&1
free -h | head -2
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1
cd /home/krishna/projects/Aetos-build
nohup bash master-build-v72.sh > /home/krishna/aetos-build/v97-rpi4-build.log 2>&1 &
echo "V97 PID $!"
sleep 6
head -10 /home/krishna/aetos-build/v97-rpi4-build.log
