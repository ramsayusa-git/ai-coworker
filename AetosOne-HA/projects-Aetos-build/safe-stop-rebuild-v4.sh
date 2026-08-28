#!/bin/bash
# Safely stop the current v4 build, then launch the clean rebuild.
echo "== safe stop current build =="
pkill -9 -f master-build-v4.sh 2>/dev/null
pkill -9 -f 'gulp build-app' 2>/dev/null
pkill -9 -f 'corepack yarn build' 2>/dev/null
pkill -9 -f 'gulp develop-app' 2>/dev/null
pkill -9 -f 'node_modules/.bin/serve' 2>/dev/null
pkill -9 -f 'podman build' 2>/dev/null
CID=$(sudo -n podman ps -q --filter ancestor=hassos:local 2>/dev/null)
[ -n "$CID" ] && sudo -n podman rm -f $CID
sleep 5
echo "  frontend build procs remaining: $(pgrep -cf 'gulp build-app|corepack yarn build' 2>/dev/null || echo 0)"
echo "  hassos build container: $(sudo -n podman ps -q --filter ancestor=hassos:local 2>/dev/null | wc -l)"
echo "== launch clean rebuild =="
nohup bash /home/krishna/projects/Aetos-build/build-v4-clean.sh > /tmp/build-v4.log 2>&1 &
echo "  clean build PID $!"
