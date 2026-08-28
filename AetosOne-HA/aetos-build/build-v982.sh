#!/bin/bash
# Aetos One v9.8.2 rpi4 build launcher.
# = v9.8.1 (proven port80 fix) + three first-boot robustness fixes:
#   #1 pre-warm Core snapshot in dind (kills ~7min first-boot blank UI)
#   #2 add-on installer: 15min token wait + retry .timer
#   #3 update-block: one-time Supervisor restart to auto-clear update tile
pkill -TERM -f "master-build-v72.sh" 2>/dev/null; sleep 2
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1
free -h | head -2

OV=/home/krishna/aetos-build/os/buildroot-external/rootfs-overlay/usr/sbin
SRC=/home/krishna/aetos-build/os/buildroot-external/package/hassio
D=/home/krishna/aetos-build/os/output/build/hassio-1.0.0

echo "=== preflight: fixes present? ==="
echo "port80 scoped:        $(grep -c '172.16.0.0/12' $OV/aetos-port80)"
echo "installer 15min wait: $(grep -c 'lt 90' $OV/aetos-addons-firstboot)"
echo "installer retry loop: $(grep -c 'round -lt 8' $OV/aetos-addons-firstboot)"
echo "updateblock flush:    $(grep -c 'ONE-TIME flush' $OV/aetos-update-block)"
echo "timer symlink:        $(ls /home/krishna/aetos-build/os/buildroot-external/rootfs-overlay/usr/lib/systemd/system/timers.target.wants/aetos-addons-firstboot.timer >/dev/null 2>&1 && echo yes || echo NO)"
echo "prewarm in SRC:       $(grep -c 'Pre-warming Core' $SRC/dind-import-containers.sh)"
echo "12288M in SRC:        $(grep -c '12288M' $SRC/create-data-partition.sh)"

# CRITICAL: refresh the build-dir copy of dind-import-containers.sh (buildroot's
# local rsync is stamped and won't re-copy; the dind executes THIS copy).
cp "$SRC/dind-import-containers.sh" "$D/dind-import-containers.sh"
echo "prewarm in BUILD-DIR: $(grep -c 'Pre-warming Core' $D/dind-import-containers.sh)"

cd /home/krishna/projects/Aetos-build
nohup bash master-build-v72.sh > /home/krishna/aetos-build/v982-rpi4-build.log 2>&1 &
echo "V982 PID $!"
sleep 6
head -12 /home/krishna/aetos-build/v982-rpi4-build.log
