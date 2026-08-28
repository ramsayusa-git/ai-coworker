#!/bin/bash
# Stop dev server, launch v6 build in background.
pkill -9 -f develop_and_serve 2>/dev/null
pkill -9 -f 'gulp develop-app' 2>/dev/null
pkill -9 -f 'gulp build-app' 2>/dev/null
pkill -9 -f 'node_modules/.bin/serve' 2>/dev/null
fuser -k 8124/tcp 2>/dev/null
sleep 5
echo "frontend procs left: $(pgrep -cf 'gulp|node_modules/.bin/serve' 2>/dev/null || echo 0); port 8124: $(fuser 8124/tcp 2>/dev/null || echo free)"
nohup bash /home/krishna/projects/Aetos-build/master-build-v6.sh > /tmp/build-v6.log 2>&1 &
echo "build-v6 PID $!"
