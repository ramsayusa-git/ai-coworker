#!/bin/bash
# Build the branded Aetos One image for generic x86-64 (hard disk / VM).
# Reuses the build-v2 frontend; fresh os checkout; rootful podman.
set -e
BASE=/home/krishna/aetos-build
BR=/home/krishna/projects/Aetos-build/aetos-frontend/branding
FE=$BASE/frontend
OSX=$BASE/os-x86
CORE=generic-x86-64-homeassistant

echo "== [1/4] x86-64 branded core (reuse frontend) =="
CTX=$BASE/brand-core-x86; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM ghcr.io/home-assistant/%s:2026.7.2\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' "$CORE" > "$CTX"/Dockerfile
sudo -n podman build --platform linux/amd64 -t aetos-core-x86:v2 "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core-x86:v2 ghcr.io/home-assistant/$CORE:2026.7.2

echo "== [2/4] fresh os checkout + place x86 core tar =="
rm -rf "$OSX"
git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/home-assistant/operating-system.git "$OSX" 2>&1 | tail -1
sudo -n podman save --format docker-archive -o "$OSX"/buildroot-external/package/hassio/aetos-core.tar ghcr.io/home-assistant/$CORE:2026.7.2

echo "== [3/4] OS branding + injection + 8G data partition =="
sed -i 's/HAOS_NAME="Home Assistant OS"/HAOS_NAME="Aetos One OS"/' "$OSX"/buildroot-external/meta
DC="$OSX"/buildroot-external/configs/generic_x86_64_defconfig
sed -i 's/BR2_TARGET_GENERIC_HOSTNAME="homeassistant"/BR2_TARGET_GENERIC_HOSTNAME="aetosone"/' "$DC"
sed -i 's/BR2_TARGET_GENERIC_ISSUE=.*/BR2_TARGET_GENERIC_ISSUE="Welcome to Aetos One"/' "$DC"
git -C "$OSX" apply "$BR"/patches/haos-hassio-injection.patch
sed -i 's/truncate --size="1280M"/truncate --size="8192M"/' "$OSX"/buildroot-external/package/hassio/create-data-partition.sh

echo "== [4/4] build generic_x86_64 (rootful + /dev) =="
cd "$OSX"
mkdir -p "$BASE/haos-cache-x86"
sudo -n podman build -t hassos-x86:local . 2>&1 | tail -2
mkdir -p output
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v "$OSX:/build" -v "$BASE/haos-cache-x86:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" \
  hassos-x86:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT (x86-64) =="; ls -lh "$OSX"/output/images/*.img* 2>/dev/null || echo "no img"
# copy to deliverables
cp "$OSX"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v2.img.xz 2>/dev/null || true
