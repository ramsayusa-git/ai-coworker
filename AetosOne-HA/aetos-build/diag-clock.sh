#!/bin/sh
echo "=== host date (WRONG if past) ==="
date
echo "=== supervisor container date ==="
docker exec hassio_supervisor date 2>&1
echo "=== timedatectl ==="
timedatectl 2>&1 | head -12
echo "=== timesyncd service ==="
systemctl status systemd-timesyncd 2>&1 | head -8
echo "=== timesyncd config (NTP servers) ==="
cat /etc/systemd/timesyncd.conf 2>/dev/null | grep -vE "^#|^$"
cat /run/systemd/timesync/* 2>/dev/null | head
echo "=== can host reach an NTP host / is NTP allowed? ==="
nslookup time.cloudflare.com 2>&1 | tail -3
echo "=== ha host info (for context) ==="
docker exec hassio_cli ha host info 2>&1 | grep -iE "timezone|kernel|operating" | head
