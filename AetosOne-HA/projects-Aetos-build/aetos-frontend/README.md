# Aetos One — Home Assistant frontend fork (100% rebrand)

A build pipeline that bakes **Aetos One** branding into the Home Assistant
frontend and produces an installable `hass_frontend` wheel. This is the only
route that rebrands *everything* the web UI renders — the **login page**,
**onboarding**, every "Home Assistant" string, logos, and default colors —
because the branding is compiled into the frontend itself rather than layered on.

Target: HAOS on lab01, HA core 2026.7.2 (frontend built to match).

---

## How it works

1. The GitHub Action checks out `home-assistant/frontend` at a pinned version.
2. `branding/apply-branding.sh` overlays Aetos assets + string/color edits.
3. It builds the frontend and packages a **wheel**
   (`home_assistant_frontend-<ver>-py3-none-any.whl`).
4. You install that wheel into the HA core container (`deploy/deploy-to-haos.sh`),
   overriding the stock frontend, and restart core.
5. A reapply step (see `deploy/reapply-on-update.md`) reinstalls it after HA
   updates, since core updates reset the frontend.

```
aetos-frontend/
├─ branding/
│  ├─ config.env            # version pin, brand name, colors  ← edit this
│  ├─ apply-branding.sh     # overlay applier (icons, strings, logo, theme)
│  ├─ assets/               # Aetos icons (login logo = favicon-192x192.png), wordmark, shield
│  └─ patches/              # optional version-specific source overrides (app logo)
├─ .github/workflows/
│  └─ build-branded-frontend.yml   # CI: build the branded wheel
└─ deploy/
   ├─ deploy-to-haos.sh     # install the wheel into HA core + restart
   └─ reapply-on-update.md  # keep it after HA updates
```

---

## Setup (you handle GitHub)

1. Create a new **private** repo (e.g. `aetos-frontend`) and push this folder to it.
   (You do NOT need to fork the whole 1GB frontend repo — the Action pulls it at build time.)
2. Find the frontend version your HA expects and pin it:
   ```
   sudo docker exec homeassistant python3 -c "import hass_frontend; print(hass_frontend.VERSION)"
   ```
   Put that tag in `branding/config.env` → `FRONTEND_REF` (tags:
   https://github.com/home-assistant/frontend/tags).
3. In the repo: **Actions → Build branded frontend wheel → Run workflow**.
   It builds and attaches the `.whl` as an artifact/release.
4. Deploy to lab01:
   ```
   WHEEL_URL="<release asset url>" ./deploy/deploy-to-haos.sh
   ```
   (Run from the dev-server that can reach lab01, or paste into the SSH add-on.)
5. Set up `deploy/reapply-on-update.md` so it survives updates.

---

## Branding policy (standing rule)

**Always use the SQUARE SHIELD logo** (`branding/assets/brand-logo.png` — the
eagle-in-shield mark) for every brand mark: login, onboarding, sidebar, About,
favicon, and the PWA / home-screen app icon. **Never** use the full "AETOS ONE"
wordmark logo in the UI. The login/onboarding header keeps the square shield at
56x56 (it is `favicon-192x192.png`, which is the shield).

## What this rebrands (that the layered approach couldn't)

- Login page: title, **square shield logo**, **and the "Home Assistant" text** in the auth form.
- Onboarding flow: square shield logo + all text.
- Every in-app product string (settings, About, dialogs) — compiled, not hidden.
- Default theme colors baked in (navy #273A80 / orange #E6701C).

## What it still won't touch
- The **mobile app's** native chrome (app name/icon are set in the app stores).
- The **SSH terminal banner** — that lives in the SSH add-on, handled separately
  (edit `/etc/profile.d/` in the add-on; ask and I'll wire it up).
- Anything outside the frontend (Supervisor, add-on UIs).

## Maintenance reality
You rebuild the wheel each time HA bumps the frontend (roughly monthly). The
overlay is intentionally small (icons + a few sed edits + optional logo patch)
to minimize breakage across versions. When a `sed` target moves, the build warns
rather than fails — you adjust `apply-branding.sh` for that release.

---

## Current status on lab01 (already live, independent of this fork)
- Theme "Aetos One" (default), instance renamed to Aetos One.
- Favicon + login/onboarding **logo** replaced at the frontend icon files, with an
  auto-reapply automation.
- In-app link hiding + About rebrand via `/config/www/aetos/aetos-rebrand.js`.

This fork supersedes those hacks for the parts it covers; you can keep both
during the transition, or retire the JS module once the branded wheel is live.
