# AetosOne — Jitsi Meet Rebrand Plan

**Scope:** Visual-only white-label of a self-hosted Jitsi Meet, web first, mobile second.
**Brand:** AetosOne. **Date:** 2026-07-16.

This is a *visual* rebrand: names, logos, watermarks, colors, links, app icons. No feature changes, no protocol changes. White-labeling only works on a **self-hosted** Jitsi — it cannot be done on meet.jit.si.

---

## Phase 0 — Prerequisites (server + accounts)

You need a self-hosted Jitsi stack (Prosody + Jicofo + JVB + jitsi-meet web) on a public domain, e.g. `meet.aetosone.com`, with a TLS cert. Two supported install paths:

- **Debian/Ubuntu package install** — `apt install jitsi-meet`. Simplest; web root is `/usr/share/jitsi-meet`, config in `/etc/jitsi/meet`. The `apply-web-branding.sh` script targets this layout.
- **docker-jitsi-meet** — everything in containers, config via `.env` + `~/.jitsi-meet-cfg`. Cleaner for reproducible/rebuildable branding (mount custom assets as volumes).

Recommendation for a rebrand you'll maintain long-term: **docker-jitsi-meet**, because your branding overlay lives in version control and survives image upgrades without re-patching. If you already have a package install running, we keep it and use the script.

---

## Phase 1 — Web white-label (do this first)

Everything for this phase is already scaffolded in `branding/web/`. Mapping of your AetosOne assets to Jitsi's expected files:

| Jitsi file | Source asset | Purpose |
|---|---|---|
| `images/watermark.svg` | `wordmark.png` (embedded) | In-call top-left logo |
| `images/watermark.png` | `wordmark.png` | Fallback / config logo |
| `images/favicon.ico` | `favicon.ico` | Browser tab icon |
| `images/apple-touch-icon.png` | `apple-180.png` | iOS home-screen icon |
| `images/icon-192/512.png` | `favicon-192/512` | PWA icons |
| `images/maskable-192/512.png` | `maskable-*` | PWA maskable icons |
| `images/logo-deep-linking.png` | `AetosOne_logo_full.png` | Deep-link splash |
| `manifest.json` | (new) | PWA name/icons/theme |
| `interface_config.js` | (new) | Names, watermark links, promo toggles |
| `config.branding-snippet.js` | (new) | Modern branding keys to merge into `<domain>-config.js` |

**Steps**

1. Copy the `branding/` folder to the server.
2. Run `sudo ./apply-web-branding.sh` (backs up originals, installs images + configs).
3. Merge `config.branding-snippet.js` into `/etc/jitsi/meet/<domain>-config.js`.
4. Patch `index.html`: replace the `<title>Jitsi Meet</title>` and `apple-mobile-web-app-title` / OpenGraph meta with **AetosOne**.
5. Colors: override Jitsi CSS variables (brand primary `#0b1f2a` placeholder — set to your real AetosOne hex). Either drop a small `css/custom.css` and include it, or set them via dynamic branding JSON.
6. `sudo systemctl reload nginx`, then hard-refresh.

**What this changes:** tab title, favicon, welcome-page logo, in-call watermark + its link, "add to home screen" name/icon, removal of the Jitsi mobile-app promo interstitial. **What it does not touch:** meeting features, toolbar, security.

> Caveat from Jitsi's own docs: dynamic-branding background images apply to **web** participants and are ignored by the native mobile apps — mobile branding is handled separately in Phase 2.

---

## Phase 2 — Mobile app (after web is live)

**Recommendation: fork the official `jitsi-meet` repo and build the branded React Native apps from it**, rather than embedding the SDK or shipping PWA-only. Reasoning:

- You want a standalone **AetosOne** app in the App Store / Play Store with your own icon, name, and splash — that's the fork path.
- Embedding the Jitsi SDK into a *separate* app only makes sense if you already have an app to put video inside; you don't.
- PWA-only is the fastest option (your icon set already supports it) and is a good **interim** launch, but iOS PWAs have real limitations (background audio, push, camera edge cases) that hurt a video product. Use PWA as a bridge, ship native as the goal.

**Toolchain:** Node 20.x + npm 10.x (other versions cause runtime errors), Xcode for iOS, Android Studio/SDK for Android. Apple Developer account ($99/yr) and Google Play account ($25 one-time).

**Rebrand touchpoints in the fork:**

- App display name + bundle/app IDs — iOS `Info.plist` / Xcode target, Android `app/build.gradle` `applicationId` + `strings.xml`.
- App icons + splash — iOS asset catalog (needs 1024px, you have it), Android mipmaps + adaptive icon (foreground/background), splash screen.
- In-app logo/watermark — the RN app reads its own branding, not `interface_config.js`; set via the app's branding constants.
- Point the app at **your** server (`meet.aetosone.com`) as the default/only domain.
- Deep-link URL scheme + universal links → `aetosone://` and your domain.
- Store listings — name, screenshots, privacy policy URL, description (all AetosOne).

**Interim (optional, this week):** the PWA from Phase 1 is already installable with your icons — you can hand people "add to home screen" immediately while the native build is in review.

---

## Phase 3 — QA & launch

- Web: verify tab/title, welcome logo, in-call watermark + link, PWA install name/icon on iOS + Android, no leftover "Jitsi" strings in visible UI (search `index.html`, lang files if you touch them).
- Mobile: TestFlight (iOS) + internal testing track (Play) before public release.
- Keep `_brand-backup-*` folders until you're confident; the apply script is re-runnable.

---

## Effort estimate

| Phase | Work | Rough time |
|---|---|---|
| 0 | Stand up / confirm self-hosted server | 0.5–2 days |
| 1 | Web white-label (scaffold done) | 0.5–1 day |
| 2 | Fork + branded iOS/Android build + store submission | 1–2 weeks (+ review time) |
| 3 | QA + launch | 2–3 days |

## Open decisions

- Confirm the real **AetosOne brand hex color(s)** — I used `#0b1f2a` as a placeholder in the manifest/config.
- Confirm final domain (`meet.aetosone.com` assumed).
- Package install vs. docker for the server.
- Native app now vs. PWA-first bridge.
