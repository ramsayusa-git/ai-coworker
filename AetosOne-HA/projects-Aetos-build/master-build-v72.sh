#!/bin/bash
# Aetos One master-build v7.2 (rpi4_64) — RECONSTRUCTED 2026-08-07 (original was
# deleted from projects-Aetos-build during a disk cleanup). Steps:
#   pre-flight (re-tar seed) -> [1/3] reuse/build branded frontend ->
#   [2/3] bake branded Core (arm64) image + save aetos-core.tar ->
#   [3/3] make rpi4_64 in the hassos:local privileged builder container.
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os
SEED=$BASE/v4-config-seed; PKG=$OS/buildroot-external/package/hassio
date +%s > "$OS/buildroot-external/rootfs-overlay/usr/share/aetos/build-epoch" 2>/dev/null || true

echo "== pre-flight $(date '+%F %H:%M') =="
tar cf "$PKG/aetos-seed.tar" -C "$SEED" .
echo "  seed $(du -h "$PKG/aetos-seed.tar"|cut -f1) | cards $(find "$SEED/www/community" -name '*.js' 2>/dev/null|wc -l) | integrations $(ls "$SEED/custom_components" 2>/dev/null|wc -l) | branding pkg $([ -f "$SEED/packages/aetos_branding.yaml" ] && echo yes || echo NO)"
grep -q 'aetos-seed.tar' "$PKG/create-data-partition.sh" 2>/dev/null && echo "  seed-extract OK"
grep -qi 'AETOS ONE' "$OS/buildroot-external/rootfs-overlay/etc/motd" 2>/dev/null && echo "  motd banner OK"
[ -s "$OS/buildroot-external/rootfs-overlay/usr/share/aetos/authorized_keys" ] && echo "  SSH recovery key OK"

echo "== [1/3] frontend (reuse pre-built if present) $(date '+%H:%M') =="
while pgrep -f 'corepack yarn build|rspack|compressApp|zopfli' >/dev/null; do
  echo "  waiting for in-progress frontend build to finish..."; sleep 15
done
cd "$FE"
if [ ! -d hass_frontend ] || ! grep -rlq "Aetos One Core OS" hass_frontend/frontend_latest/ 2>/dev/null; then
  echo "  building frontend..."
  rm -rf hass_frontend
  MODERN_ONLY=1 NODE_OPTIONS=--max-old-space-size=6144 corepack yarn build 2>&1 | tail -3
fi
test -d hass_frontend || { echo "frontend FAILED"; exit 1; }
grep -rlq "ha-config-branding" hass_frontend/frontend_latest/ 2>/dev/null && echo "  branding panel in bundle OK" || echo "  WARN branding panel missing"

echo "== [1b/3] bake branded frontend payload for brand-guard $(date '+%H:%M') =="
# The brand guard restores branding after any HA update. It needs an
# independent copy of hass_frontend OUTSIDE the Core container.
#
# IMPORTANT: this must live on the DATA partition, not the rootfs overlay.
# hassos-system0 is a fixed 256MB read-only partition; a ~68MB payload there
# overflows it and 'make rpi4_64' fails with:
#   "part hassos-system0 size too small for rootfs.erofs"
# The seed tar is extracted to the data partition at first boot, so we ship
# the payload inside the seed instead.
PAYDIR=$SEED/aetos
mkdir -p "$PAYDIR"
rm -f "$PAYDIR/hass_frontend.tar.xz"
tar -cJf "$PAYDIR/hass_frontend.tar.xz" -C "$FE" hass_frontend
echo "  payload: $(du -h "$PAYDIR/hass_frontend.tar.xz" | cut -f1) (-> data partition via seed)"
# re-tar the seed so the payload is actually shipped
tar cf "$PKG/aetos-seed.tar" -C "$SEED" .
echo "  seed re-tarred: $(du -h "$PKG/aetos-seed.tar" | cut -f1)"
GUARD_MD5=$(md5sum "$FE/hass_frontend/static/icons/favicon-512x512.png" 2>/dev/null | cut -d' ' -f1)
echo "  favicon md5 (guard marker): $GUARD_MD5"
# keep the guard's expected md5 in sync with what we actually shipped
sed -i "s/^MARKER_MD5=\".*\"/MARKER_MD5=\"$GUARD_MD5\"/" \
  "$OS/buildroot-external/rootfs-overlay/usr/sbin/aetos-brand-guard" 2>/dev/null
grep -m1 '^MARKER_MD5=' "$OS/buildroot-external/rootfs-overlay/usr/sbin/aetos-brand-guard"

echo "== [2/3] branded core (arm64) $(date '+%H:%M') =="
CTX=$BASE/brand-core-v72; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.8.1\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' > "$CTX"/Dockerfile
sudo -n podman build --no-cache --platform linux/arm64 -t aetos-core:v72 "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v72 ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.8.1
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.8.1
echo "  core tar $(du -h "$PKG"/aetos-core.tar|cut -f1)"

echo "== [3/3] make rpi4_64 $(date '+%H:%M') =="
# Record a marker BEFORE make so we can prove the image is freshly built.
# Without this, a failed 'make' leaves the previous image in place and the
# copy step below silently ships a STALE image while reporting success.
STALE_GUARD=$(mktemp); sleep 1
mkdir -p "$BASE/haos-cache"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'

echo "== RESULT $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null || { echo "no img produced"; exit 1; }

# HARD FRESHNESS GATE: the image must be NEWER than the marker we created
# before make. This is what caught v12.0.0 shipping the v11.0.7 image.
FRESH=$(find "$OS"/output/images -maxdepth 1 -name '*.img.xz' -newer "$STALE_GUARD" 2>/dev/null | head -1)
rm -f "$STALE_GUARD" 2>/dev/null
if [ -z "$FRESH" ]; then
  echo "  !! ABORT: no FRESH image produced - 'make rpi4_64' must have failed."
  echo "  !! The existing .img.xz predates this build; refusing to ship a stale image."
  ls -l --time-style=+%F_%H:%M "$OS"/output/images/*.img.xz 2>/dev/null
  exit 1
fi
echo "  fresh image confirmed: $(basename "$FRESH")"

# CORE TAG GATE: prove the image loaded OUR freshly branded Core, not a stale
# copy from output/build/hassio-1.0.0/images/. Getting this wrong shipped the
# v11.0.1 frontend inside "v12.0.0" (old About page + old logo position).
WANT_CORE="2026.8.1"
LOADED=$(grep -oE 'Loaded image: ghcr\.io/home-assistant/raspberrypi4-64-homeassistant:[0-9.]+' "$LOG" 2>/dev/null | tail -1)
echo "  core loaded into image: ${LOADED:-<none found>}"
case "$LOADED" in
  *":$WANT_CORE") echo "  core tag OK ($WANT_CORE)" ;;
  "")             echo "  !! WARN: could not confirm which Core was loaded" ;;
  *)              echo "  !! ABORT: image loaded the WRONG Core - expected $WANT_CORE"
                  echo "  !! got: $LOADED"
                  echo "  !! a stale aetos-core.tar is in output/build/hassio-1.0.0/images/"
                  exit 1 ;;
esac
echo "== BUILD-V7.2-RPI4 DONE $(date '+%H:%M') =="
