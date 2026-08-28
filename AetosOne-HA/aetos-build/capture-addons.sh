#!/bin/bash
KEY=/home/krishna/.config/Claude/local-agent-mode-sessions/43aef38f-a653-45f2-bf48-ff361d5b3eae/93d6106c-80d0-412f-b4c0-aba7f0c19f52/local_94a15e27-3238-4a5e-b96e-ee0317f52ecc/outputs/aetos_support_ed25519
SSHOPT="-i $KEY -p 22222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"
OUT=/home/krishna/aetos-build/os/buildroot-external/package/hassio
mkdir -p "$OUT"
IMGS="96282436/aarch64-addon-newt:1.15.0-stable1 ghcr.io/hassio-addons/ssh:24.0.1 ghcr.io/homeassistant-ai/ha-mcp-addon-aarch64:7.14.2 ghcr.io/homeassistant-apps/cloudflared/aarch64:7.0.10 ghcr.io/netbirdio/aarch64-addon-netbird:v0.75.1 homeassistant/aarch64-addon-configurator:6.0.0 homeassistant/aarch64-addon-mosquitto:7.1.0 homeassistant/aarch64-addon-samba:12.9.0"
echo "=== docker save 8 addon images -> addon-images.tar ==="
ssh $SSHOPT root@192.168.20.122 "docker save $IMGS" > "$OUT/addon-images.tar" 2>/dev/null
echo "images tar: $(du -h "$OUT/addon-images.tar" | cut -f1)"
echo "=== tar apps state -> addon-apps.tar ==="
ssh $SSHOPT root@192.168.20.122 "cd /mnt/data/supervisor && tar cf - apps apps.json store.json 2>/dev/null" > "$OUT/addon-apps.tar" 2>/dev/null
echo "apps tar: $(du -h "$OUT/addon-apps.tar" | cut -f1)"
echo "=== DONE $(date +%T) ==="
