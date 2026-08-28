# Aetos One — Frontend Branding Spec (build checklist)

Standing source of truth for the fork build. Every item is applied by
`apply-branding.sh` (or a patch in `patches/`) so rebuilds stay consistent.
Derived from Ramsay's preview review of the 20260624.5 build.

## Global
- [ ] Product name everywhere = **Aetos One** (never "Home Assistant").
- [ ] Primary logo = **square shield** (`assets/brand-logo.png`), never the wordmark.
- [ ] Default theme colors: navy `#273A80`, accent orange `#E6701C`.
- [ ] **Always restrict updates + NO update notifications**: disable auto-update,
      suppress ALL update badges/notifications and the update UI, hide update entities
      so a core/frontend update can never overwrite the branding or drift the pinned
      version (20260624.5 / core 2026.7.2). Applied on-system + in fork.

## Loading / init screen
- [ ] Fix broken favicon on the loading screen ("Not found favicon in url").
- [ ] Loading spinner logo → Aetos One square shield.

## Onboarding — Welcome
- [ ] Header logo: **centered** and **double size**.
- [ ] Remove the three buttons: "Read our vision", "Join our community", "Download our app".
- [ ] Remove the **Help** link.
- [ ] "Or restore" → rename "Home Assistant Cloud" to **Aetos One Cloud**
      (both the title and the "Restore from your … Cloud backup" text).

## Sidebar
- [ ] Header shows **Aetos One logo (shield) + "Aetos One"** name (currently "Home Assistant").

## Settings (config dashboard)
- [ ] "Home Assistant Cloud" card → **Aetos One Cloud**.
- [ ] "Home Assistant Frontend" (repairs/update card, e.g. Winter mode) → **Aetos One Frontend**.
- [ ] Remove the **Labs** entry ("Preview new features").
- [ ] "Run extra applications next to Aetos One" (Apps) — already renamed, keep.

## About page (Settings → About)
- [ ] Logo → Aetos One square shield.
- [ ] Name "Home Assistant" → **Aetos One**.
- [ ] Installation method "Home Assistant Container" → **Container** (drop "Home Assistant").
- [ ] Remove the **Open Home Foundation** block ("Proud part of …").
- [ ] Remove the entire **Shortcuts / Changelog / …** block.
- [ ] Keep: Core + Frontend version rows.

## Settings page footer (build-v3)
Add a footer at the bottom of Settings (config dashboard, below About), centered + responsive:
- **Line 1:** Aetos One main logo (full `AetosOne_logo_full.png` / wordmark), centered, responsive (max-width, scales on mobile).
- **Line 2:** `Powered by www.aetostechlabs.com  ·  email krishna@aetostechlabs.com  ·  Mobile: +91 9966612678`
  - website → link https://www.aetostechlabs.com
  - email → mailto:krishna@aetostechlabs.com
- Implement in `src/panels/config/dashboard/ha-config-dashboard.ts` (append footer to render); fold into v2-branding patch / new build-v3 patch.

## Bundled Apps (provisioned at deploy, not compiled into the wheel)
- File Editor (core_configurator)
- Advanced SSH & Web Terminal (a0d7b954_ssh — community repo)
- Mosquitto broker (core_mosquitto)
- Samba share (core_samba)
See `deploy/provision-apps.sh`.

## Notes
- Some strings ("Home Assistant Cloud", "Home Assistant Frontend", installation
  method) originate from the BACKEND integration manifests / config, not the
  frontend translations — these are overridden in the frontend display components
  (about + cloud + repairs cards) rather than en.json where needed.
- All edits live in the fork overlay; rebuild produces a new wheel.
