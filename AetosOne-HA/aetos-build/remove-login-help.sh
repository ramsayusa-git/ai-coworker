#!/bin/bash
# Remove the "Help" link (-> home-assistant.io) from the pre-auth LOGIN page.
# The login/authorize page is served before the runtime branding JS loads, so it
# must be patched in the baked frontend. We hide the specific ha-button that
# links to the HA authentication docs, and drop the stale precompressed copies
# so the edited JS is what gets served.
set -e
FE=/home/krishna/aetos-build/frontend/hass_frontend
AUTH=$(ls "$FE"/frontend_latest/authorize.*.js 2>/dev/null | grep -vE "\.map$|\.br$|\.gz$|LICENSE" | head -1)
[ -z "$AUTH" ] && { echo "authorize bundle not found"; exit 1; }
echo "patching: $(basename "$AUTH")"

if ! grep -q 'style="display:none" href="https://www.home-assistant.io/docs/authentication/"' "$AUTH"; then
  sed -i 's#href="https://www.home-assistant.io/docs/authentication/" target="_blank"#style="display:none" href="https://www.home-assistant.io/docs/authentication/" target="_blank"#g' "$AUTH"
fi
rm -f "$AUTH.gz" "$AUTH.br"

echo "login Help hidden count: $(grep -c 'style=\"display:none\" href=\"https://www.home-assistant.io/docs/authentication/\"' "$AUTH")"
