#!/bin/bash
# Aetos One v9.8.9 rpi4 build - rebased on Core 2026.8.0 (locked), transparent
# logo, dashboard redirect, add-on install list, immutable update lock.
set -e
BASE=/home/krishna/aetos-build
DELIV=/home/krishna/projects/Aetos-build
LOG=$BASE/v989-build.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1
echo "===== v9.8.9 RPI4 BUILD (Core 2026.8.0) start $(date '+%F %H:%M') ====="

OV=$BASE/os/buildroot-external/rootfs-overlay/usr/sbin
PKG=$BASE/os/buildroot-external/package/hassio
echo "== preflight =="
echo "  core FROM:        $(grep -o 'homeassistant:2026\.[0-9.]*' $DELIV/master-build-v72.sh | head -1)"
echo "  hassio.mk core:   $(grep -o '\"2026\.[0-9.]*\"' $PKG/hassio.mk | head -1)"
echo "  frontend marker:  $(grep -rlq aetos-brand-changed $BASE/frontend/hass_frontend/frontend_latest/ && echo OK || echo MISSING)"
echo "  About build str:  $(grep -o '>v9.8.[0-9]<' $BASE/frontend/hass_frontend/frontend_latest/79088.d4287436eda1cd04.js | head -1)"
echo "  update immutable: $(grep -c 'chattr +i' $OV/aetos-update-block)"
echo "  port80 loop:      $(grep -c 'while true' $OV/aetos-port80)"
echo "  prewarm removed:  $(grep -ci prewarm $PKG/dind-import-containers.sh) (want 0)"
echo "  addon installs:   $(grep -c 'addons/.*/install' $OV/aetos-addons-firstboot) (want 1)"
echo "  addon repos:      $(grep -c github.com $OV/aetos-addons-firstboot)"

echo "== OOM guard + clean =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
D=$BASE/os/output/build/hassio-1.0.0
[ -d "$D" ] && cp "$PKG/dind-import-containers.sh" "$D/dind-import-containers.sh" || true
rm -f "$D/.stamp_images_installed" 2>/dev/null || true

echo ""; echo "########## RPI4 $(date '+%H:%M') ##########"
cd "$DELIV"
bash master-build-v72.sh
RPIIMG=$(ls -t "$BASE"/os/output/images/*.img.xz 2>/dev/null | head -1)
[ -n "$RPIIMG" ] && cp "$RPIIMG" "$DELIV/aetos-one-rpi4-build-v9.8.9.img.xz" \
  && echo "  RPI4 OK -> aetos-one-rpi4-build-v9.8.9.img.xz $(du -h "$DELIV/aetos-one-rpi4-build-v9.8.9.img.xz"|cut -f1)" \
  || { echo "  RPI4 FAILED"; exit 1; }

echo ""; echo "===== v9.8.9 RPI4 DONE $(date '+%F %H:%M') ====="
ls -lh "$DELIV"/aetos-one-rpi4-build-v9.8.9.img.xz
