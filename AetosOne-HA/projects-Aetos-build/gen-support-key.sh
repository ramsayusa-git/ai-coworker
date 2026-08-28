#!/bin/bash
# Generate the Aetos support SSH keypair. PUBLIC key -> baked into image.
# PRIVATE key -> kept by Aetos ONLY (never ships).
set -e
OUT=/home/krishna/projects/Aetos-build/aetos-support-key
mkdir -p "$OUT"
if [ ! -f "$OUT/aetos_support_ed25519" ]; then
  ssh-keygen -t ed25519 -N "" -C "aetos-support@aetostechlabs.com" -f "$OUT/aetos_support_ed25519" >/dev/null
  echo "keypair generated"
else
  echo "keypair already exists"
fi
echo "=== PUBLIC key (safe to bake into image) ==="
cat "$OUT/aetos_support_ed25519.pub"
echo "=== files ==="
ls -l "$OUT"

# Bake the PUBLIC key into the HAOS image: authorized_keys for the debug SSH (port 22222)
OS=/home/krishna/aetos-build/os
OVL="$OS/buildroot-external/rootfs-overlay"
# HAOS reads authorized_keys placed on the boot (CONFIG) partition / root .ssh.
mkdir -p "$OVL/root/.ssh"
cp "$OUT/aetos_support_ed25519.pub" "$OVL/root/.ssh/authorized_keys"
chmod 600 "$OVL/root/.ssh/authorized_keys" 2>/dev/null || true
echo "=== baked into overlay ==="
ls -l "$OVL/root/.ssh/authorized_keys"
echo "== SUPPORT KEY DONE =="
