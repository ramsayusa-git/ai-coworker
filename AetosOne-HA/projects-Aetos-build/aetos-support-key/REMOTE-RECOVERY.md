# Aetos One — Remote Password Recovery (secure)

Baked into every v6 image: the **Aetos support SSH PUBLIC key** (in `root/.ssh/authorized_keys`,
HAOS debug SSH on port **22222**). The matching **PRIVATE key stays with you only** —
`aetos_support_ed25519`. Guard it like a master key; if it leaks, rotate it and rebuild.

## Why this is safe (vs a hardcoded password)
- The image contains only the **public** key. Extracting it from a flashed card gives an
  attacker nothing — you can't log in without the private key, which never ships.
- No shared secret across the fleet → a single compromised device can't expose the others.

## How to recover a locked-out client (remote, no travel)
1. Reach the device over your bundled tunnel (NetBird / Cloudflare) — or its LAN IP if on-site.
2. SSH in as root on port 22222 with your private key:
   ```
   ssh -i aetos_support_ed25519 -p 22222 root@<device-host-or-tunnel>
   ```
3. Reset the forgotten account's password:
   ```
   ha auth reset --username <username> --password <new-password>
   ```
4. Tell the client the new password. Done.

## Notes / to verify on first boot
- HAOS enables the port-22222 SSH when it finds an `authorized_keys`. If the overlay path
  isn't picked up, also place `aetos_support_ed25519.pub` (renamed `authorized_keys`) at the
  ROOT of the boot (CONFIG) partition of the flashed card — that's the canonical HAOS method.
- To rotate: generate a new keypair, replace the baked public key, rebuild. Old key stops working.

## Files
- `aetos_support_ed25519`      → PRIVATE key — KEEP SECRET (you only)
- `aetos_support_ed25519.pub`  → PUBLIC key — baked into image (safe)
