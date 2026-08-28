#!/bin/bash
# Aetos One v9.8.12 x86-64 (generic_x86_64) - Core 2026.8.0 locked.
# Mirrors build-x86-v982.sh, carrying the v9.8.12 tree: HA serves port 80 natively
# (port80 iptables service DELETED), immutable update-lock, transparent logos,
# Cloud+Labs removed, frigate addon list. Rsyncs current os/ -> os-x86 so every
# rpi4 v9.8.12 rootfs-overlay fix is inherited automatically.
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os-x86
SRC=$BASE/os
PKG=$OS/buildroot-external/package/hassio
CORE=ghcr.io/home-assistant/generic-x86-64-homeassistant:2026.8.0
LOG=$BASE/v9812-x86-build.log
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1
echo "===== v9.8.12 X86-64 BUILD start $(date '+%F %H:%M') ====="

echo "== OOM guard + clean leftover state =="
sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1 || true
sudo podman ps -aq 2>/dev/null | while read id; do sudo podman rm -f "$id" 2>/dev/null; done
sudo umount "$OS/output/build/hassio-1.0.0/data" 2>/dev/null || true
sync; sudo sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
sudo sysctl -w vm.dirty_background_bytes=134217728 >/dev/null 2>&1 || true
sudo sysctl -w vm.dirty_bytes=536870912 >/dev/null 2>&1 || true

echo "== [0/5] refresh os-x86 SOURCE from os/ (keep output/, .git excluded) $(date '+%H:%M') =="
rsync -a --delete --exclude 'output/' --exclude '.git/' "$SRC"/ "$OS"/
date +%s > "$OS"/buildroot-external/rootfs-overlay/usr/share/aetos/build-epoch 2>/dev/null || true
# x86 targets SSD/large disk: data partition must fit the 2.7G branded core +
# supervisor + plugins during dind import. rpi4 keeps 6144M (SD); x86 -> 16384M.
sed -i 's/truncate --size="6144M"/truncate --size="16384M"/' \
  "$OS/buildroot-external/package/hassio/create-data-partition.sh"
echo "  x86 data partition: $(grep -o 'truncate --size=\"[0-9]*M\"' "$OS/buildroot-external/package/hassio/create-data-partition.sh" | head -1)"

echo "== preflight: v9.8.12 fixes present in os-x86 SOURCE =="
OV=$OS/buildroot-external/rootfs-overlay/usr/sbin
echo "  port80 service:    $([ -e $OS/buildroot-external/rootfs-overlay/usr/lib/systemd/system/aetos-port80.service ] && echo PRESENT-BAD || echo DELETED-good)"
echo "  update immutable:  $(grep -c 'chattr +i' $OV/aetos-update-block)"
echo "  addon frigate:     $(grep -c '\"frigate\"' $OV/aetos-addons-firstboot)"
echo "  frontend marker:   $(grep -rlq aetos-brand-changed $FE/hass_frontend/frontend_latest/ && echo OK || echo MISSING)"
echo "  About build str:   $(grep -o '>v9.8.[0-9]*<' $FE/hass_frontend/frontend_latest/79088.d4287436eda1cd04.js | head -1)"
echo "  seed http port80:  $(grep -o 'server_port.:80' $BASE/v4-config-seed/.storage/http | head -1)"

echo "== [1/5] x86 branded core (Core 2026.8.0) $(date '+%H:%M') =="
CTX=$BASE/brand-core-v9812-x86; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM %s\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' "$CORE" > "$CTX"/Dockerfile
sudo -n podman build --platform linux/amd64 -t aetos-core:v9812x "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v9812x "$CORE"
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
  rm -f "$BD/.stamp_images_installed"
fi
rm -f "$OS"/output/images/rootfs.erofs "$OS"/output/images/data.ext4 "$OS"/output/images/*.img*

echo "== [4/5] make generic_x86_64 (own cache) $(date '+%H:%M') =="
mkdir -p "$BASE/haos-cache-x86"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache-x86:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make generic_x86_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'

echo "== [5/5] RESULT $(date '+%H:%M') =="
X86IMG=$(ls -t "$OS"/output/images/*.img.xz 2>/dev/null | head -1)
if [ -n "$X86IMG" ]; then
  cp "$X86IMG" /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v9.8.12.img.xz
  echo "  X86 OK -> aetos-one-x86-64-build-v9.8.12.img.xz $(du -h /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v9.8.12.img.xz|cut -f1)"
else
  echo "  X86 FAILED - no img"; RC=1
fi

echo "== restore systemd-oomd =="
sudo systemctl unmask systemd-oomd.service systemd-oomd.socket 2>/dev/null || true
sudo systemctl start systemd-oomd.service 2>/dev/null || true

echo "===== v9.8.12 X86-64 DONE $(date '+%F %H:%M') ====="
ls -lh /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v9.8.12.img.xz 2>/dev/null
exit ${RC:-0}
