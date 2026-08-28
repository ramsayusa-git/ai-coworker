#!/bin/bash
set -e
DEL=/home/krishna/projects/Aetos-build
BT=/home/krishna/aetos-build
STAGE=$DEL/_backup_stage; rm -rf "$STAGE"; mkdir -p "$STAGE/build-tree"

echo "== stage OS customizations =="
mkdir -p "$STAGE/build-tree/os/buildroot-external/configs" \
         "$STAGE/build-tree/os/buildroot-external/package/hassio/aetos-ssl" \
         "$STAGE/build-tree/os/buildroot-external/rootfs-overlay/etc" \
         "$STAGE/build-tree/os/buildroot-external/rootfs-overlay/usr/sbin" \
         "$STAGE/build-tree/os/buildroot-external/rootfs-overlay/root/.ssh"
cp "$BT/os/buildroot-external/configs/rpi4_64_defconfig" "$BT/os/buildroot-external/configs/generic_x86_64_defconfig" "$STAGE/build-tree/os/buildroot-external/configs/" 2>/dev/null || true
cp "$BT/os/buildroot-external/package/hassio/create-data-partition.sh" "$BT/os/buildroot-external/package/hassio/hassio.mk" "$STAGE/build-tree/os/buildroot-external/package/hassio/" 2>/dev/null || true
cp "$BT"/os/buildroot-external/package/hassio/aetos-ssl/* "$STAGE/build-tree/os/buildroot-external/package/hassio/aetos-ssl/" 2>/dev/null || true
cp "$BT/os/buildroot-external/meta" "$STAGE/build-tree/os/buildroot-external/" 2>/dev/null || true
cp "$BT/os/buildroot-external/rootfs-overlay/etc/motd" "$STAGE/build-tree/os/buildroot-external/rootfs-overlay/etc/" 2>/dev/null || true
cp "$BT/os/buildroot-external/rootfs-overlay/usr/sbin/haos-cli" "$STAGE/build-tree/os/buildroot-external/rootfs-overlay/usr/sbin/" 2>/dev/null || true
cp "$BT/os/buildroot-external/rootfs-overlay/root/.ssh/authorized_keys" "$STAGE/build-tree/os/buildroot-external/rootfs-overlay/root/.ssh/" 2>/dev/null || true

echo "== stage frontend edits =="
mkdir -p "$STAGE/build-tree/frontend/src/layouts" \
         "$STAGE/build-tree/frontend/src/panels/config/dashboard" \
         "$STAGE/build-tree/frontend/src/components" \
         "$STAGE/build-tree/frontend/public/static/icons"
cp "$BT/frontend/src/layouts/home-assistant-main.ts" "$STAGE/build-tree/frontend/src/layouts/" 2>/dev/null || true
cp "$BT/frontend/src/panels/config/dashboard/ha-config-dashboard.ts" "$STAGE/build-tree/frontend/src/panels/config/dashboard/" 2>/dev/null || true
cp "$BT/frontend/src/components/aetos-top-nav.ts" "$STAGE/build-tree/frontend/src/components/" 2>/dev/null || true
cp "$BT"/frontend/public/static/icons/aetos-*.png "$STAGE/build-tree/frontend/public/static/icons/" 2>/dev/null || true

echo "== stage /config seed =="
cp -r "$BT/v4-config-seed" "$STAGE/build-tree/" 2>/dev/null || true

echo "== zip everything (no images) =="
cd "$DEL"
rm -f aetos-one-FULL-backup.zip
zip -rq aetos-one-FULL-backup.zip . \
  -x '*.img.xz' -x '*.zip' -x 'aetos-frontend/.git/*' -x '_backup_stage/*'
cd "$STAGE"; zip -rq "$DEL/aetos-one-FULL-backup.zip" build-tree
rm -rf "$STAGE"
echo "== DONE =="
ls -lh "$DEL/aetos-one-FULL-backup.zip" | awk '{print $5, $9}'
unzip -l "$DEL/aetos-one-FULL-backup.zip" | tail -1
