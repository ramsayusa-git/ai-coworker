#!/bin/bash
IMG=ghcr.io/home-assistant/aarch64-hassio-cli:5.2.0
for t in 1 2 3 4; do
  if timeout 150 sudo -n podman pull "$IMG" >/tmp/clipull.log 2>&1; then echo "PULLED (try $t)"; break; fi
  echo "try $t failed: $(tail -1 /tmp/clipull.log | cut -c1-70)"; sleep 6
done
sudo -n podman images 2>/dev/null | grep hassio-cli | head -1 || { echo "no image"; exit 1; }
echo "== extract cli.sh + look for banner =="
CID=$(sudo -n podman create "$IMG" 2>/dev/null)
mkdir -p /home/krishna/aetos-build/cli-extract
sudo -n podman cp "$CID:/usr/bin/cli.sh" /home/krishna/aetos-build/cli-extract/cli.sh 2>/dev/null && echo "got cli.sh"
sudo -n podman rm "$CID" >/dev/null 2>&1
echo "== Home Assistant refs in cli.sh =="
grep -niE 'home assistant|homeassistant|banner|figlet|cat.*motd|_' /home/krishna/aetos-build/cli-extract/cli.sh 2>/dev/null | head
echo "== full cli.sh (first 60) =="
sed -n '1,60p' /home/krishna/aetos-build/cli-extract/cli.sh 2>/dev/null
