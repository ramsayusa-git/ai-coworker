#!/bin/bash
# Aetos One v9.8.8 rpi4 build.
set -e
BASE=/home/krishna/aetos-build
DELIV=/home/krishna/projects/Aetos-build
LOG=$BASE/v988-build.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1
echo "===== v9.8.8 RPI4 BUILD start $(date '+%F %H:%M') ====="

OV=$BASE/os/buildroot-external/rootfs-overlay/usr/sbin
PKG=$BASE/os/buildroot-external/package/hassio
echo "== preflight =="
echo "  update-block immutable: $(grep -c 'chattr +i' $OV/aetos-update-block)"
echo "  port80 loop:           $(grep -c 'while true' $OV/aetos-port80)"
echo "  prewarm removed:       $(grep -ci prewarm $PKG/dind-import-containers.sh) (want 0)"
echo "  data size:             $(grep -o '6144M' $PKG/create-data-partition.sh | head -1)"
echo "  addons installs:       $(grep -c 'addons/.*install' $OV/aetos-addons-firstboot) (want 0)"
echo "  About build str:       $(grep -o '>v9.8.[0-9]<' $BASE/frontend/hass_frontend/frontend_latest/99728.918518a757117288.js | head -1)"

echo "== OOM guard + clean =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
D=$BASE/os/output/build/hassio-1.0.0
[ -d "$D" ] && cp "$PKG/dind-import-containers.sh" "$D/dind-import-containers.sh" || true

echo ""; echo "########## RPI4 $(date '+%H:%M') ##########"
cd "$DELIV"
bash master-build-v72.sh
RPIIMG=$(ls -t "$BASE"/os/output/images/*.img.xz 2>/dev/null | head -1)
[ -n "$RPIIMG" ] && cp "$RPIIMG" "$DELIV/aetos-one-rpi4-build-v9.8.8.img.xz" \
  && echo "  RPI4 OK -> aetos-one-rpi4-build-v9.8.8.img.xz $(du -h "$DELIV/aetos-one-rpi4-build-v9.8.8.img.xz"|cut -f1)" \
  || { echo "  RPI4 FAILED"; exit 1; }

echo ""; echo "===== v9.8.8 RPI4 DONE $(date '+%F %H:%M') ====="
ls -lh "$DELIV"/aetos-one-rpi4-build-v9.8.8.img.xz
