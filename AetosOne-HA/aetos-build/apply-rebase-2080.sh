#!/bin/bash
set -e
B=/run/media/krishna/data-backup/claude-cowork/AetosOne-HA/aetos-build
DELIV=/home/krishna/projects/Aetos-build

echo "== swap in 2026.8.0 frontend =="
rm -rf "$B/frontend/hass_frontend.old" 2>/dev/null || true
mv "$B/frontend/hass_frontend" "$B/frontend/hass_frontend.old"
cp -a /tmp/newfe/hass_frontend "$B/frontend/hass_frontend"
echo "  new frontend chunks: $(ls $B/frontend/hass_frontend/frontend_latest/*.js 2>/dev/null | grep -v map | wc -l)"
echo "  marker: $(grep -rlq aetos-brand-changed $B/frontend/hass_frontend/frontend_latest/ && echo present || echo MISSING)"
echo "  transparent favicon: $(python3 -c "from PIL import Image;print(Image.open('$B/frontend/hass_frontend/static/icons/favicon-192x192.png').getpixel((0,0)))")"

echo "== bump version pins 2026.7.2 -> 2026.8.0 =="
sed -i 's/2026\.7\.2/2026.8.0/g' "$DELIV/master-build-v72.sh"
sed -i 's/2026\.7\.2/2026.8.0/g' "$B/os/buildroot-external/package/hassio/hassio.mk"
sed -i 's/2026\.7\.2/2026.8.0/g' "$B/build-x86-v982.sh"
echo "  master-build FROM: $(grep -o 'homeassistant:2026\.[0-9.]*' $DELIV/master-build-v72.sh | head -1)"
echo "  hassio.mk core: $(grep -o '.core = \"2026\.[0-9.]*\"' $B/os/buildroot-external/package/hassio/hassio.mk)"

echo "== bump brand.js (Core 2026.8.0, v9.8.9) =="
BR=$B/v4-config-seed/www/aetos_brand.js
sed -i 's/2026\.7\.2/2026.8.0/g; s/v9\.8\.8/v9.8.9/g' "$BR"
node --check "$BR" && echo "  brand.js OK"

echo "== force fresh core tar (remove stale) =="
rm -f "$B/os/buildroot-external/package/hassio/aetos-core.tar" 2>/dev/null || true
echo "REBASE-APPLY DONE"
