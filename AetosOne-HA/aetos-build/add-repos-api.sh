#!/bin/sh
T=$(docker exec homeassistant printenv SUPERVISOR_TOKEN 2>/dev/null)
api() { docker exec homeassistant curl -s -H "Authorization: Bearer $T" "$@"; }
for url in \
  https://github.com/homeassistant-apps/repository \
  https://github.com/netbirdio/addon-netbird \
  https://github.com/Ferdinand99/home-assistant-newt-addon \
  https://github.com/homeassistant-ai/ha-mcp ; do
  echo "=== add $url ==="
  api -X POST -H "Content-Type: application/json" -d "{\"repository\":\"$url\"}" http://supervisor/store/repositories 2>&1 | head -c 200
  echo ""
done
echo "=== reload ==="
api -X POST http://supervisor/store/reload 2>&1 | head -c 120; echo ""
sleep 8
echo "=== our target add-ons (slug ↔ name) ==="
api http://supervisor/store/addons 2>&1 | tr ',' '\n' | grep -iE '"slug"|"name"' | grep -iE 'cloudflared|netbird|newt|mcp|"advanced ssh|web terminal|file editor|configurator|mosquitto|samba|ssh' | head -60
