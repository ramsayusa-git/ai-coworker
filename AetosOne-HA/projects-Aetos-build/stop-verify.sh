#!/bin/bash
echo "=== build procs ==="
pgrep -af 'osbuild|v3fix|make rpi4' | grep -v pgrep || echo "none"
echo "=== hassos build containers ==="
sudo -n podman ps --format '{{.ID}} {{.Image}} {{.Status}}' 2>/dev/null | grep -i hassos || echo "none active"
CID=$(sudo -n podman ps -q --filter ancestor=hassos:local 2>/dev/null)
if [ -n "$CID" ]; then sudo -n podman rm -f $CID && echo "removed $CID"; else echo "nothing to remove"; fi
echo "=== deliverables intact ==="
ls -1 /home/krishna/projects/Aetos-build/*.img.xz 2>/dev/null
