#!/bin/bash
LOG=/home/krishna/projects/Aetos-build/v72-cron-test.log
exec >>"$LOG" 2>&1
echo "=== cron-sudotest FIRED $(date '+%F %H:%M:%S') uid=$(id -u) ==="
grep NoNewPrivs /proc/self/status
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
if sudo -n true 2>/dev/null; then echo "sudo: WORKS"; else echo "sudo: FAILS"; fi
sudo -n /usr/bin/podman version --format '{{.Client.Version}}' 2>&1 | head -1
# one-shot: restore prior crontab (removes this trigger)
crontab /home/krishna/projects/Aetos-build/cron.bak 2>/dev/null || crontab -r 2>/dev/null
echo "=== done, crontab restored ==="
