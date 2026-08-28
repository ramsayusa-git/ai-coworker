#!/bin/bash
pkill -TERM -f "master-build-v72.sh" 2>/dev/null; sleep 2
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1
free -h | head -2
echo "=== port80 has scoped rule? ==="
grep -c "172.16.0.0/12" /home/krishna/aetos-build/os/buildroot-external/rootfs-overlay/usr/sbin/aetos-port80
cd /home/krishna/projects/Aetos-build
nohup bash master-build-v72.sh > /home/krishna/aetos-build/v981-rpi4-build.log 2>&1 &
echo "V981 PID $!"
sleep 6
head -10 /home/krishna/aetos-build/v981-rpi4-build.log
