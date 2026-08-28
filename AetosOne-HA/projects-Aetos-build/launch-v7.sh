#!/bin/bash
# stop dev server, launch v7 rpi4 build
pkill -f develop_and_serve 2>/dev/null
pkill -f 'gulp develop-app' 2>/dev/null
pkill -f 'gulp build-app' 2>/dev/null
pkill -f 'node_modules/.bin/serve' 2>/dev/null
fuser -k 8124/tcp 2>/dev/null
sleep 5
echo "frontend procs: $(pgrep -cf 'gulp|node_modules/.bin/serve' 2>/dev/null || echo 0)"
nohup bash /home/krishna/projects/Aetos-build/master-build-v7.sh > /home/krishna/aetos-build/build-v7.log 2>&1 &
echo "build-v7 PID $!"
