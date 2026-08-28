#!/bin/bash
echo "=== ssh-probe uid=$(id -u) tty=$(tty 2>/dev/null) $(date '+%H:%M:%S') ==="
grep NoNewPrivs /proc/self/status
echo "-- sudo -n true error (if any):"
sudo -n true 2>&1 | head -2
echo "-- sudo -n podman:"
sudo -n /usr/bin/podman version --format '{{.Client.Version}}' 2>&1 | head -2
echo "-- sudoers NOPASSWD entries for this user:"
sudo -n -l 2>&1 | head -8
