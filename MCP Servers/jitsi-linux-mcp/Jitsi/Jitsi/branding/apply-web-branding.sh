#!/usr/bin/env bash
#
# apply-web-branding.sh — apply AetosOne visual rebrand to a self-hosted
# Jitsi Meet server (Debian/Ubuntu package install layout).
#
# Run ON the Jitsi server, as root, from the branding/ directory.
# It BACKS UP originals, then copies AetosOne images + config into place.
# Safe to re-run (idempotent). Nothing here changes features — visual only.
#
set -euo pipefail

JITSI_WEB="/usr/share/jitsi-meet"            # web root
MEET_CFG_DIR="/etc/jitsi/meet"               # <domain>-config.js lives here
STAMP="$(date +%Y%m%d-%H%M%S)"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/web"

echo ">> Jitsi web root: $JITSI_WEB"
[ -d "$JITSI_WEB" ] || { echo "ERROR: $JITSI_WEB not found. Is jitsi-meet installed here?"; exit 1; }

echo ">> Backing up originals to $JITSI_WEB/_brand-backup-$STAMP"
mkdir -p "$JITSI_WEB/_brand-backup-$STAMP/images"
for f in images/watermark.svg images/watermark.png images/favicon.ico interface_config.js; do
  [ -e "$JITSI_WEB/$f" ] && cp -a "$JITSI_WEB/$f" "$JITSI_WEB/_brand-backup-$STAMP/$f" || true
done

echo ">> Copying AetosOne images"
install -m644 "$SRC"/images/* "$JITSI_WEB/images/"

echo ">> Installing interface_config.js overlay"
install -m644 "$SRC/interface_config.js" "$JITSI_WEB/interface_config.js"

echo ">> Installing PWA manifest"
install -m644 "$SRC/manifest.json" "$JITSI_WEB/manifest.json"

echo
echo ">> MANUAL STEPS still required:"
echo "   1. Merge web/config.branding-snippet.js into $MEET_CFG_DIR/*-config.js"
echo "   2. Patch page <title> / apple-mobile-web-app-title in $JITSI_WEB/index.html"
echo "      (search for 'Jitsi Meet' -> 'AetosOne')"
echo "   3. sudo systemctl reload nginx   (or restart your web server)"
echo "   4. Hard-refresh the browser (assets are cache-busted per Jitsi build hash)"
echo
echo ">> Done. Backup at: $JITSI_WEB/_brand-backup-$STAMP"
