#!/bin/bash
# Clean x86-64 v6 build: wipe the arch-mixed output/ and rebuild fresh for amd64.
# rpi4 v6 image is already in deliverables, so wiping output/ is safe.
set -e
BASE=/home/krishna/aetos-build; OS=$BASE/os; PKG=$OS/buildroot-external/package/hassio

echo "== verify x86 branded core present =="
sudo -n podman images 2>/dev/null | grep -i 'generic-x86-64' | head -1 || echo "  (rebuilding core)"
if [ ! -s "$PKG/aetos-core.tar" ] || ! sudo -n podman images 2>/dev/null | grep -q generic-x86-64; then
  echo "== (re)build branded x86-64 core =="
  CORE=ghcr.io/home-assistant/generic-x86-64-homeassistant:2026.7.2
  CTX=$BASE/brand-core-v6-x86; rm -rf "$CTX"; mkdir -p "$CTX"
  cp -r "$BASE"/frontend/hass_frontend "$CTX"/hass_frontend
  printf 'FROM %s\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' "$CORE" > "$CTX"/Dockerfile
  sudo -n podman build --platform linux/amd64 -t aetos-core:v6-x86 "$CTX" 2>&1 | tail -2
  sudo -n podman tag aetos-core:v6-x86 "$CORE"
  rm -f "$PKG"/aetos-core.tar
  sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar "$CORE"
fi
echo "  core tar: $(du -h "$PKG/aetos-core.tar" | cut -f1)"

echo "== refresh seed =="
tar cf "$PKG/aetos-seed.tar" -C "$BASE/v4-config-seed" .

echo "== make clean (wipe arch-mixed output) $(date '+%H:%M') =="
mkdir -p "$BASE/haos-cache"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  hassos:local make clean 2>&1 | tail -3

echo "== make generic_x86_64 (fresh, no arch mix) $(date '+%H:%M') =="
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT x86 $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v6.img.xz && echo "  -> deliverables" || echo "no img"
echo "== CLEAN-X86-V6 DONE =="
