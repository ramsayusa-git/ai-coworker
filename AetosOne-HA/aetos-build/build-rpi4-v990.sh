#!/bin/bash
# Aetos One v9.9.0 rpi4 (Core 2026.8.0). Full branded build with ALL patches.
set -e
BASE=/home/krishna/aetos-build
DELIV=/home/krishna/projects/Aetos-build
LOG=$BASE/v990-build.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1
echo "===== v9.9.0 RPI4 BUILD start $(date '+%F %H:%M') ====="
OV=$BASE/os/buildroot-external/rootfs-overlay

echo "== preflight =="
echo "  core base:            $(grep -o 'homeassistant:2026\.[0-9.]*' $DELIV/master-build-v72.sh | head -1)"
echo "  addons one-by-one:    $(grep -c 'installing .slug' $OV/usr/sbin/aetos-addons-firstboot)"
echo "  recovery ssh 22222:   $([ -e $OV/usr/sbin/aetos-recovery-ssh ] && echo yes) key=$([ -s $OV/usr/share/aetos/authorized_keys ] && echo baked)"
echo "  DNS block v4+v6:      $(grep -c 'DOMAIN' $OV/usr/sbin/aetos-update-block)"
echo "  HOST blackhole:       $([ -x $OV/usr/sbin/aetos-fw-block ] && echo PRESENT) enabled=$([ -L $OV/usr/lib/systemd/system/multi-user.target.wants/aetos-fw-block.service ] && echo yes)"
echo "  frontend marker:      $(grep -rlq aetos-brand-changed $BASE/frontend/hass_frontend/frontend_latest/ 2>/dev/null && echo OK || echo MISSING)"
echo "  hostname-early:       $([ -e $OV/usr/sbin/aetos-hostname-early ] && echo yes)"

echo "== OOM guard + clean =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
rm -f "$BASE/os/output/build/hassio-1.0.0/.stamp_images_installed" 2>/dev/null || true

echo ""; echo "########## RPI4 $(date '+%H:%M') ##########"
cd "$DELIV"
bash master-build-v72.sh
RPIIMG=$(ls -t "$BASE"/os/output/images/*.img.xz 2>/dev/null | head -1)
[ -n "$RPIIMG" ] && cp "$RPIIMG" "$DELIV/aetos-one-rpi4-build-v9.9.0.img.xz" && echo "  RPI4 OK -> aetos-one-rpi4-build-v9.9.0.img.xz $(du -h "$DELIV/aetos-one-rpi4-build-v9.9.0.img.xz"|cut -f1)" || { echo "  RPI4 FAILED"; exit 1; }

echo "== restore systemd-oomd =="
sudo systemctl unmask systemd-oomd.service systemd-oomd.socket 2>/dev/null || true
sudo systemctl start systemd-oomd.service 2>/dev/null || true
echo ""; echo "===== v9.9.0 RPI4 DONE $(date '+%F %H:%M') ====="
ls -lh "$DELIV"/aetos-one-rpi4-build-v9.9.0.img.xz
