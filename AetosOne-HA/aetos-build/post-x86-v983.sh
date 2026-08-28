#!/bin/bash
cd /home/krishna/projects/Aetos-build || exit 1
mv aetos-one-x86-64-build-v7.2.img.xz aetos-one-x86-64-build-v9.8.3.img.xz && echo "renamed -> x86 v9.8.3"
echo "=== verify x86 v9.8.3 xz ==="
xz -t aetos-one-x86-64-build-v9.8.3.img.xz && echo "XZ-OK x86 v9.8.3" || echo "XZ-FAIL"
sudo systemctl unmask systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1
sudo systemctl start systemd-oomd.service
echo "oomd: $(systemctl is-active systemd-oomd.service)"
ls -lh aetos-one-x86-64-build-v9.8.3.img.xz
