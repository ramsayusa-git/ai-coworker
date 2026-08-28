#!/bin/bash
# Stop dev server, then launch the v4 master build in the background.
pkill -f develop_and_serve 2>/dev/null
pkill -f 'node_modules/.bin/serve' 2>/dev/null
fuser -k 8124/tcp 2>/dev/null
pkill -f 'script/develop' 2>/dev/null
pkill -f 'rspack' 2>/dev/null
sleep 5
echo "dev stopped; port 8124: $(fuser 8124/tcp 2>/dev/null || echo free)"
nohup bash /home/krishna/projects/Aetos-build/master-build-v4.sh > /tmp/build-v4.log 2>&1 &
echo "build-v4 launched PID $!"
