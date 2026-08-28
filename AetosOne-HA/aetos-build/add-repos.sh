#!/bin/sh
CLI="docker exec hassio_cli ha"
for url in \
  https://github.com/homeassistant-apps/repository \
  https://github.com/netbirdio/addon-netbird \
  https://github.com/Ferdinand99/home-assistant-newt-addon \
  https://github.com/homeassistant-ai/ha-mcp ; do
  echo "=== add $url ==="
  $CLI store add "$url" 2>&1 | head -3
done
echo "=== reload store ==="
$CLI store reload 2>&1 | head -3
echo "waiting 20s for clones..."
sleep 20
echo "=== available apps (slug + name + repo) ==="
$CLI store apps 2>&1 | grep -iE "slug|name|repository|cloudflared|netbird|newt|mcp|ssh|configurator|mosquitto|samba" | head -80
