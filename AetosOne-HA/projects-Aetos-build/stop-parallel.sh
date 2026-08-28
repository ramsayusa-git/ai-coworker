#!/bin/bash
# Kill x86 build + rsync so the rpi4 build runs alone (stop I/O thrash).
pkill -9 -f launch-x86-v71 2>/dev/null
pkill -9 -f build-x86-v71 2>/dev/null
pkill -9 -f 'rsync.*os-x86' 2>/dev/null
CID=$(sudo -n podman ps -q --filter ancestor=ghcr.io/home-assistant/generic-x86-64-homeassistant:2026.7.2 2>/dev/null)
[ -n "$CID" ] && sudo -n podman rm -f $CID 2>/dev/null
pkill -9 -f 'podman build' 2>/dev/null
rm -rf /home/krishna/aetos-build/os-x86 2>/dev/null
sleep 4
echo "x86/rsync procs left: $(pgrep -cf 'build-x86-v71|launch-x86-v71' 2>/dev/null || echo 0); rsync: $(pgrep -f 'rsync.*os-x86' >/dev/null && echo alive || echo gone)"
echo "rpi4 build running: $(pgrep -f 'make rpi4' >/dev/null && echo YES || echo NO)"
