#!/bin/bash
# Aetos One v9.8.17 rpi4 - Core 2026.8.0 locked. FIX: removed server_port:80
# override from seed .storage/http -> HA serves on default 8123 (kills the
# port-80 redirect loop). Access via http://aetosone.local:8123.
set -e
BASE=/home/krishna/aetos-build
DELIV=/home/krishna/projects/Aetos-build
LOG=$BASE/v9817-build.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1
echo "===== v9.8.17 RPI4 BUILD start $(date '+%F %H:%M') ====="

OV=$BASE/os/buildroot-external/rootfs-overlay
echo "== preflight =="
echo "  data partition:  $(grep -o 'truncate --size="[0-9]*M"' /run/media/krishna/data-backup/claude-cowork/AetosOne-HA/aetos-build/os/buildroot-external/package/hassio/create-data-partition.sh|head -1)"
echo "  addons one-by-one:$(grep -c 'installing .slug' /run/media/krishna/data-backup/claude-cowork/AetosOne-HA/aetos-build/os/buildroot-external/rootfs-overlay/usr/sbin/aetos-addons-firstboot)"
echo "  seed server_port removed: $(grep -c server_port $BASE/v4-config-seed/.storage/http) (want 0)"
echo "  About build str:          $(grep -o '>v9.8.[0-9]*<' $BASE/frontend/hass_frontend/frontend_latest/79088.d4287436eda1cd04.js | head -1)"
echo "  port80 service:           $([ -e $OV/usr/lib/systemd/system/aetos-port80.service ] && echo PRESENT-BAD || echo DELETED-good)"
echo "  update immutable:         $(grep -c 'chattr +i' $OV/usr/sbin/aetos-update-block)"
echo "  frontend marker:          $(grep -rlq aetos-brand-changed $BASE/frontend/hass_frontend/frontend_latest/ && echo OK || echo MISSING)"

echo "== OOM guard + clean =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
D=$BASE/os/output/build/hassio-1.0.0
rm -f "$D/.stamp_images_installed" 2>/dev/null || true

echo ""; echo "########## RPI4 $(date '+%H:%M') ##########"
cd "$DELIV"
bash master-build-v72.sh
RPIIMG=$(ls -t "$BASE"/os/output/images/*.img.xz 2>/dev/null | head -1)
[ -n "$RPIIMG" ] && cp "$RPIIMG" "$DELIV/aetos-one-rpi4-build-v9.8.17.img.xz" \
  && echo "  RPI4 OK -> aetos-one-rpi4-build-v9.8.17.img.xz $(du -h "$DELIV/aetos-one-rpi4-build-v9.8.17.img.xz"|cut -f1)" \
  || { echo "  RPI4 FAILED"; exit 1; }

echo "== restore systemd-oomd =="
sudo systemctl unmask systemd-oomd.service systemd-oomd.socket 2>/dev/null || true
sudo systemctl start systemd-oomd.service 2>/dev/null || true

echo ""; echo "===== v9.8.17 RPI4 DONE $(date '+%F %H:%M') ====="
ls -lh "$DELIV"/aetos-one-rpi4-build-v9.8.17.img.xz
