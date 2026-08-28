#!/bin/bash
# Aetos One v9.8.2 x86-64 (generic_x86_64) build.
# Mirrors build-x86-v72.sh but carries ALL v9.8.x fixes and forces the
# stale-copy / stamp refreshes so nothing is missed on an incremental os-x86 tree.
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os-x86
SRC=$BASE/os
PKG=$OS/buildroot-external/package/hassio
CORE=ghcr.io/home-assistant/generic-x86-64-homeassistant:2026.8.0

echo "== OOM guard + clean leftover state =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sudo umount "$OS/output/build/hassio-1.0.0/data" 2>/dev/null || true
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
sudo sysctl -w vm.dirty_background_bytes=134217728 >/dev/null 2>&1 || true
sudo sysctl -w vm.dirty_bytes=536870912 >/dev/null 2>&1 || true

echo "== [0/5] refresh os-x86 SOURCE from os/ (keep output/, .git excluded) $(date '+%H:%M') =="
rsync -a --delete --exclude 'output/' --exclude '.git/' "$SRC"/ "$OS"/
date +%s > "$OS"/buildroot-external/rootfs-overlay/usr/share/aetos/build-epoch

echo "== preflight: all fixes present in os-x86 SOURCE =="
OV=$OS/buildroot-external/rootfs-overlay/usr/sbin
echo "  port80 scoped:        $(grep -c '172.16.0.0/12' $OV/aetos-port80)"
echo "  installer all-8+retry: $(grep -c 'ge 8' $OV/aetos-addons-firstboot) / $(grep -c 'round -lt 12' $OV/aetos-addons-firstboot)"
echo "  installer repo-in-loop:$(grep -c 'for url in .REPOS' $OV/aetos-addons-firstboot)"
echo "  updateblock flush:     $(grep -c 'ONE-TIME flush' $OV/aetos-update-block)"
echo "  timer symlink:         $(ls $OS/buildroot-external/rootfs-overlay/usr/lib/systemd/system/timers.target.wants/aetos-addons-firstboot.timer >/dev/null 2>&1 && echo yes || echo NO)"
echo "  prewarm in SRC:        $(grep -c 'Pre-warming Core' $PKG/dind-import-containers.sh)"
echo "  12288M in SRC:         $(grep -c '12288M' $PKG/create-data-partition.sh)"

echo "== [1/5] x86 branded core $(date '+%H:%M') =="
CTX=$BASE/brand-core-v982-x86; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM %s\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' "$CORE" > "$CTX"/Dockerfile
sudo -n podman build --platform linux/amd64 -t aetos-core:v982x "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v982x "$CORE"
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar "$CORE"
echo "  core tar $(du -h "$PKG"/aetos-core.tar|cut -f1)"

echo "== [2/5] seed =="
tar cf "$PKG/aetos-seed.tar" -C "$BASE/v4-config-seed" .

echo "== [3/5] FORCE refresh build-dir copies + invalidate image stamps =="
BD=$OS/output/build/hassio-1.0.0
if [ -d "$BD" ]; then
  cp "$PKG/dind-import-containers.sh" "$BD/dind-import-containers.sh"
  mkdir -p "$BD/images"; cp "$PKG/aetos-core.tar" "$BD/images/aetos-core.tar"
  echo "  prewarm in BUILD-DIR: $(grep -c 'Pre-warming Core' $BD/dind-import-containers.sh)"
  rm -f "$BD/.stamp_images_installed"
fi
rm -f "$OS"/output/images/rootfs.erofs "$OS"/output/images/data.ext4 "$OS"/output/images/*.img*

echo "== [4/5] make generic_x86_64 (own cache) $(date '+%H:%M') =="
mkdir -p "$BASE/haos-cache-x86"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache-x86:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'

echo "== [5/5] RESULT $(date '+%H:%M') =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v7.2.img.xz && echo "  -> deliverable(tmp): aetos-one-x86-64-build-v7.2.img.xz" || echo "no img"
echo "== BUILD-X86-V982 DONE $(date '+%H:%M') =="
