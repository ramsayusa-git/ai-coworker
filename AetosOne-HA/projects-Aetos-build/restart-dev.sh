#!/bin/bash
# Cleanly restart the frontend dev server against wpa01 (192.168.20.127).
FE=/home/krishna/aetos-build/frontend
echo "== kill all frontend dev procs =="
pkill -f develop_and_serve 2>/dev/null
pkill -f 'aetos-build/frontend' 2>/dev/null
pkill -f 'node_modules/.bin/serve' 2>/dev/null
fuser -k 8124/tcp 2>/dev/null
sleep 4
echo "port 8124: $(fuser 8124/tcp 2>/dev/null || echo free)"
echo "== start against wpa01 =="
cd "$FE"
nohup ./script/develop_and_serve -c http://192.168.20.127:8123 -p 8124 > /tmp/devserver.log 2>&1 &
echo "started PID $!"
