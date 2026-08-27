# AetosOne (Jitsi Meet) — local web dev

The rebranded Jitsi Meet web app is cloned at `jitsi-meet/` (stable tag
`stable/jitsi-meet_11031`) with the AetosOne branding applied to the source.

## Start the dev server

```bash
cd jitsi-meet
./aetos-dev.sh
```

Then open **https://localhost:8080/** (self-signed cert — accept the warning).

Stop it with: `fuser -k 8080/tcp`

## What you'll see
- App name / title: **AetosOne**
- In-call + welcome logo: AetosOne wordmark (`images/watermark.svg`)
- Favicon: AetosOne
- Meetings actually connect, because signaling is proxied to `alpha.jitsi.net`.

## How this machine differs from the Jitsi docs (gotchas already handled)
1. **Node version** — this stable tag requires **Node ≥24 / npm ≥11** (the
   older "Node 20" handbook is out of date). Your system Node 24.18 is used.
2. **`NODE_ENV=production` is set globally** on this box, which makes npm skip
   devDependencies (webpack, esbuild…). `aetos-dev.sh` forces
   `NODE_ENV=development` + `npm ci --include=dev`.
3. **Git-over-SSH deps hang** (`ssh://git@github.com/jitsi/…`). Fixed globally:
   `git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"`.
4. **Android postinstall fails** (`jetify`, `android-autolinking` need the
   Android SDK) — irrelevant for web. `package.json` postinstall was reduced to
   `patch-package --error-on-fail` (patches still apply). Original saved at
   `jitsi-meet/package.json.orig`.
5. **Dev proxy** serves HTML/`config.js` from `alpha.jitsi.net` but serves
   `/images/`, `/css/`, `/libs/` **and now `/interface_config.js`** locally, so
   the AetosOne name + logo render. That local-config bypass was added to
   `webpack.config.js` (`devServerProxyBypass`).

## Branding applied to the source
- `interface_config.js` → APP_NAME/PROVIDER_NAME = AetosOne, DEFAULT_LOGO_URL = watermark.svg, JITSI_WATERMARK_LINK cleared
- `title.html` → title/meta = AetosOne
- `manifest.json` → name/short_name = AetosOne
- `images/watermark.svg`, `images/favicon.ico`, `images/jitsilogo.png`, `images/logo-deep-linking.png` → AetosOne assets
- Originals backed up in `jitsi-meet/_brand-backup/`

## Point signaling at your own server (once Phase 0 is up)
```bash
WEBPACK_DEV_SERVER_PROXY_TARGET=https://meet.aetosone.com ./aetos-dev.sh
```

## Production build (for deploying to your self-hosted server)
```bash
cd jitsi-meet && NODE_ENV=development make   # builds libs/*.min.js
```
Then deploy the repo + `libs/` to the server per `AetosOne-Rebrand-Plan.md`.
