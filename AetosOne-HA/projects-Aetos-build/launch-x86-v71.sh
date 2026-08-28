#!/bin/bash
while pgrep -f 'rsync.*os-x86' >/dev/null; do sleep 15; done
echo "os-x86 rsync done, starting x86 v7.1 build"
nohup bash /home/krishna/projects/Aetos-build/build-x86-v71.sh > /home/krishna/aetos-build/x86-v71.log 2>&1 &
echo "x86 v71 PID $!"
