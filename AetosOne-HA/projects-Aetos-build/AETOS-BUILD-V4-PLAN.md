# Aetos One — build-v4 plan (memory)

Status: **queued, ON HOLD** — awaiting Ramsay's "go" to start.

## Execution queue (dependency-ordered)
- Phase A (frontend source, before FE build): Q1 #28 top-menu+home footer · Q2 #25 Settings footer
- Phase B (OS rootfs/overlay): Q3 #30 motd · Q4 #8 boot-splash · Q5 #35 ssh/terminal banners
- Phase C (/config seed, offline): Q6 #19 add-ons · Q7 #31 HACS · Q8 #32 22 cards · Q9 #33 integrations · Q10 #34 themes
- Phase D (network): Q11 #29 443 proxy
- Phase E (build/flash): Q12 #36 build v4 img · Q13 #37 flash v4
- Phase F (validate/expand): Q14 #23 boot-test · Q15 #21 x86-64 (after RPi4 approved)

## Approved so far

### 1. Top-menu home page (app-shell fork) — task #28
Approved design = the `aetos_one_home_page_topmenu_mockup`.
- Move navigation from HA's **left sidebar** into a **branded navy top menu bar**.
  - Bar: navy `#273A80`, orange `#E6701C` accents.
  - Left: `[A1] Aetos One` logo. Center: Home · Devices · Automations · Energy · History · Settings.
    Right: search, notifications, user avatar.
  - Below: personalized greeting ("Good morning, Ramsay"), room/view tabs, rounded cards.
- **Files to edit (fork):**
  - `src/layouts/home-assistant-main.ts` — render(): drop `<ha-sidebar>`, add a top app-bar
    component; keep `<partial-panel-resolver>` for the content area.
  - `src/components/ha-sidebar.ts` — repurpose items into the top nav, or new `aetos-top-nav.ts`.
- **HARD CONSTRAINT (card compatibility):** only change the navigation **chrome** (layer 1).
  Do NOT touch the Lovelace card engine (`hui-root`, `hui-*-card`). Guarantees:
  - ✅ all native HA cards (entities, glance, thermostat, gauge, history-graph, energy, map…)
  - ✅ YAML-mode dashboards + raw YAML card config
  - ✅ HACS custom cards (Mushroom, button-card, mini-graph-card, ApexCharts, Bubble…)
  - ✅ the visual "Edit dashboard" drag-and-drop editor
  Menu items just point at existing HA panels/dashboards.

### 2. 443 reverse proxy — task #29
Drop the `:8123` so URL = `https://aetosone.local`. NGINX/Caddy on 443 → HA:8123,
reuse the baked `aetosone.local` cert. HA stays on 8123 (Supervisor requirement).

## Carried-in fixes (must be in build-v4)
- [ ] **Footer** (#25) — repackage the CURRENT footer frontend bundle into the core
      (first v3 flash shipped a STALE core built before the footer). Code/bundle/logo ready.
- [ ] **motd / terminal** (#30) — /etc/motd still says "Home Assistant OS"; rebrand to
      "Aetos One OS" + "Aetos One CLI" (overlay + output/target, force rootfs regen).
- [ ] **Bundled apps** (#19) — File Editor, Advanced SSH & Web Terminal (hassio-addons),
      Mosquitto, Samba. SSH/Web Terminal add-on banner rebrand = runtime (part of #30).

## Additional build-v4 requirements (Ramsay's list)

### HACS + custom components (bundle OFFLINE — pre-stage into /config seed at build time)
Approach: download each repo's release at build time, pre-place into the data-partition
/config seed (custom_components/ for integrations+HACS, www/community/ for cards, themes/
for themes) and pre-register Lovelace resources, so they work on first boot with no
internet. Ties into first-boot provision (#19).

**HACS store** (task #31): pre-install `hashassistant-community-store/HACS` (custom_components/hacs).

**Lovelace cards → www/community + resource entries (task #32):**
1. Mushroom (piitaya/lovelace-mushroom)
2. mini-graph-card (kalkih/mini-graph-card)
3. button-card (custom-cards/button-card)
4. Stack In Card (custom-cards/stack-in-card)
5. Decluttering Card (custom-cards/decluttering-card)
6. Vertical Stack In Card (ofekashery/vertical-stack-in-card)
7. Mushroom – Better Sliders (mod)
8. Timer Bar Card (rianadon/timer-bar-card)
9. Power Flow Card Plus (flixlix/power-flow-card-plus)
10. Simple Weather Card (kalkih/simple-weather-card)
11. Clock Weather Card (pkissling/clock-weather-card)
12. Digital Clock
13. Slider Button Card (mattieha/slider-button-card)
14. Tabbed Card
15. Lovelace Banner Card
16. alarmo-card (nielsfaber/alarmo-card)
17. UI Lovelace Minimalist (also a theme/framework)
18. Light Entity Card (ljmerza/light-entity-card)
19. Uptime Card (dylandoamaral/uptime-card)
20. Minimalistic Area Card (junalmeida/minimalistic-area-card)
21. Lovelace Lightning Detector Card
22. Lovelace Entity Progress Card

**Integrations → custom_components (task #33):**
- Alarmo (nielsfaber/alarmo)
- Spook (frenck/spook)
- The Watchman (dummylabs/thewatchman)
- Auto Backup (jcwillox/hass-auto-backup)

**Themes → themes/ (task #34):**
- Mushroom Round theme
- UI Lovelace Minimalist theme

### SSH banner + Web Terminal banner (task #35)
Rebrand the SSH login banner and the Web Terminal add-on banner to Aetos One
(extends OS motd #30). Web Terminal banner is set in the add-on config (runtime),
so depends on bundling the SSH & Web Terminal add-on (#19).

_(exact repo slugs + pinned release tags to be resolved at build time)_

## Carry-over context
- Private-CA HTTPS baked into v3 (on 8123). CA = `aetos-certs/aetos-ca.crt` (install on clients),
  `ca.key` kept OFFLINE. Server cert SAN: `aetosone.local`, `*.aetosone.local`.
- Build method: fork frontend → MODERN_ONLY yarn build → branded core container (local tar,
  offline) → operating-system repo `make rpi4_64` → `.img.xz` → flash `/dev/sdb` (removable USB;
  NEVER `/dev/sda` system SSD).
- Colors: navy `#273A80`, orange `#E6701C`. Logo = square shield (not wordmark) for UI marks.
- Pinned: frontend `20260624.5`, core `2026.7.2`.
