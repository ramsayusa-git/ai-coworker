#!/bin/bash
# Kill the hung v4 build and re-run ONLY the image step (core+frontend already built).
echo "== kill hung build =="
pkill -9 -f build-v4-clean.sh 2>/dev/null
pkill -9 -f 'podman run' 2>/dev/null
pkill -9 -f 'make rpi4_64' 2>/dev/null
CID=$(sudo -n podman ps -aq 2>/dev/null)
[ -n "$CID" ] && sudo -n podman rm -f $CID 2>/dev/null
sleep 6
echo "  D-state stuck procs: $(ps -eo stat,args 2>/dev/null | grep -E '^D' | grep -icE 'podman|make|mount' || echo 0)"
echo "  podman containers left: $(sudo -n podman ps -aq 2>/dev/null | wc -l)"

echo "== re-run image step =="
BASE=/home/krishna/aetos-build; OS=$BASE/os; PKG=$OS/buildroot-external/package/hassio
cp "$PKG"/aetos-core.tar "$OS"/output/build/hassio-1.0.0/images/aetos-core.tar 2>/dev/null || true
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed "$OS"/output/images/rootfs.erofs "$OS"/output/images/data.ext4 "$OS"/output/images/*.img*
mkdir -p "$BASE/haos-cache"
cd "$OS"
nohup sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make rpi4_64 > /tmp/build-v4-img.log 2>&1 &
echo "  make relaunched PID $!"
