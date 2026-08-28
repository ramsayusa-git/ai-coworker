#!/bin/bash
# Aetos One v9.8.7 — build BOTH rpi4 + x86 sequentially.
# = v9.8.6 + REAL update lock: pin Core + OS + Supervisor (was Core-only).
set -e
BASE=/home/krishna/aetos-build
DELIV=/home/krishna/projects/Aetos-build
LOG=$BASE/v987-build.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

echo "===== v9.8.7 BUILD BOTH start $(date '+%F %H:%M') ====="

echo "== preflight =="
UB=$BASE/os/buildroot-external/rootfs-overlay/usr/sbin/aetos-update-block
echo "  update-block pins OS:  $(grep -c hassos_unrestricted $UB)"
echo "  update-block pins SUP: $(grep -c 'cli_ver supervisor' $UB)"
FL=$BASE/frontend/hass_frontend/frontend_latest/99728.918518a757117288.js
echo "  About baked build str: $(grep -o '>v9.8.[0-9]<' $FL | head -1)  version-list-removed: $([ "$(grep -c installation_method $FL)" = 0 ] && echo yes || echo NO)"
echo "  reuse marker: $(grep -rlq aetos-brand-changed $BASE/frontend/hass_frontend/frontend_latest/ && echo OK || echo MISSING)"

echo "== OOM guard + clean =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true

SRC=$BASE/os/buildroot-external/package/hassio
D=$BASE/os/output/build/hassio-1.0.0
[ -d "$D" ] && cp "$SRC/dind-import-containers.sh" "$D/dind-import-containers.sh" || true

echo ""; echo "########## [A] RPI4 $(date '+%H:%M') ##########"
cd "$DELIV"
bash master-build-v72.sh
RPIIMG=$(ls -t "$BASE"/os/output/images/*.img.xz 2>/dev/null | head -1)
[ -n "$RPIIMG" ] && cp "$RPIIMG" "$DELIV/aetos-one-rpi4-build-v9.8.7.img.xz" && echo "  RPI4 OK -> aetos-one-rpi4-build-v9.8.7.img.xz $(du -h "$DELIV/aetos-one-rpi4-build-v9.8.7.img.xz"|cut -f1)" || { echo "  RPI4 FAILED"; exit 1; }

echo ""; echo "########## [B] X86 $(date '+%H:%M') ##########"
cd "$BASE"
bash build-x86-v982.sh
X86IMG=$(ls -t "$BASE"/os-x86/output/images/*.img.xz 2>/dev/null | head -1)
[ -n "$X86IMG" ] && cp "$X86IMG" "$DELIV/aetos-one-x86-64-build-v9.8.7.img.xz" && echo "  X86 OK -> aetos-one-x86-64-build-v9.8.7.img.xz $(du -h "$DELIV/aetos-one-x86-64-build-v9.8.7.img.xz"|cut -f1)" || { echo "  X86 FAILED"; exit 1; }

echo ""; echo "===== v9.8.7 BUILD BOTH done $(date '+%F %H:%M') ====="
ls -lh "$DELIV"/aetos-one-*-v9.8.7.img.xz
