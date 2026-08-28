#!/bin/bash
# Restart the frontend dev server against lab01 (192.168.20.128, which is UP).
pkill -f develop_and_serve 2>/dev/null
pkill -f 'gulp develop-app' 2>/dev/null
pkill -f 'node_modules/.bin/serve' 2>/dev/null
fuser -k 8124/tcp 2>/dev/null
sleep 5
echo "port 8124: $(fuser 8124/tcp 2>/dev/null || echo free)"
cd /home/krishna/aetos-build/frontend
nohup ./script/develop_and_serve -c http://192.168.20.128:8123 -p 8124 > /tmp/devserver.log 2>&1 &
echo "dev restarting against lab01 (192.168.20.128), PID $!"
