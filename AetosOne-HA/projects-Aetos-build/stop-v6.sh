#!/bin/bash
pkill -9 -f master-build-v6.sh 2>/dev/null
pkill -9 -f 'gulp build-app' 2>/dev/null
pkill -9 -f 'corepack yarn build' 2>/dev/null
sleep 4
echo "v6 build procs left: $(pgrep -cf 'master-build-v6|gulp build-app' 2>/dev/null || echo 0)"
