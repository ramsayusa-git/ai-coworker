#!/bin/bash
# Fold private-CA HTTPS (on 8123) into the v3 data-partition build.
set -e
OS=/home/krishna/aetos-build/os
BASE=/home/krishna/aetos-build
CERTS=/home/krishna/projects/Aetos-build/aetos-certs
DP="$OS/buildroot-external/package/hassio/create-data-partition.sh"

echo "== stop current v3 make (re-run data partition with HTTPS) =="
pkill -9 -f "build-v3-osbuild.sh" 2>/dev/null || true
sudo -n podman ps -q 2>/dev/null | xargs -r sudo -n podman rm -f >/dev/null 2>&1 || true
sleep 2

echo "== place certs into os tree =="
mkdir -p "$OS/buildroot-external/package/hassio/aetos-ssl"
cp "$CERTS/aetosone.crt" "$CERTS/aetosone.key" "$OS/buildroot-external/package/hassio/aetos-ssl/"

echo "== seed cert + HA config in create-data-partition.sh =="
if ! grep -q "AETOS ONE HTTPS" "$DP"; then
python3 - "$DP" <<'PY'
import sys
f=sys.argv[1]; s=open(f).read()
anchor='touch "${data_dir}/.docker-use-containerd-snapshotter"'
add=anchor+'''

# AETOS ONE HTTPS: seed private-CA cert + HA config (SSL on 8123)
mkdir -p "${data_dir}/supervisor/ssl" "${data_dir}/supervisor/homeassistant"
cp /build/buildroot-external/package/hassio/aetos-ssl/aetosone.crt "${data_dir}/supervisor/ssl/aetosone.crt"
cp /build/buildroot-external/package/hassio/aetos-ssl/aetosone.key "${data_dir}/supervisor/ssl/aetosone.key"
printf 'default_config:\\nhttp:\\n  ssl_certificate: /ssl/aetosone.crt\\n  ssl_key: /ssl/aetosone.key\\n' > "${data_dir}/supervisor/homeassistant/configuration.yaml"'''
assert anchor in s, "anchor not found"
s=s.replace(anchor, add, 1)
open(f,'w').write(s); print("HTTPS seeding added")
PY
else echo "already seeded"; fi

echo "== rebuild data partition + image (footer core + HTTPS) =="
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed "$OS"/output/images/*.img*
mkdir -p "$BASE/haos-cache"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev \
  -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" \
  hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT (v3 + HTTPS) =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && \
  cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v3.img.xz || echo "no img"
