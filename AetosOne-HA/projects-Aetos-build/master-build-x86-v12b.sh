#!/bin/bash
# Aetos One v12.0.0 — GENERIC x86-64 build
#   pre-flight (re-tar seed) -> [1/3] reuse/build branded frontend ->
#   [1b/3] brand-guard payload into seed (data partition!) ->
#   [2/3] bake branded Core (amd64) + save aetos-core.tar ->
#   [3/3] make generic_x86_64 in the hassos:local privileged builder container.
#
# Carries every gate learned the hard way on rpi4:
#   * fresh-image gate      (a failed make must NOT ship the previous image)
#   * core-tag gate         (must load OUR freshly branded Core, not a stale tar)
#   * stale core tar purge  (buildroot copies it once and never refreshes)
#   * oversized-file guard  (256MB hassos-system0 overflows and make dies)
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os-x86
SEED=$BASE/v4-config-seed; PKG=$OS/buildroot-external/package/hassio
CORE_IMG=ghcr.io/home-assistant/generic-x86-64-homeassistant
CORE_VER=2026.8.1
LOG=$BASE/v12-x86-build.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1
echo "===== v12.0.0 x86-64 BUILD start $(date '+%F %H:%M') ====="

date +%s > "$OS/buildroot-external/rootfs-overlay/usr/share/aetos/build-epoch" 2>/dev/null || true

echo "== pre-flight $(date '+%F %H:%M') =="
tar cf "$PKG/aetos-seed.tar" -C "$SEED" .
echo "  seed $(du -h "$PKG/aetos-seed.tar"|cut -f1)"
echo "  x86 defconfig branded: $(grep -c 'aetosone\|Aetos One' "$OS/buildroot-external/configs/generic_x86_64_defconfig")"

echo "== PURGE stale leftovers (buildroot never deletes removed files) =="
TGT="$OS/output/target"
rm -f "$TGT/usr/sbin/aetos-update-lock" "$TGT/usr/lib/systemd/system/aetos-update-lock."* 2>/dev/null || true
find "$TGT" -path '*.wants*' -iname 'aetos-update-lock*' -delete 2>/dev/null || true
rm -rf "$TGT/usr/share/aetos/hass_frontend.tar.xz" 2>/dev/null || true
BIG=$(find "$TGT/usr/share" -type f -size +5M 2>/dev/null | wc -l)
echo "  oversized files in target/usr/share: $BIG (want 0)"
[ "$BIG" = "0" ] || { echo "  ABORT: oversized file would overflow hassos-system0"; exit 1; }
# stale branded-core tar in the buildroot BUILD dir (shipped v11 frontend inside v12!)
HID="$OS/output/build/hassio-1.0.0/images"
[ -f "$HID/aetos-core.tar" ] && { echo "  purging stale core tar:"; ls -l --time-style=+%F_%H:%M "$HID/aetos-core.tar"; rm -f "$HID/aetos-core.tar"; }
rm -f "$OS/output/build/hassio-1.0.0/.stamp_target_installed" \
      "$OS/output/build/hassio-1.0.0/.stamp_built" \
      "$OS/output/build/hassio-1.0.0/.stamp_images_installed" 2>/dev/null || true
echo "  hassio stamps cleared"

echo "== [1/3] frontend (reuse pre-built if present) $(date '+%H:%M') =="
while pgrep -f 'corepack yarn build|rspack|compressApp|zopfli' >/dev/null; do
  echo "  waiting for in-progress frontend build..."; sleep 15
done
cd "$FE"
if [ ! -d hass_frontend ] || ! grep -rlq "Aetos One Core OS" hass_frontend/frontend_latest/ 2>/dev/null; then
  echo "  building frontend..."
  rm -rf hass_frontend
  MODERN_ONLY=1 NODE_OPTIONS=--max-old-space-size=6144 corepack yarn build 2>&1 | tail -3
fi
test -d hass_frontend || { echo "frontend FAILED"; exit 1; }
echo "  About 2-row: $(grep -rl 'Aetos One Core OS' hass_frontend/frontend_latest/ | wc -l)"
echo "  onboarding restore cards removed: $(grep -rl 'or_restore' hass_frontend/frontend_latest/ | wc -l) (want 0)"

echo "== [1b/3] brand-guard payload -> seed (data partition) $(date '+%H:%M') =="
PAYDIR=$SEED/aetos; mkdir -p "$PAYDIR"; rm -f "$PAYDIR/hass_frontend.tar.xz"
tar -cJf "$PAYDIR/hass_frontend.tar.xz" -C "$FE" hass_frontend
echo "  payload: $(du -h "$PAYDIR/hass_frontend.tar.xz"|cut -f1)"
tar cf "$PKG/aetos-seed.tar" -C "$SEED" .
GUARD_MD5=$(md5sum "$FE/hass_frontend/static/icons/favicon-512x512.png" | cut -d' ' -f1)
sed -i "s/^MARKER_MD5=\".*\"/MARKER_MD5=\"$GUARD_MD5\"/" "$OS/buildroot-external/rootfs-overlay/usr/sbin/aetos-brand-guard"
echo "  guard marker: $GUARD_MD5"

echo "== [2/3] branded Core (amd64) $(date '+%H:%M') =="
CTX=$BASE/brand-core-x86; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM %s:%s\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' "$CORE_IMG" "$CORE_VER" > "$CTX"/Dockerfile
sudo -n podman build --no-cache --platform linux/amd64 -t aetos-core-x86:v12 "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core-x86:v12 "$CORE_IMG:$CORE_VER"
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar "$CORE_IMG:$CORE_VER"
echo "  core tar $(du -h "$PKG"/aetos-core.tar|cut -f1)"

echo "== [3/3] make generic_x86_64 $(date '+%H:%M') =="
STALE_GUARD=$(mktemp); sleep 1
mkdir -p "$BASE/haos-cache"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'

echo "== RESULT $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null || { echo "no img produced"; exit 1; }
FRESH=$(find "$OS"/output/images -maxdepth 1 -name '*.img.xz' -newer "$STALE_GUARD" 2>/dev/null | head -1)
rm -f "$STALE_GUARD"
[ -n "$FRESH" ] || { echo "  !! ABORT: no FRESH image - make must have failed; refusing to ship stale."; exit 1; }
echo "  fresh image confirmed: $(basename "$FRESH")"

LOADED=$(grep -oE "Loaded image: $CORE_IMG:[0-9.]+" "$LOG" | tail -1)
echo "  core loaded into image: ${LOADED:-<none>}"
case "$LOADED" in
  *":$CORE_VER") echo "  core tag OK ($CORE_VER)" ;;
  "")            echo "  !! WARN: could not confirm loaded Core" ;;
  *)             echo "  !! ABORT: WRONG Core loaded (want $CORE_VER): $LOADED"; exit 1 ;;
esac
echo "===== v12.0.0 x86-64 DONE $(date '+%F %H:%M') ====="
echo "V12_X86_BUILD_COMPLETE" > /tmp/v12-x86-build.done
