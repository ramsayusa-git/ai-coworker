#!/bin/bash
pkill -9 -f build-v6-x86.sh 2>/dev/null
sleep 2
echo "== test pull generic-x86-64 core =="
for tag in 2026.7.2 2026.7.1 stable; do
  echo "-- trying :$tag --"
  timeout 90 sudo -n podman pull ghcr.io/home-assistant/generic-x86-64-homeassistant:$tag >/tmp/x86pull.log 2>&1 \
    && { echo "  PULLED :$tag OK"; break; } || echo "  failed :$tag ($(tail -1 /tmp/x86pull.log | cut -c1-70))"
done
echo "== local images present? =="
sudo -n podman images 2>/dev/null | grep -iE 'generic-x86-64|homeassistant' | head
