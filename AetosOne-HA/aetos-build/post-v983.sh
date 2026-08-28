#!/bin/bash
cd /home/krishna/projects/Aetos-build || exit 1
mv aetos-one-rpi4-build-v7.2.img.xz aetos-one-rpi4-build-v9.8.3.img.xz && echo "renamed -> v9.8.3"
[ -f aetos-one-rpi4-build-v7.2.img.xz.preserved ] && cp aetos-one-rpi4-build-v7.2.img.xz.preserved aetos-one-rpi4-build-v7.2.img.xz && echo "restored v7.2"
echo "=== verify v9.8.3 xz ==="
xz -t aetos-one-rpi4-build-v9.8.3.img.xz && echo "XZ-OK v9.8.3" || echo "XZ-FAIL"
sudo systemctl unmask systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1
sudo systemctl start systemd-oomd.service
echo "oomd: $(systemctl is-active systemd-oomd.service)"
ls -lh aetos-one-rpi4-build-v9.8.3.img.xz
