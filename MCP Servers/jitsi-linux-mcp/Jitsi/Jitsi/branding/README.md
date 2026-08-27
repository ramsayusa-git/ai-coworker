# AetosOne branding overlay for Jitsi Meet

Visual-only white-label assets + configs for a self-hosted Jitsi Meet.

## Contents
- `AetosOne-Rebrand-Plan.md` — the full phased plan (read this first).
- `apply-web-branding.sh` — installs the web overlay onto a Debian/Ubuntu Jitsi server (backs up originals, idempotent).
- `web/` — everything for Phase 1 (web):
  - `images/` — AetosOne assets renamed to Jitsi's expected filenames.
  - `interface_config.js` — names, watermark links, promo toggles (stable builds).
  - `config.branding-snippet.js` — branding keys to merge into `<domain>-config.js` (modern builds).
  - `manifest.json` — PWA name / icons / theme color.
- `mobile/ios`, `mobile/android` — placeholders for Phase 2 native assets.

## Quick start (web)
1. Copy this `branding/` folder to your Jitsi server.
2. `sudo ./apply-web-branding.sh`
3. Merge `web/config.branding-snippet.js` into `/etc/jitsi/meet/<domain>-config.js`.
4. Replace "Jitsi Meet" with "AetosOne" in `index.html` `<title>`/meta.
5. `sudo systemctl reload nginx` and hard-refresh.

## Before you ship
- Set the real AetosOne brand hex (placeholder `#0b1f2a` in `manifest.json` + `interface_config.js`).
- Confirm your domain (assumed `meet.aetosone.com`).
