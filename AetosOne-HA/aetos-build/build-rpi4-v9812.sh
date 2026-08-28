#!/bin/bash
# Aetos One v9.8.12 rpi4 - Core 2026.8.0 locked; HA serves on port 80 natively
# (server_port:80); redundant iptables port-80 redirect REMOVED (was looping).
set -e
BASE=/home/krishna/aetos-build
DELIV=/home/krishna/projects/Aetos-build
LOG=$BASE/v9812-build.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1
echo "===== v9.8.12 RPI4 BUILD start $(date '+%F %H:%M') ====="

OV=$BASE/os/buildroot-external/rootfs-overlay
PKG=$BASE/os/buildroot-external/package/hassio
echo "== preflight =="
echo "  core FROM:        $(grep -o 'homeassistant:2026\.[0-9.]*' $DELIV/master-build-v72.sh | head -1)"
echo "  http server_port: $(grep -A1 '^http:' $BASE/v4-config-seed/configuration.yaml | grep -o 'server_port: [0-9]*')"
echo "  port80 service:    $([ -e $OV/usr/lib/systemd/system/aetos-port80.service ] && echo PRESENT-BAD || echo DELETED-good)"
echo "  frontend marker:  $(grep -rlq aetos-brand-changed $BASE/frontend/hass_frontend/frontend_latest/ && echo OK || echo MISSING)"
echo "  About build str:  $(grep -o '>v9.8.[0-9]*<' $BASE/frontend/hass_frontend/frontend_latest/79088.d4287436eda1cd04.js | head -1)"
echo "  update immutable: $(grep -c 'chattr +i' $OV/usr/sbin/aetos-update-block)"
echo "  addon frigate:    $(grep -c '\"frigate\"' $OV/usr/sbin/aetos-addons-firstboot)"

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
[ -n "$RPIIMG" ] && cp "$RPIIMG" "$DELIV/aetos-one-rpi4-build-v9.8.12.img.xz" \
  && echo "  RPI4 OK -> aetos-one-rpi4-build-v9.8.12.img.xz $(du -h "$DELIV/aetos-one-rpi4-build-v9.8.12.img.xz"|cut -f1)" \
  || { echo "  RPI4 FAILED"; exit 1; }
echo ""; echo "===== v9.8.12 RPI4 DONE $(date '+%F %H:%M') ====="
ls -lh "$DELIV"/aetos-one-rpi4-build-v9.8.12.img.xz
