#!/bin/bash
# Aetos One v9.8.6 — build BOTH rpi4 + x86, sequentially.
# Carries all v9.8.5 fixes + baked About-page (no-flash) frontend edit.
set -e
BASE=/home/krishna/aetos-build
DELIV=/home/krishna/projects/Aetos-build
LOG=$BASE/v986-build.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

echo "===== v9.8.6 BUILD BOTH start $(date '+%F %H:%M') ====="

echo "== preflight: baked About fix present in \$FE frontend? =="
FL=$BASE/frontend/hass_frontend/frontend_latest/99728.918518a757117288.js
echo "  About baked (Aetos Tech Labs): $(grep -c 'Aetos Tech Labs' "$FL")  version-list-removed: $([ "$(grep -c installation_method "$FL")" = 0 ] && echo yes || echo NO)"
echo "  reuse marker: $(grep -rlq aetos-brand-changed $BASE/frontend/hass_frontend/frontend_latest/ && echo OK || echo MISSING)"
echo "  brand.js skip-guard: $(grep -c 'indexOf(\"Aetos Tech Labs\")' $BASE/v4-config-seed/www/aetos_brand.js)"

echo "== OOM guard + clean leftover state =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true

# refresh rpi4 build-dir dind-import copy (buildroot won't re-rsync a stamped file)
SRC=$BASE/os/buildroot-external/package/hassio
D=$BASE/os/output/build/hassio-1.0.0
[ -d "$D" ] && cp "$SRC/dind-import-containers.sh" "$D/dind-import-containers.sh" || true

echo ""
echo "########## [A] RPI4 $(date '+%H:%M') ##########"
cd "$DELIV"
bash master-build-v72.sh
RPIIMG=$(ls -t "$BASE"/os/output/images/*.img.xz 2>/dev/null | head -1)
if [ -n "$RPIIMG" ]; then
  cp "$RPIIMG" "$DELIV/aetos-one-rpi4-build-v9.8.6.img.xz"
  echo "  RPI4 OK -> aetos-one-rpi4-build-v9.8.6.img.xz  $(du -h "$DELIV/aetos-one-rpi4-build-v9.8.6.img.xz"|cut -f1)"
else
  echo "  RPI4 FAILED - no image"; exit 1
fi

echo ""
echo "########## [B] X86 $(date '+%H:%M') ##########"
cd "$BASE"
bash build-x86-v982.sh
X86IMG=$(ls -t "$BASE"/os-x86/output/images/*.img.xz 2>/dev/null | head -1)
if [ -n "$X86IMG" ]; then
  cp "$X86IMG" "$DELIV/aetos-one-x86-64-build-v9.8.6.img.xz"
  echo "  X86 OK -> aetos-one-x86-64-build-v9.8.6.img.xz  $(du -h "$DELIV/aetos-one-x86-64-build-v9.8.6.img.xz"|cut -f1)"
else
  echo "  X86 FAILED - no image"; exit 1
fi

echo ""
echo "===== v9.8.6 BUILD BOTH done $(date '+%F %H:%M') ====="
ls -lh "$DELIV"/aetos-one-*-v9.8.6.img.xz
