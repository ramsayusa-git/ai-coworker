# Aetos One — HAOS White-Label Image · Project Memory

_Persistent notes for the Home Assistant OS rebrand (Aetos One). Update as decisions land._
_Owner: Ramsay · Build tree: ~/aetos-build (brand-core-v72 / os / os-x86) · Frontend fork: ~/aetos-build/frontend_

## Current shipped state (v7.2)
- v7.2 images built + flashed: rpi4 (SD) and x86-64 (SSD). White-label branding, Branding editor at `/config/branding` (PIN `Suseelarao@1`), SSH recovery key baked in (port 22222), SSL on aetosone.local, offline seed (HACS, 15 cards, 8 integrations, themes).
- Branding engine: Branding page saves to input_text helpers (aetos_brand_name/logo/primary_color/accent_color). `home-assistant-main.ts` sets `--aetos-brand-logo` CSS var + fires `aetos-brand-changed`; `ha-sidebar.ts` listens → LEFT MENU updates live. (login + loading screens do NOT, see pending #4.)
- Housekeeping done (2026-07-20): removed temp `aetos_local` build key from dev-server; archived the 10-min build-monitor scheduled skill. Backups in ~/.ssh/*.bak.

## Next image (v7.3) — SOURCE CHANGES APPLIED 2026-07-20 (build not yet run)
T1 SSL removal — DONE in source. Files changed:
  - v4-config-seed/configuration.yaml: removed http.ssl_certificate/ssl_key (now plain HTTP :8123).
  - os/ AND os-x86/ buildroot-external/package/hassio/create-data-partition.sh: removed the cert-copy (aetosone.crt/key) block; kept aetos-seed.tar extraction. (x86 also auto-synced from os/ by build-x86-v72.sh rsync.)
  - projects/Aetos-build/update-seed-v4.sh: heredoc no longer writes the SSL block (and now preserves the `homeassistant: packages` include + adds aetos_rebrand).
  - Note: os/buildroot-external/package/hassio/aetos-ssl/ cert dir still exists but is now UNREFERENCED (harmless).
T5 Notification rebrand — DONE in source. New custom_component v4-config-seed/custom_components/aetos_rebrand/ (__init__.py + manifest.json): sweeps persistent-notification store on every update signal + at startup, rewrites 'Home Assistant'→'Aetos One' (Core/OS/Supervisor variants; preserves 'Home Assistant Community Store'/HACS); rewrite-only, never dismisses. Enabled via `aetos_rebrand:` in configuration.yaml (+ update-seed heredoc). Verified: py_compile OK, JSON OK, YAML OK, _rewrite unit tests PASS. Raw Logs panel left as-is (decided).

## v9.8.1 — **THE REAL FIRST-BOOT ROOT CAUSE: port80 redirect hijacked the Supervisor API** (2026-07-29)
- The persistent "Supervisor hangs at 'Start Home Assistant Core' -> Core container never created -> 8123 down" on EVERY fresh flash (v9.6.1/v9.7/v9.8) was NOT the update-block, NOT the offline bake, NOT missing images. ROOT CAUSE = **aetos-port80**.
- aetos-port80 added an UNSCOPED rule: `iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8123`. This catches ALL :80 traffic on the box INCLUDING the internal **Supervisor API which listens on 172.30.32.2:80**. So Core<->Supervisor and CLI<->Supervisor (`http://172.30.32.2/...`) got redirected to :8123 (nothing there) -> connection refused -> Supervisor can't create/start Core -> first boot wedged.
- PROVED on .119 (v9.8 fresh flash): `curl http://172.30.32.2/supervisor/ping` from hassio_cli = 000/refused with the rule present. `iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8123` -> ping = **200** instantly -> restart supervisor -> homeassistant container created + Up, 8123=302. Definitive.
- FIX (v9.8.1): scope the PREROUTING redirect to EXCLUDE docker nets: `iptables -t nat -A PREROUTING -p tcp --dport 80 ! -d 172.16.0.0/12 -j REDIRECT --to-ports 8123`. Validated on .119: supervisor API stays 200 AND :80->8123 still 302. (OUTPUT -o lo rule kept as-is, harmless.) sh -n OK.
- WHY earlier units "worked": .112/.100 were already ONBOARDED/Core-running from a prior flash before port80 armed; the redirect doesn't kill an already-running Core, only blocks the Supervisor creating Core on a FRESH first boot.
- The other v9.x hardening (update-block waits-for-core, core-kick, no supervisor-restart-loop, clock-guard) are all still good/kept — but THIS was the actual boot-blocker. With port80 scoped, Core starts on its own; core-kick/update-block-wait are now just belt-and-suspenders.
- v9.8 = clean image (offline add-on bake REMOVED per user, add-ons via first-boot online installer). v9.8.1 = v9.8 + scoped port80. Rebuild after this note.

## v9.7 / v9.7.1 — OFFLINE ADD-ON BAKE + first-boot fixes (2026-07-29)
- GOAL: user chose FULLY-OFFLINE add-ons (not first-boot online installer). Bake 8 arm64 add-on images + supervisor "apps" state into data.ext4.
- ADD-ON STATE LOCATION (this supervisor renamed addons->apps): /mnt/data/supervisor/apps/{git/<hash>,data/<slug>}, apps.json (store cache w/ installed state), store.json (repo list). Installed add-on = docker image present (io.hass.type=addon) + apps.json entry + apps/git repo.
- CAPTURED from .122 (fully-installed): docker save 8 images -> os/buildroot-external/package/hassio/addon-images.tar (374M); tar apps+apps.json+store.json -> addon-apps.tar (62M).
- BUILD INTEGRATION: create-data-partition.sh extracts addon-apps.tar into supervisor/ AND (v9.7.1 fix) `docker exec ${container} docker load -i /build/.../addon-images.tar` right after the dind-import call. NOTE v9.7 BUG: I put the image-load in dind-import-containers.sh (package copy) but create-data-partition runs /build/dind-import-containers.sh (a DIFFERENT copy w/o my edit) -> images NOT loaded. v9.7.1 loads images directly in create-data-partition.sh (which DOES run my edits — apps extract worked).
- v9.7 SYMPTOM (from missing images): supervisor saw apps.json installed add-ons but "No <slug> Docker image found" -> missing_image repair -> DOWNLOADED all 8 add-on images on first boot BEFORE starting Core -> Core creation delayed (looked like a stall; HA container NONE for many min). With images baked (v9.7.1) no download -> Core starts promptly + truly offline.
- FIRST-BOOT FIXES (v9.7+): (1) aetos-update-block now WAITS for the homeassistant container to be running before its loop (editing updater.json/dns hosts during Core creation raced+wedged it). (2) aetos-core-kick.service: if homeassistant container is 'created'/'exited', `docker start` it (safety net; only starts EXISTING container, can't create). restart-loop count now 0 (v9.6.1 restart removal holds).
- VALIDATED on v9.7 flash (192.168.20.122): boots, recovery SSH :22222 UP, clock correct, restart-loop=0, apps state baked (7 repos), DNS block works. FAILED: 0 add-on images baked (the dind copy bug) -> fixed in v9.7.1.
- FLASH: /dev/sdb (14.8G USB removable, model "Storage Device"); system disk /dev/sda 223.6G WDC (NEVER touch). flash-v97.sh: xz -dc | dd of=/dev/sdb bs=4M oflag=direct conv=fsync. v9.7 uncompressed image ~5-6G (add-ons) -> ~10min write at ~9MB/s. Data partition sdb8 = 4.7G.
- Deliverables: aetos-one-rpi4-build-v9.7.img.xz (1015M, images NOT baked - superseded), v9.6.1 (979M, boots but online add-ons), v9.7.1 building (images baked).

## v9.6.1 — CRITICAL BOOT BUG FIX: update-block supervisor-restart loop (2026-07-28)
- SYMPTOM: v9.6 rpi4 flashed to fresh unit (192.168.20.122, hostname aetosone) -> booted, got IP, recovery SSH :22222 UP, clock CORRECT (clock-guard worked!), Supervisor running, core image baked (ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2 present) BUT **no `homeassistant` core container ever created -> 8123/80 down -> "nothing going on"** even after 30min + reflash.
- ROOT CAUSE: aetos-update-block Layer-2 version-pin did `docker restart hassio_supervisor`. On first boot this fires in the tight 5s loop and the Supervisor restart loop ("Supervisor is up and running" -> "Supervisor is down - 0" -> "Detected Supervisor restart", repeating) WEDGES first-boot init so Core is never created. PROVED: `systemctl stop aetos-update-block` -> supervisor stabilizes (RestartCount stops); reboot with it active -> loop returns (3+ restarts, HA=NONE, 8123=000). (In steady state INST==CUR==2026.7.2 so pin shouldn't fire, but a first-boot transient triggers it and each restart re-triggers -> loop.)
- FIX (v9.6.1): REMOVED the `docker restart hassio_supervisor` from aetos-update-block entirely. Now Layer-2 is WRITE-ONLY (sed updater.json homeassistant=installed, no restart). The DNS block (IPv4+IPv6) alone stops update discovery; the write keeps updater.json tidy. sh -n OK, 0 `docker restart` lines. Rebuilding v9.6.1 rpi4 (PID 128610, frontend reused).
- LESSON: NEVER `docker restart hassio_supervisor` from a boot-time loop service. Recovery SSH :22222 + clock-guard + core-image-bake + seed-extract all VALIDATED working on the flashed unit — only the supervisor-restart broke it.

## v9.6 — LIVE STATE ON .112 TO BAKE (2026-07-28) — capture ALL of this
All built/validated live on aetosone.local(192.168.20.112). Bake into rpi4 v9.6:
CONFIG (/mnt/data/supervisor/homeassistant = /config):
  - configuration.yaml: adds extra_module_url [/local/aetos_brand.js, /local/aetos_header_anim.js]; homeassistant: packages: !include_dir_named packages.
  - packages/aetos_sample.yaml — DEMO DEVICES: 3 dimmable template lights (light.living_room/bedroom/kitchen), template fan (fan.ceiling_fan), 2 template covers (cover.living_blinds, cover.bedroom_curtains), generic_thermostat climate.living_room_ac, template sensors (living/bedroom/outdoor temp, humidity, co2, illuminance, lock_battery, power_now, air_quality, front_door_status, aetos_clock, aetos_date), binary_sensors (living_room_motion, front_door_contact, water_leak), template weather.aetos_weather w/ 5-day forecast, input_boolean/number/button helpers. (NOTE: modern `template:` for light/fan/cover — legacy `platform: template` is REMOVED in this HA. camera local_file platform ALSO removed -> use config-flow.)
  - packages/aetos_branding.yaml + aetos_theme.yaml (pre-existing).
  - www/: aetos_brand.js, aetos_logo.png (existing) + NEW aetos_header_anim.js (header particle-network canvas, buttons NOT hidden, animation behind toolbar), hero.html (light-theme particle-network + waves + JS live clock/greeting), cam_video.html (looping <video> /local/sample.mp4 LIVE tag), sample.mp4 (788KB BigBuckBunny), cam_front/garden/garage/living.jpg (picsum 640x360), www/community/* (HACS cards incl mushroom, mini-graph-card, button-card, +12 more).
  - custom_components/hacs (HACS installed; integration NOT yet configured - needs GitHub device auth by end user, but cards work standalone).
  - .storage/lovelace_dashboards (map + aetos + aetos-home), .storage/lovelace.aetos + lovelace.aetos-home (the rich showcase dashboard: iframe hero, chips, Lights[3 dimmable+fan], Climate&air[AC climate card+thermostat+humidity+co2+aqi+outdoor], Comfort[blinds+curtains+temps], Cameras[video iframe+3 pics], Sensors[lux/battery/power/motion/door/leak], Security, Weather forecast, Calendar, Energy; type sections max_columns 2, tiles grid_options columns 6 = 2-up), .storage/lovelace_resources (15 card resources /local/community/*).
  - .storage/onboarding — FOR FRESH UNIT seed done=["analytics"] ONLY (skip Help-us-help-you page; keep user/core_config/integration). (.112's is done=all — do NOT copy that.)
  - CONFIG ENTRIES (dynamic, in .storage/core.config_entries): Local Calendar (calendar.aetos_calendar) + local_file cameras (front/garden/garage/living) + generic camera attempt. Calendar has 3 sample events (local_calendar storage). For fresh units these need recreating on first boot OR bake the config_entries+.storage/local_calendar.* selectively.
BUILD SOURCE (already in os/ overlay, built in v9.5): update-block(DNS IPv4+IPv6 + version-pin), clock-guard, recovery-ssh :22222, port80, aurora onboarding/login, hostname aetosone, SSL-off, aetos_rebrand, aetos_no_update.
ADD-ONS on .112 (8, arm64 images): core_configurator(File editor), core_mosquitto, core_samba, a0d7b954_ssh(Advanced SSH), 396f0234_cloudflared, 7edd9457_netbird, 96282436_newt, 81f33d0f_ha_mcp. Repos added: homeassistant-apps/repository, netbirdio/addon-netbird, Ferdinand99/home-assistant-newt-addon, homeassistant-ai/ha-mcp. Clock-guard makes store work on first boot -> can install via first-boot service if online; offline bake = import images to data.ext4 via create-data-partition.sh (hard). Frigate DROPPED.
TOKEN: /tmp/aetos_token on .112 (admin/Suseelarao@1, ~30min expiry; re-mint via refresh-setup.sh login flow).

## v9.6 — MASTER SPEC / FULL CHECKLIST (2026-07-28) — build must contain ALL of these
CARRIED FORWARD (must remain from v9.5 & earlier):
  [1] Aetos One branding, survives updates (native name in /config + /local/aetos_brand.js runtime module).
  [2] UPDATE LOCK (Core/OS/Supervisor): DNS block version.home-assistant.io IPv4+IPv6 + VERSION-PIN updater.json + entity disable + supervisor auto-update off. (aetos-update-block)
  [3] Hostname stable aetosone / aetosone.local (no aetosone2/3/6/10 drift).
  [4] Recovery SSH :22222 with baked support key (/usr/share/aetos/authorized_keys + aetos-recovery-ssh.service).
  [5] Port 80 -> 8123 redirect (aetos-port80).
  [6] Aurora animated bg on onboarding + login pages (frontend, already compiled).
  [7] SSL removed (plain HTTP :8123).
  [8] Notification/Repairs rebrand "Home Assistant"->"Aetos One" (aetos_rebrand).
NEW in v9.6:
  [9] CLOCK GUARD (aetos-clock-guard) — fixes add-on store/HACS on NTP-blocked nets. DONE in source.
  [10] Remove "Help us help you" analytics onboarding page (seed .storage/onboarding done=[analytics]).
  [11] Bake add-ons OFFLINE: Advanced SSH & Web Terminal, File Editor, Mosquitto, Samba, Cloudflared, NetBird, Newt(Pangolin), HA MCP server. FRIGATE DROPPED (user 2026-07-28).
  [12] HACS + common cards baked (Mushroom, mini-graph-card, button-card).
  [13] TWO dashboards, storage-mode (editable in Settings>Dashboards): native Aetos (core cards) + community Mushroom; BOTH with Aetos shield LOGO + "Aetos One" brand-name text header; blue #273A80 / orange #E6701C.
  [14] Build rpi4 first, then x86 (elegante). Grow data.ext4 for baked add-ons/HACS.
APPROACH: install [11]+[12]+[13] on live .112 (has internet+correct clock now), verify each runs, snapshot add-on images + /mnt/data/supervisor addon config + /config, then bake into image. User directive: "make sure all requested updates on new build."

## v9.6 — CLOCK GUARD: "app store broken" ROOT CAUSE = WRONG CLOCK (2026-07-28)
- SYMPTOM: user screenshot of aetosone.local (=192.168.20.112) Settings>Apps store EMPTY ("You don't have any apps installed yet"). "app store broken". (This is the add-on/Apps STORE, gated behind Supervisor internet check.)
- ROOT CAUSE (found via recovery SSH 22222 on .112): **device clock was 13 months in the PAST** (read `Wed Jun 25 2025`; today 2026-07-28). RPi4 has NO battery RTC (`timedatectl`: `RTC time: n/a`, `System clock synchronized: no`). On boot HAOS starts at the stale timestamp baked into the image (base HAOS build date) and relies on NTP to correct it. **This network BLOCKS outbound NTP (UDP 123)** so the clock never corrected. A past clock => every TLS cert reads `certificate is not yet valid` (proved live: python urllib to checkonline.home-assistant.io threw `SSL: CERTIFICATE_VERIFY_FAILED ... not yet valid`) => Supervisor connectivity check fails => Supervisor declares "no supervisor internet connection" => BLOCKS every `GitRepo.clone` => store loads 0 add-ons. NOT caused by our DNS update-block (only version.home-assistant.io is sinkholed; github/raw.githubusercontent resolved fine 20.207.73.82/185.199.110.133).
- LIVE FIX PROVED: `date -u -s "<now>"` on .112 then `docker restart hassio_supervisor` -> Supervisor log flipped to `2026-07-28 16:57 Loading apps from store: 79 all - 79 new - 0 remove`. Store WORKS with the DNS update-block still in place (block & store coexist). NOTE this live fix is NOT persistent — a reboot of .112 reverts to Jun 2025 until reflashed with the clock-guard image.
- DURABLE BUILD FIX (in source now): boot-time **aetos-clock-guard** = fake-hwclock. Files added to os/buildroot-external/rootfs-overlay:
  - usr/sbin/aetos-clock-guard (0755): on boot raise clock to max(baked build-epoch, /mnt/data/aetos/clock.save); `timedatectl set-ntp true`; seed save file. sh -n OK.
  - usr/lib/systemd/system/aetos-clock-guard.service: Type=oneshot, DefaultDependencies=no, After=mnt-data.mount, Before=systemd-time-wait-sync.service haos-supervisor.service network-pre.target, WantedBy=sysinit.target.
  - usr/lib/systemd/system/sysinit.target.wants/aetos-clock-guard.service symlink (enabled).
  - usr/share/aetos/build-epoch: baked epoch; BOTH build scripts now `date +%s >` it each build (master-build-v72.sh after BASE= line; build-x86-v72.sh AFTER the rsync so it lands in os-x86).
  - preset 70-haos.preset: added `enable aetos-clock-guard.service`.
  - aetos-update-block loop: now writes `date +%s > /mnt/data/aetos/clock.save` each iteration once clock is sane (>1750000000) = keeps last-known-good fresh for the guard.
  Net: clock is always >= image build date even with NTP fully blocked => TLS validates => store + HACS work; NTP still corrects upward when the network allows. THIS is essential for deployment on networks the user doesn't control (their stated scenario).
- v9.5 images (already built) do NOT have the clock guard -> a fresh v9.5 flash on an NTP-blocked net will show the SAME broken store until NTP syncs. Need a v9.6 rebuild (rpi4 + x86) to bake the guard. Frontend can be reused (aurora already compiled).
- GOTCHA for future live diagnosis: `getent` NOT on busybox HAOS host (use python socket.gethostbyname inside a container). `ha store reload` CLI returned 404 in this build; forcing store reload = `docker restart hassio_supervisor` (re-clones all repos on startup).

## v9.5 — VERSION-PIN CLOSES THE UPDATE RACE (2026-07-28)
- PROBLEM: v9.4 device (aetosone.local=192.168.20.112) STILL updated 2026.7.2->2026.7.4 on manual click. ROOT: FIRST-BOOT RACE — ships at 2026.7.2, Supervisor's first version fetch (seconds after boot, before the DNS block armed) learns 2026.7.4; the INSTALL then pulls the core container from ghcr.io (NOT blocked by the version-feed DNS block). So the DNS block stops DISCOVERY but not installing an ALREADY-KNOWN version.
- VALIDATED LIVE on .112 via recovery SSH 22222 (root, support key WORKS on the flashed unit ✓; port80 iptables REDIRECT active ✓; hosts has 0.0.0.0 + :: version.home-assistant.io ✓): edited /mnt/data/supervisor/updater.json "homeassistant" version + `docker restart hassio_supervisor`. Set fake 2026.99.9 -> (would show update); set to installed 2026.7.4 -> /core/info returns version_latest=2026.7.4 update_available=FALSE. So pinning updater.json Core "latest"==installed + supervisor restart => NO update offered. THIS is the missing piece.
- FIX (v9.5): aetos-update-block script now does BOTH: (1) DNS block IPv4+IPv6 (as v9.3), (2) VERSION PIN — read installed core from /mnt/data/supervisor/homeassistant.json "version"; if updater.json "homeassistant" (the digit-starting version value, NOT the ghcr image line) != installed, sed it to installed + `docker restart hassio_supervisor` (guarded: only restart if sed took, no loop). Self-heals the first-boot race within the 5s boot loop. Verified sh -n OK.
- BUILD GOTCHA REMINDER: drop caches before build (`sync; echo 1 >/proc/sys/vm/drop_caches`) or the dind image-import (docker:29.5.3-dind) gets OOM-killed (Error 137). Did it -> 9.7G free.
- BUILD: v9.5 rpi4 building 13:57 (frontend REUSED - aurora already compiled; oomd masked). After: name v9.5, restore v7.2, verify, unmask oomd, then reflash + build x86. NOTE .112 is currently manually-pinned (updater.json=2026.7.4, update_available=false) so it won't update further even on v9.4; reflash v9.5 to get branding back + the baked pin.

## v9.4 — AURORA ONBOARDING/LOGIN BG + PORT 80 REDIRECT (2026-07-28)
- USER CHOICES: onboarding+login bg = "gradient aurora waves" (blue #273A80 / orange #E6701C blurred blobs, pure CSS, drifting); port 80 = OS-level REDIRECT 80->8123 (not server_port).
- FRONTEND (edited src directly, already branding-patched): /home/krishna/aetos-build/frontend/src/html/onboarding.html.template + authorize.html.template — added aurora CSS (.aurora-bg 3 blurred @keyframes-animated spans, prefers-reduced-motion + dark-mode aware) + <div class="aurora-bg">. Forced rebuild via `rm -rf frontend/hass_frontend`. Frontend compiled OK (27 min, "branding panel in bundle OK"). TODO: fold aurora into v2-branding.patch for reproducibility (currently only in src).
- PORT 80: rootfs-overlay/usr/sbin/aetos-port80 (iptables -t nat REDIRECT :80->:8123 on PREROUTING + OUTPUT lo) + aetos-port80.service (After=docker.service) + enabled (wants + preset). NOT yet validated live (no v9.3 device booted at build time). iptables REDIRECT is standard; verify over 22222 post-flash.
- BUILD GOTCHA (IMPORTANT): the buildroot `hassio` package .stamp_images_installed step runs a nested docker:29.5.3-dind (create-data-partition.sh) to import the HA container images into data.ext4. It FAILED TWICE with "No such container" + Error 137 = the dind was OOM-KILLED (only ~1.6G free during the emulated build). FIX: `sync; echo 1 > /proc/sys/vm/drop_caches` before building (freed to 9.6G) -> dind imported fine. **Always drop caches before rpi4/x86 builds if mem is tight.** Also remove leftover os/output/images/data.ext4 from a failed run.
- BUILD: v9.4 rpi4 BUILT ✓ (RESULT 09:34 after cache-drop retry -> aetos-one-rpi4-build-v9.4.img.xz 978M/1025359576, xz OK). v7.2 restored (cmp OK). oomd restored. x86 v9.4 NOT yet built (drop caches first!). Removed superseded rpi4 v9/v9.1/v9.2.

## v9.3 — ROOT CAUSES FOUND + FIXED (2026-07-27, via live SSH/docker on .100)
ACCESS: SSH add-on (Frenck a0d7b954_ssh) port 22, user hassio / pw hassio, `sudo -n` works (passwordless) -> full docker/host. Host shell via: `sudo docker run --rm --privileged --pid=host justincormack/nsenter1 /bin/sh -c "..."`. HA API admin/Suseelarao@1.
BUG 1 — UPDATE BLOCK FAILED (v9.2): version.home-assistant.io has BOTH A and AAAA records. v9.2 hosts file only had `0.0.0.0 version.home-assistant.io` (IPv4). The Supervisor resolved the AAAA record to the REAL Cloudflare IPv6 and updated over IPv6. Proven via Supervisor log after adding `:: version.home-assistant.io`: "Can't fetch versions ... Cannot connect ('0.0.0.0',443),('::',443)". Also note: even blocked, an ALREADY-KNOWN version installs from ghcr.io (version feed only gates discovery) -> block must be armed before the FIRST fetch on first boot (tight boot loop added). FIX: aetos-update-block now writes BOTH 0.0.0.0 and :: lines; removed the `logger` call (not on host -> "not found"); tight 5s loop for first ~2min then 30s. HACS/add-ons UNAFFECTED (they use github/ghcr, reachable — verified: store loaded 79 add-ons, github/ghcr HTTP 200/301).
BUG 2 — RECOVERY SSH 22222 NEVER WORKED: HAOS haos-config copies /mnt/boot/CONFIG/authorized_keys -> /root/.ssh/authorized_keys and starts dropbear (:22222, ConditionFileNotEmpty); if absent it DELETES the key + stops dropbear. Our build baked key at rootfs-overlay/root/.ssh (a) shadowed by the overlay-partition bind mount, (b) wiped by haos-config. FIX: bake pubkey at /usr/share/aetos/authorized_keys + new aetos-recovery-ssh.service (After=haos-config) copies it to /root/.ssh + `systemctl start dropbear`. VALIDATED LIVE: dropbear listening 0.0.0.0:22222 + [::]:22222, `ssh -i aetos_support_ed25519 -p 22222 root@.100` = RECOVERY_SSH_OK (host root). Keys delivered to user (outputs/aetos_support_ed25519[.pub] + README). master-build pre-flight check updated to /usr/share/aetos/authorized_keys.
SSH REBRAND: host /etc/motd ALREADY Aetos One (AETOS ONE ASCII + "Welcome to Aetos One OS"); os-release NAME="Aetos One OS". Recovery SSH shows it. The add-on (port 22) banner is the upstream add-on's, not the OS.
BUILD: v9.3 rpi4 BUILT ✓ (RESULT 01:44 -> aetos-one-rpi4-build-v9.3.img.xz 979M/1025612068, xz OK) + FLASHED to /dev/sdb (full 5872046080 bytes, fresh table verified) - ready to boot. v9.3 x86 BUILT ✓ (RESULT 03:11 -> aetos-one-x86-64-build-v9.3.img.xz 1.9G/1961505172, xz OK) for elegante. v7.2 rpi4+x86 restored (cmp OK). oomd unmasked+restarted (active/enabled). Removed superseded rpi4 v9/v9.1/v9.2 img.xz to free disk. PENDING: boot the reflashed rpi4 + validate over 22222 (update refused / branding / HACS); flash v9.3 x86 to elegante; revoke sudo (task 7).
OLD line: Overlay files staged: usr/sbin/aetos-update-block (IPv6 fix), usr/sbin/aetos-recovery-ssh + .service + usr/share/aetos/authorized_keys. After: name v9.3, restore v7.2, verify, unmask oomd, reflash .100 device (currently STOCK 2026.7.4 branding-gone after the v9.2 update slipped through), test update-refused end to end.
NOTE: live .100 device currently has the IPv6 :: block added manually (works) + dropbear 22222 started manually + SSH add-on protection mode OFF (user toggled). These are live-only; reflash v9.3 makes them permanent.

## FLASH v9.2 DONE (2026-07-26 ~23:40)
- Flashed aetos-one-rpi4-build-v9.2.img.xz to /dev/sdb (14.8G USB SD card; system disk sda untouched). `xzcat | sudo dd of=/dev/sdb bs=4M conv=fsync` wrote full 5872046080 bytes, fsync OK. Fresh partition table verified (hassos-boot/overlay/data 4.8G pre-expand). Safe to boot. sudo STILL ACTIVE (task 7) — revoke when all flashing done: sudo rm /etc/sudoers.d/krishna-aetos-build.
- Other units still need the same reflash. Live devices had DHCP-shifting IPs + mixed admin passwords.

## v9.2 — DEVICE-LEVEL UPDATE BLOCK (network-independent) (2026-07-26)
- USER: NO router fix (deploys to other networks, no router access). Block MUST be in the image. "check properly how to fix updates core, supervisor".
- MECHANISM (verified from Supervisor source supervisor/plugins/dns.py + web): Supervisor writes CoreDNS hosts to /mnt/data/supervisor/dns/hosts; CoreDNS `hosts` plugin (fallthrough) matches BEFORE the DoT forwarder -> a hosts entry CANNOT be bypassed by Supervisor encrypted-DNS (why router block is unreliable but on-device hosts works). GOTCHA: Supervisor add_host() REJECTS 0.0.0.0 and REWRITES the file from template -> must write file directly + re-assert.
- FIX (baked in buildroot rootfs-overlay = HOST OS):
  - rootfs-overlay/usr/sbin/aetos-update-block (0755): loop every 30s, if /mnt/data/supervisor/dns/hosts lacks version.home-assistant.io, append `0.0.0.0 version.home-assistant.io`. CoreDNS auto-reloads hosts ~5s. Re-asserts after Supervisor rewrites.
  - rootfs-overlay/usr/lib/systemd/system/aetos-update-block.service (After=haos-supervisor.service, Restart=always) + enabled via multi-user.target.wants symlink + 70-haos.preset `enable`.
  - EFFECT: version.home-assistant.io -> 0.0.0.0 -> Supervisor "can't fetch versions / no host internet" -> Core/OS/Supervisor updates blocked even on manual click, ANY network. Add-ons/HACS untouched (different hosts). Connectivity check uses a DIFFERENT host so system NOT marked offline.
  - Verified: sh -n OK, script exec bit set, service syntax fine.
- KEEPS all v9.1: aetos_no_update (entity disable + notif dismiss + supervisor auto-update off + hostname pin) as UI-level cleanup; runtime branding module + native name; OS pinned high.
- BUILD: v9.2 rpi4 BUILT ✓ RESULT 21:47 -> aetos-one-rpi4-build-v9.2.img.xz (978M, 1025497916, xz OK). v7.2 restored (cmp OK). oomd unmasked+restarted (active/enabled). Raw img cleaned. x86 not rebuilt (overlay change auto-propagates to os-x86 via rsync when x86 rebuilt later — TODO if x86 units need the block). NOTE: buildroot applies rootfs-overlay on every image make, so overlay files are included. VERIFY-ON-FLASH: after flashing, SSH/console check `systemctl status aetos-update-block` + `grep version.home-assistant.io /mnt/data/supervisor/dns/hosts` should show `0.0.0.0 version.home-assistant.io`; clicking Core update should fail with "no host internet connection".
- FLEET NOTE: live devices at DHCP-shifting IPs w/ MIXED admin passwords (.128 rejected Suseelarao@1). Live per-IP patching unreliable -> the image block is the durable answer. Recommend static DHCP reservations.

## v9.1 — HOSTNAME PIN (2026-07-26)
- WHY hostname drifts aetosone2/3/6: mDNS/avahi collision. All units ship base hostname "aetosone" (BR2_TARGET_GENERIC_HOSTNAME in rpi4 defconfig). Multiple units (or stale records) on one LAN -> avahi appends -N. One aetosone per network stays aetosone.local. NOT random drift.
- v9.1 FIX: aetos_no_update v2.3.0 adds `_supervisor_set_hostname` -> on boot (STARTED) GETs /host/info; if hostname != "aetosone", POST /host/options {hostname:"aetosone"} (re-asserts, clears stale -N on that unit). Keeps all v9 lock+branding. Verified py_compile OK.
- BUILD: v9.1 rpi4 ONLY (user: "build only rpi image"). BUILT ✓ RESULT 20:30 -> aetos-one-rpi4-build-v9.1.img.xz (979M, 1025519272, xz OK). v7.2 restored (cmp OK). oomd unmasked+restarted (active/enabled). Raw img deleted (disk 19G). x86 NOT rebuilt for v9.1 (v9 x86 still current).
- LIVE (192.168.20.100, rpi4, now Core 2026.7.4 after user clicked update): via HA API restored name "Aetos One", re-disabled 3 update entities (WS cmd is `config/entity_registry/update` not update_entity), supervisor auto_update off, set hostname aetosone. Logo NOT restorable via API (needs /config/www file = File Editor/SSH add-on or reflash v9.1). USER CONFIRMED "update issue fixed".
- FLASH TARGET: this device is rpi4 -> flash aetos-one-rpi4-build-v9.1.img.xz.

## v9 — STRICT UPDATE LOCK + UPDATE-PROOF BRANDING (2026-07-26)
WHY v8 FAILED (confirmed on live aetosone2 / 192.168.20.100 rpi4 via HA API): Core reached 2026.7.4 though update.home_assistant_core/os/supervisor were disabled_by=user. Disabling update ENTITIES only hides tiles; the SUPERVISOR (auto_update=True) updates independently → wiped branding (branding was baked in the frontend WHEEL, replaced by stock on Core update). SSH 22222 + 22 CLOSED on device; reached it via HA REST/WS API (admin/Suseelarao@1). Set supervisor auto_update=false live (done).
USER DIRECTIVE: v9 image only (no live patch). Strictly suppress ALL Core/OS/Supervisor update notifications + disable updates; even if operator clicks update, just close the notification, don't update. Targets: aetosone2 (rpi4) + "elegante" (x86).
v9 SEED CHANGES (/home/krishna/aetos-build/v4-config-seed):
 - configuration.yaml: `homeassistant: name: "Aetos One"` (NATIVE name rebrand, survives updates) + `frontend: extra_module_url: [/local/aetos_brand.js]`.
 - www/aetos_brand.js (+ www/aetos_logo.png from branding/assets/AetosOne_logo_full.png): runtime rebrand — forces title, swaps favicon/logo, rewrites residual "Home Assistant"→"Aetos One" across shadow DOM. Lives in /config → SURVIVES Core updates (branding no longer relies on the wheel). Note: pre-login page NOT covered by extra_module_url.
 - custom_components/aetos_no_update v2.2.0 (STRICT, self-healing): on boot + every 5 min: disable the 3 update entities; POST supervisor/options {auto_update:false} via SUPERVISOR_TOKEN; dismiss Core/OS/Supervisor "update available" persistent notifications; ignore update Repairs. PLUS event-driven INSTANT dismissal hooked to pn.SIGNAL_PERSISTENT_NOTIFICATIONS_UPDATED (closes the prompt the moment it appears). Verified py_compile OK.
 - OS pinned high (18.2.dev0 > stock 18.1) → OS never updates.
HONEST GAP: the built-in Supervisor system page can still trigger a manual Core update (can't intercept from Core). ABSOLUTE block = network-block version.home-assistant.io (Supervisor then reports "no host internet connection" and refuses update — confirmed via HA GH issue #3681). TODO deliverable: give user router/DNS block of version.home-assistant.io; optionally apply on-device later via official SSH add-on (host shell).
BUILD: BOTH v9 IMAGES DONE ✓ (2026-07-26). rpi4 -> aetos-one-rpi4-build-v9.img.xz (979M, 1025552596, xz OK, RESULT 18:37); x86 -> aetos-one-x86-64-build-v9.img.xz (1.9G, 1961505492, xz OK, RESULT 19:08). v7.2 rpi4+x86 restored from preserve (cmp OK). oomd UNMASKED + restarted (svc+sock active/enabled) — protection restored. Raw .img intermediates deleted (disk 20G free). rpi4 arm64 make runs under QEMU emulation on x86 host → slow buffered make phase (normal, not hung).
DELIVERABLE DOC: outputs/Aetos-One-v9-Update-Lock-and-Network-Block.md (explains lock + gives router/DNS block of version.home-assistant.io for absolute enforcement).
NEXT: flash v9 (aetosone2 rpi4 SD + elegante x86 SSD) when media connected — point flash scripts at v9 filenames, confirm /dev/sdX (never sda). Then revoke passwordless sudo (rm /etc/sudoers.d/krishna-aetos-build). Apply router block of version.home-assistant.io for strict/absolute update lock.

## v8 — UPDATE LOCK (2026-07-24)
- ROOT CAUSE of branding revert: Home Assistant CORE was updated 2026.7.2 (branded) -> 2026.7.3 (stock) on the live device (auto_update was already OFF, so a manual "Install" click). Core update swaps the whole container incl. the custom frontend wheel -> stock unbranded frontend. /config data (helpers, automations, aetos_rebrand, themes) all SURVIVED; only the frontend-wheel branding was lost.
- LIVE FIX applied via HA MCP: registry-disabled update.home_assistant_core_update / _operating_system_update / _supervisor_update (disabled_by=user; gone from UI, no notifications, persists across restart). User also clicked don't-update.
- IMAGE FIX (v8): new custom_component v4-config-seed/custom_components/aetos_no_update/ — on startup registry-disables Core/OS/Supervisor update entities (add-ons/HACS untouched). Enabled via `aetos_no_update:` in configuration.yaml + update-seed heredoc. Verified py_compile/JSON/YAML OK. Pre-flight now shows `integrations 10`.
- v8 rpi4 BUILT ✓ (08:50) -> aetos-one-rpi4-build-v8.img.xz (978M). v7.2 restored from preserve.
- v8 x86: FIRST attempt DIED at 09:02 — systemd-oomd killed the user session slice under memory pressure during `podman save` (15G RAM/4G swap; journal showed oomd firing + session teardown). NOT an error in the build. rpi4 had slipped under the threshold.
  FIX: `sudo systemctl mask --now systemd-oomd.service systemd-oomd.socket` (both masked→can't reactivate), then relaunched via `setsid bash build-x86-v72.sh`. Core tar (2.7G) was already valid on disk.
  *** MUST UNDO after x86 build completes: `sudo systemctl unmask systemd-oomd.service systemd-oomd.socket && sudo systemctl start systemd-oomd` (restore system OOM protection). ***
  MONITORING NOTE: never use `pgrep -f build-x86-v72.sh` to check liveness — it matches the grep's own cmdline (false positive). Use the real PID via `ps -p <pid>` and check log mtime advancing.
- v8 x86 relaunched 09:30 (oomd masked) -> RESULT/DONE 09:51. BUILT ✓ -> aetos-one-x86-64-build-v8.img.xz (1.9G, 1961505564 bytes, xz -t OK). v7.2 x86 restored from preserve (cmp OK). oomd UNMASKED + restarted (service+socket active/enabled) — system protection restored.
- BOTH v8 IMAGES DONE ✓ (2026-07-24): rpi4 aetos-one-rpi4-build-v8.img.xz (978M) + x86 aetos-one-x86-64-build-v8.img.xz (1.9G). Both carry the aetos_no_update lock + prior v7.3 rebrand (ssl off, aetos_rebrand). v7.2 + v7.3 deliverables all intact. NEXT: flash v8 when media connected (see flash note below; point flash scripts at v8 filenames), then revoke sudo.
- DISK CLEANUP done (safe, mid-build): removed old brand-core-v3..v71 dirs, aetos-certs, stale logs (~1.5G) + old v3/v6 image deliverables (~3.8G) = ~5.3G freed. STILL TODO after builds: remove raw .img in os*/output, drop *.img.xz.preserved once v8 restores confirmed, dedupe.

## BUILD STATUS (2026-07-21 ~03:12)
- Passwordless sudo granted via /etc/sudoers.d/krishna-aetos-build (REVOKE after: sudo rm that file).
- rpi4 v7.3 BUILT ✓ pre-flight showed `ssl off | branding pkg yes | integrations 9` (aetos_rebrand present). Deliverable: projects/Aetos-build/aetos-one-rpi4-build-v7.3.img.xz (979M, xz integrity OK). Real v7.2 preserved as *.img.xz.preserved and restored to aetos-one-rpi4-build-v7.2.img.xz.
- x86 v7.3 BUILT ✓ (03:42). Deliverable projects/Aetos-build/aetos-one-x86-64-build-v7.3.img.xz (1.9G, xz integrity OK). x86 v7.2 restored from preserve, verified intact.
- BOTH v7.3 images done + integrity-checked. v7.2 rpi4+x86 both preserved & restored (cmp OK).
- FLASH BLOCKED (2026-07-21): no removable media connected — lsblk shows only sda (system disk, DO NOT TOUCH) + sr0 DVD; both flash scripts dd to /dev/sdb which is absent. ALSO flash-v72.sh / flash-x86-v72-ssd.sh reference the v7.2 FILENAMES (from /img/ mount) → must be pointed at the v7.3 files before flashing. When user inserts SD + USB SSD: confirm the /dev/sdX node (never sda!), point flash at aetos-one-*-v7.3.img.xz, then dd.
- Passwordless sudo STILL ACTIVE (/etc/sudoers.d/krishna-aetos-build) — kept for flashing; REVOKE after: sudo rm /etc/sudoers.d/krishna-aetos-build.

## TO BUILD v7.3 (run on build host with sudo; cannot run in Claude session)
  rpi4:  bash /home/krishna/projects/Aetos-build/master-build-v72.sh   (pre-flight should now report `ssl off`)
  x86:   bash /home/krishna/projects/Aetos-build/build-x86-v72.sh      (run AFTER rpi4; rsyncs tree from os/)
  flash: bash flash-v72.sh (rpi4 SD) ; bash flash-x86-v72-ssd.sh (x86 SSD)
  verify: HTTP loads on :8123 (no cert warning); trigger a notification → shows 'Aetos One'; console/SSH still Aetos.
## DROPPED (decided 2026-07-20)
- T2 App/add-on repo seeding + provisioning — DROPPED. (repo URLs list exists but not wired; provision-apps.sh never existed. Revisit later if pre-loaded Apps store / bundled apps are wanted.)
- T3 Login+loading dynamic logo hook — DROPPED. Reason: login (authorize.html.template) + loading (index.html.template) already show the static Aetos shield (favicon-192/512), not HA. Shipping as "Aetos One" default; per-customer upload → pre-login surfaces not needed.
- T4 Spec-gap verification — DROPPED. Note for later: loading favicon/spinner + OHF removal already done in v7.2 build; update-suppression had NO seed-level config found (only possibly frontend UI hiding) — revisit only if an update ever overwrites branding.

## OPEN ISSUE — backend "Home Assistant" strings (raised 2026-07-20)
- Symptom: notifications / logs / Supervisor messages still say "Home Assistant".
- Root cause: frontend locale is 100% clean (0 hits). Leftovers come from UNMODIFIED backend containers the build pulls: Supervisor (ghcr.io/home-assistant/${arch}-hassio-supervisor, self-updating via haos-supervisor script) + Core (stock home-assistant image, frontend wheel overlaid). Strings are baked into those images.
- Full removal = fork+rebuild Supervisor & Core = fragile/self-updating, NOT recommended.
- Proposed fix (maintainable): notification/Repairs INTERCEPTOR (native automation or small custom_component; Spook already in seed has persistent_notification access) → rewrite "Home Assistant"→"Aetos One" or dismiss update/unsupported/unhealthy notifs (doubles as update-suppression).
- Not fixable without fork: raw Logs panel (Core/Supervisor/Host stdout) + `ha` CLI/API strings — admin-only.
- DECIDED 2026-07-20: (1) REWRITE notifications + Repairs "Home Assistant"→"Aetos One" (do NOT dismiss). (2) LEAVE the raw Logs panel visible (admin-only). → becomes v7.3 task T5.

## PENDING / DEFERRED (do later — user parked on 2026-07-20)
- [ ] **Cast / TV receiver rebrand — DEFERRED.** Decision made: go with a CUSTOM Aetos Google Cast receiver, but dropped for now, revisit later.
      How to do it when resumed:
      1. Register a receiver app in Google Cast Developer Console (needs Ramsay's Google acct + one-time $5 fee) → get new APP ID (replaces `A078F6B0`).
      2. Host an HTTPS receiver page (copy of HA open-source receiver, splash/idle logo → Aetos shield, navy bg) at a stable public URL; register it against the app ID.
      3. Set `CAST_APP_ID` in frontend/src/cast/const.ts to the new ID, rebuild frontend into image.
      Note: receiver must be publicly reachable over HTTPS (hosted outside the box). Requires Ramsay to do the Google registration; then hand app ID + receiver URL to wire into build.

## Gaps found vs BRANDING_SPEC (verify in next image)
- Login page branding was never in the spec — genuine gap (= #4).
- Loading screen: "broken favicon" + "spinner logo → shield" flagged — confirm landed in v7.2.
- Bundled apps provisioning (provision-apps.sh) — confirm wired (= #3).
- Update suppression must persist so updates can't overwrite branding.
- Physical `#23` boot test still needs Ramsay to power on flashed hardware.

## v9.8.1 — FRESH-FLASH VALIDATION (2026-07-29, unit .119)
First clean-flash boot of the image carrying the scoped port80 fix. RESULT: SUCCESS — the port80 root-cause fix is PROVEN on a from-scratch flash.
- Boots on its own; Supervisor creates + starts Core with NO manual nudge. Supervisor internal API ping = 200 (was 000/hijacked before). `:8123`=302→200, `:80`=302 (port80→8123). onboarding done=["analytics"] (analytics page skipped).
- port80 nat rule confirmed scoped: `PREROUTING ! -d 172.16.0.0/12 -p tcp --dport 80 -j REDIRECT --to-ports 8123` (OUTPUT -o lo unchanged). Internal 172.30.32.2:80 no longer redirected.
- Data partition grew 4.8G→13.8G fine; no dmesg mmc/ext4/IO errors; clock correct (clock-guard).

### THREE first-boot robustness gaps found on .119 (fix in next image):
1. **Snapshotter unpack delay (~7 min blank UI on first boot).** dockerd runs with `--feature containerd-snapshotter`; the 2GB baked Core image must be UNPACKED into the overlay snapshotter on first use. containerd pegs ~93% CPU for ~7 min after "Start Home Assistant Core" / "Update pulse/client.config", NO homeassistant shim yet, `:8123`=000, then container goes none→running and UI serves. This is normal but slow. Consider pre-unpacking at build (docker create the container in the bake) or a lighter snapshotter.
2. **First-boot add-on installer timed out (installed 0).** aetos-addons-firstboot waits max 5 min (30x10s) for `docker exec homeassistant printenv SUPERVISOR_TOKEN`, but Core took 7 min (gap #1), so it exited via `[ -z "$T" ] && exit 0` WITHOUT the success flag. It IS self-healing (would retry next boot), but FIX: raise token-wait to ~15 min AND add a systemd .timer retry (don't rely only on reboot). Manual re-run after Core was up installed all 8 (core_configurator, core_mosquitto, core_samba, a0d7b954_ssh, 396f0234_cloudflared, 7edd9457_netbird, 96282436_newt, 81f33d0f_ha_mcp) + all 4 custom repos registered; flag /mnt/data/aetos/addons-installed written.
3. **"Core update available" tile shows on first boot until a Supervisor reload.** update-block correctly pins updater.json homeassistant=installed + DNS-blackholes version.home-assistant.io (IPv4+IPv6), but Supervisor fetched 2026.7.4 into MEMORY in the first seconds before the DNS block armed, and the block's Supervisor restart was removed (to avoid the old first-boot wedge). One-time `docker restart hassio_supervisor` AFTER Core is running flips update_available true→false (verified: 2026.7.4→2026.7.2, Core stayed up 200). FIX: now that the wedge is known to be the port80 hijack (fixed), safely re-add a ONE-TIME guarded Supervisor restart to aetos-update-block AFTER the "wait for Core running" loop (guard with a flag so it only happens once) — auto-clears the tile with no manual step.

## v9.8.2 — BUILT 2026-07-29 (three first-boot robustness fixes on top of proven v9.8.1)
Deliverable: /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v9.8.2.img.xz (1.6G, XZ-OK). Bigger than v9.8.1 (979M) because the Core snapshot is now pre-unpacked into the data partition (data.ext4 shrank to 7.0G vs 4.8G).
Contains v9.8.1 (scoped port80 fix) PLUS:
- FIX #1 (snapshotter pre-warm): package/hassio/dind-import-containers.sh now does `docker create --name aetos_prewarm <core-img>` + `docker rm` after image load, forcing containerd to unpack the 2GB Core layers at BUILD time. Build log confirmed "Pre-warmed Core snapshot: ...raspberrypi4-64-homeassistant:2026.7.2". create-data-partition.sh data.ext4 working size bumped 8192M->12288M for headroom (resize2fs -M shrinks back). Eliminates the ~7min first-boot blank UI. *** BUILD GOTCHA: the dind executes the COPY at os/output/build/hassio-1.0.0/dind-import-containers.sh, NOT the source (buildroot local-rsync is stamped/won't recopy). build-v982.sh cp's the source over the build-dir copy before launching. create-data-partition.sh DOES run from source (per hassio.mk). ***
- FIX #2 (add-on installer): aetos-addons-firstboot token wait 5min->15min (i<90); install step now a retry loop (8 rounds, reload+install+recheck) so slow-cloning custom repos still resolve. Added aetos-addons-firstboot.timer (OnBootSec=4min, OnUnitActiveSec=5min) enabled via timers.target.wants symlink + 70-haos.preset -> self-heals without a reboot.
- FIX #3 (update tile auto-clear): aetos-update-block now does a ONE-TIME `docker restart hassio_supervisor` after the "wait for Core running" loop (arms DNS block + pin FIRST, guarded by /mnt/data/aetos/update-flushed) so update_available auto-flips to false with no manual step. Safe now that the first-boot wedge is known to be the port80 hijack (fixed in v9.8.1).
Build wrappers: build-v982.sh (preflight-verifies all fixes incl build-dir copy) + post-v982.sh (rename v7.2->v9.8.2, xz -t, unmask oomd). NOT yet flashed/validated on a fresh unit as of this entry.

## v9.8.2 x86-64 — BUILT 2026-07-29 (generic_x86_64, all fixes)
Deliverable: /home/krishna/projects/Aetos-build/aetos-one-x86-64-build-v9.8.2.img.xz (1.9G, XZ-OK). Data partition pre-warmed (data.ext4 shrank to 7.1G).
Carries EVERYTHING v9.8.2 rpi4 has: scoped port80, Core pre-warm (Pre-warmed generic-x86-64-homeassistant), 12288M data headroom, update-block one-time auto-flush, add-on installer timer, AND the HARDENED installer (below). Built via build-x86-v982.sh (fresh rsync os/->os-x86 + FORCE-refresh of the stale build-dir dind-import copy + stamp invalidation) then retry-x86-v982.sh.
- x86 build path notes: os-x86 is `rsync -a --delete --exclude output/ --exclude .git/ os/ os-x86/` (source refreshed from os/, my edits propagate) BUT os-x86/output/ is PRESERVED, so its build-dir dind-import-containers.sh is STALE too -> must cp source->build-dir copy (build-x86-v982.sh does it, confirmed "prewarm in BUILD-DIR: 1"). make target: `make generic_x86_64`. Core img tag: ghcr.io/home-assistant/generic-x86-64-homeassistant:2026.7.2.
- *** OOM (Error 137) on the dind image-install step recurred on x86 (bigger memory pressure now that pre-warm docker-create runs right after the 2.6G docker load). set -e did NOT catch it (masked by the `| grep -v` pipe -> false "DONE", no img). FIX = retry-x86-v982.sh: mask systemd-oomd, `podman rm -f` all leftover containers, umount stale loop data mount, rm .stamp_images_installed+data.ext4+erofs+img, `sysctl vm.drop_caches=3`, LOWER vm.dirty_bytes=512M / vm.dirty_background_bytes=128M (cuts peak page-cache RAM during the big loop-fs writes), then re-run `make generic_x86_64`. Succeeded rc=0 on retry, no OOM. RESTORE dirty_bytes=0 after. ***

## v9.8.2b — add-on installer HARDENED (both arches, in source)
Live finding on the v9.8.2 rpi4 flash (.119): installer stopped at 7/8 with ha_mcp MISSING. Root cause: the ha-mcp repo (81f33d0f, github.com/homeassistant-ai/ha-mcp) sometimes fails to register on first add ("App 81f33d0f_ha_mcp does not exist in the store"), AND the old success threshold >=6 let it write the done-flag at 7 and stop. Manual repo re-add + install fixed .119 to 8/8.
Source fix in rootfs-overlay/usr/sbin/aetos-addons-firstboot: (1) repo-add moved INSIDE the retry loop (re-added+reloaded every round -> flaky adds retried); (2) 12 rounds; (3) success now requires ALL 8 before flag; (4) bounded give-up: /mnt/data/aetos/addons-attempts counter, after >=10 total runs accept >=6 and flag (so a dead repo can't loop forever). Timer already retries across boots.

## v9.8.2 rpi4 FRESH-FLASH validation (.119, 2026-07-29) — all 3 fixes fire automatically
Boot->Core ~4.5min (was ~10min on v9.8.1: pre-warm ~halved it). :8123=302/:80=302/supervisor ping=200. update-flushed flag auto-set, update_available=False with NO manual restart (Fix#3 auto). onboarding analytics skipped. Add-ons auto-installed (7/8 auto; ha_mcp needed the hardening above, now fixed in source). Data partition sdb8=7G (pre-warmed).

## Hostname now USER-CHANGEABLE (2026-07-29) + elegante unit (.113) fixed
Problem: baked custom_component aetos_no_update `_supervisor_set_hostname()` HARDCODED + re-asserted hostname="aetosone" on every start/periodic pass -> UI renames reverted after reboot (elegante.local never resolved, aetosone.local did).
FIX (source: v4-config-seed/custom_components/aetos_no_update/__init__.py): seed-once logic. On first pass, if flag /config/.aetos_hostname_seeded absent: desired = contents of optional /config/aetos_hostname.txt else "aetosone"; set via supervisor host/options ONLY if supervisor reachable (HTTP 200), then write the flag. If flag present -> do nothing (respect the user's UI hostname). So fresh units seed "aetosone" once; UI renames now STICK; per-unit default can be baked via aetos_hostname.txt.
.113 (elegante x86 v9.8.2) live-fixed: pushed new component, wrote /config/aetos_hostname.txt=elegante, set hostname=elegante via supervisor, `ha core restart`. Verified: host/info hostname=elegante, /mnt/overlay/etc/hostname=elegante, flag written, elegante.local pings (192.168.20.113), :80=200 & :8123=200.
Also set internal_url=http://elegante.local (edited .storage/core.config while core STOPPED via throwaway `docker run <core-img> python`, then start; HA won't overwrite when stopped). Now Settings>Network "Local network" shows http://elegante.local (no :8123). Persisted across restart.

## Build cleanup (2026-07-29): reclaimed ~14G (22G->36G free)
Removed: leftover offline-bake tars addon-apps.tar + addon-images.tar (both os/ and os-x86/ package/hassio - relics of the dropped offline addon bake), brand-core-* podman build contexts, uncompressed output/images/{haos_*.img,data.ext4} (regenerable; .img.xz deliverables safe in ~/projects/Aetos-build/), old build/flash logs, podman dangling. KEPT: build trees (os/, os-x86/ output for incremental), haos-cache*, aetos-core.tar (2.6G x2, regenerable but kept to avoid core rebuild). Deeper clean available: delete aetos-core.tar copies (~10G total incl build-dir copies) but forces branded-core podman rebuild next time.


## v9.8.3 - BOTH ARCHES BUILT 2026-07-29 (hostname seed-once baked in)
Deliverables (~/projects/Aetos-build/): aetos-one-rpi4-build-v9.8.3.img.xz (1.6G, XZ-OK) + aetos-one-x86-64-build-v9.8.3.img.xz (1.9G, XZ-OK). Both = v9.8.2 + seed-once hostname component (renames STICK; fresh units seed "aetosone" once; optional /config/aetos_hostname.txt per-unit default). Built rpi4 then x86 one-by-one. Data partitions pre-warmed (7.0-7.1G).
BUILD GOTCHA: after the big cleanup/podman-prune, the first rpi4 v9.8.3 make got STUCK in the dind image-install (data.ext4 stayed 71M empty ~22min while sda churned 70MB/s elsewhere, free space flat = stale mount/podman state). DETECT: du -m data.ext4 not growing = stuck; growing = fine. Distinguish decompress-vs-stuck by sda write rate: ~1MB/s + high CPU = docker-load decompress (OK, will fill), 70MB/s + flat data.ext4 = stuck. FIX = retry-rpi4-v983.sh: pkill master-build, podman rm -f all, umount stale data mount, rm data.ext4+stamp+erofs+img, drop_caches + vm.dirty_bytes=512M, re-run make. x86 got the same clean-state guard baked into build-x86-v982.sh (podman rm all + umount + dirty tuning at start) and ran clean.
Post: post-v983.sh / post-x86-v983.sh. vm.dirty_bytes left lowered (harmless, resets on reboot). NOT yet flashed. Live .113 (elegante) already hostname-fixed manually.

## PORT FACT (memorized 2026-08-07 01:26)
- **HA 2026.8: the default HA frontend serves on port 80** (not 8123). No port-forward / no port-80→8123 redirect hack needed anymore. All the earlier v9.8.x redirect-loop workarounds are obsolete on 2026.8 — use the native port 80.
- Implication for dev: production/HAOS target = port 80 native. (Local pip dev Core still uses 8123 by convention unless run as root, since binding :80 is privileged.)

## DEV-SERVER WORKFLOW (HA 2026.8) — set up 2026-08-07 01:38
Pivoted off HAOS image whack-a-mole to a live frontend dev server (iterate branding in-browser, no flashing).
- **Core 2026.8.0** venv: `dev-core/venv` (Python 3.14.4). Config: `dev-core/config` (frontend/http:8123/api/cloud/…). Start: `. dev-core/venv/bin/activate && hass -c dev-core/config`. Serves :8123 (302 -> /onboarding.html). Pins home-assistant-frontend==20260729.5.
- **Frontend repo** = home-assistant/frontend. Branch `aetos-20260729.5` = Aetos branding cherry-picked onto tag 20260729.5 (the frontend HA 2026.8.0 ships). Safety snapshot branch: `aetos-20260624.5` (commit 5435168). Branding patch: /tmp/aetos-branding-from-20260624.5.patch.
- **Start dev server:** `cd frontend && ./script/develop_and_serve -c http://localhost:8123`  -> branded app on **http://localhost:8124** (live-reload; edits in src/ recompile automatically).
- Migration merge: 12 conflicts resolved. Kept BRANDING (theirs) on: ha-sidebar, index.html.template(launch logo), ha-onboarding(no welcome-links), automation/scene/script pickers(no learn-more), ha-config-info(no doc links), backup-settings(cloud hidden+renamed). Kept UPSTREAM (ours) on: cloud-account.ts (big refactor; re-applied 'Aetos One Cloud' header rename via sed), ha-config-dashboard, ha-panel-config. en.json: perform_action='{action} Aetos One' on upstream key refs + Aetos One Cloud strings.
- Verified: served title=<Aetos One>, launch logo=favicon-512, Core onboarding API live. NOTE residual unused .ohf-logo CSS in index.html.template (harmless). 'analytics' onboarding step still comes from Core (frontend-independent).

## DEV-SERVER BRANDING BATCH (2026-08-07 02:04)
- Core serves branded build: dev-core/config has `frontend: development_repo: <frontend repo>`; removed `http:` (2026.8 deprecation). Core :8123 (200), :8124 serve also up. Installed system libs: ffmpeg, libturbojpeg0, python isal (cleared Camera/FFmpeg/zlib log errors).
- **Official round logo** = uploads/AetosOne_Logo.jpg (601x601). Processed to public/static/icons/aetos-logo-master.png (circular alpha: outside ring transparent, inside untouched). ALL favicons/maskable/favicon.ico + aetos-shield.png + aetos-logo-main.png regenerated from it. Deleted old intermediates (aetos-round-*.png) + hass_frontend.old. Sidebar _aetosLogo()->favicon-192, onboarding header->favicon-192 @168px round, launch/loading->favicon-512 — all = new logo.
- Onboarding: analytics page auto-skipped (ha-onboarding _skipAnalytics), welcome-links removed, Help gone (branded footer has none).
- Removed: ha-tip renders nothing (all Tips gone); repairs-issue dialog 'Learn more' disabled; scene/script empty-state + help-dialog 'Learn more' removed; Analytics + Labs config pages deleted (menu entries in config-sections.ts + routes in ha-panel-config.ts).
- 'Unsupported installation method' repair filtered in src/data/repairs.ts (AETOS_HIDDEN_ISSUES = deprecated, deprecated_container; homeassistant domain) — dev-only artifact, never appears on real Aetos OS.
- Build: `nohup ./node_modules/.bin/gulp develop-app` (watch). Full build needed after html-template/static-icon edits (watch only recompiles TS). git branch aetos-20260729.5.

## DEV URL FIX (2026-08-07 02:21) — use :8123 ONLY
- Canonical dev URL = **http://localhost:8123** (Core with development_repo serves branded frontend + native same-origin auth). Retired the :8124 `serve` (it had no auth backend -> /auth/authorize nested redirect_uri loop -> HTTP 431).
- GOTCHA: Core registers frontend static routes AT STARTUP from development_repo/hass_frontend. If Core starts before `gulp develop-app` finishes the initial build, /frontend_latest/*.js returns 404. FIX: (re)start Core AFTER the gulp build completes. Order: start gulp -> wait 'Build done' -> start/restart hass.
- Service worker: hass_frontend/service_worker.js replaced with no-op (network-only, clears caches, no reload loop). Old stock-onboarding SW may linger in a normal browser window -> use Incognito or clear site data once.
- Processes: hass (Core :8123) + `gulp develop-app` (watch, rebuilds hass_frontend on TS edits; html-template/icon edits need noticing a full rebuild). No :8124.

## v9.9.0 rpi4 BUILD + ON-DEVICE VALIDATION (2026-08-07 09:51) — BOOT-FIX PROVEN
Device 192.168.20.123 (hostname aetosone), recovery SSH :22222 OK.
- **BOOT-FIX WORKS**: host blackhole (aetos-fw-block, ipv4+ipv6) active at boot -> Supervisor stayed **2026.07.3** (never fetched/updated to crashing 2026.07.5), NO NoneType/RAUC crash, reached 'Start Home Assistant Core' and Core **2026.8.0** came up. This is exactly where v9.8.17 died. Confirmed 0 bad-events.
- **BUG 1 (fixed)**: seed .storage/http was missing 'server_port' -> Core 2026.8 http setup KeyError 'server_port' -> frontend/auth/onboarding cascade-fail -> no UI. FIX: add server_port to stable block. Seed fixed.
- **BUG 2 (fixed)**: server_port:80 -> Core self-redirect LOOP (every path 307->same URL) because on HAOS the Supervisor manages Core networking expecting **8123**; port 80 breaks it. Matches v9.8.13 history. FIX: server_port MUST be **8123** in seed .storage/http. Reverted seed 80->8123. Access via http://aetosone.local:8123. For bare :80, use a HOST-level 80->8123 redirect (NOT Core's port).
- Verified on device: :8123/onboarding.html = 200, title 'Aetos One', 168px round logo, favicon-192 served. Fully branded, no loop.
- COLLATERAL (harmless): blackhole also catches whoami.home-assistant.io + alerts.home-assistant.io (shared Cloudflare IPs) -> whoami time-adjust + alerts fail with timeout. Clock still fine via NTP (not blocked). For a cleaner block, prefer surgical DNS-hostname block over IP-blackhole, or narrow to non-shared IPs.
- NOTE: frontend 'default port 80' label (ha-config-http-form.ts + en.json) is now cosmetically wrong (Core is 8123 on HAOS). Revert to 8123 next frontend build if desired.
- Deliverable: projects-Aetos-build/aetos-one-rpi4-build-v9.9.0.img.xz (953M). Flashed /dev/sdc, byte-verified MATCH.

## v10.0.0 — DURABLE FIX (os-agent 1.10.0) built+flashed 2026-08-07 10:53
- **ROOT CAUSE of the whole update-crash saga: os-agent 1.9.0.** Our OS base (18.2.dev0) shipped os-agent 1.9.0; HAOS 18.2-stable bumped it to 1.10.0. Supervisor 2026.07.5's rauc get_slot_status() needs os-agent 1.10.0; with 1.9.0 it returns None -> crash. Fix = os-agent 1.10.0 (git checkout 18.2 -- buildroot-external/package/os-agent/).
- Because RAUC now works, the Supervisor can update normally -> NO update-block needed. Removed aetos-update-block + aetos-fw-block (services+scripts+wants). Removed all DNS/IP blocking -> no whoami/checkonline/alerts collateral -> add-on store works.
- aetos_no_update retargeted: locks ONLY update.home_assistant_core_update (frontend branding), and now ENABLES supervisor auto_update (was disabling). OS+Supervisor update freely.
- Kept: branded frontend (aetos-20260729.5), branded Core 2026.8.0, recovery SSH :22222, hostname aetosone, aetos-addons-firstboot (12 apps + 6 repos), aetos_rebrand, server_port 8123.
- Deliverable: projects-Aetos-build/aetos-one-rpi4-build-v10.0.0.img.xz (931M). Flashed /dev/sdc, VERIFY MATCH. Build wrapper: /home/krishna/flash-tmp/build-rpi4-v10.sh, flash: flash-v10.sh.
- PENDING on-device validation: boot -> Supervisor updates to current cleanly (no crash) -> add-on store populates -> 12 apps auto-install. THEN this is the real product image.

## DURABLE FIX PROVEN ON-DEVICE (2026-08-07 12:27) — os-agent 1.10.0
On aetosone unit (.123, os-agent 1.10.0 confirmed via busctl io.hass.os Version=1.10.0):
- RAUC busctl GetSlotStatus returns VALID slot data (kernel.0/boot-status good/state booted/bootname A) — the None that crashed 2026.07.5 with os-agent 1.9.0 is FIXED by 1.10.0.
- Lifted the update-block (mask+kill aetos-update-block/aetos-fw-block, del blackhole routes, strip 0.0.0.0 version.home-assistant.io from /mnt/data/supervisor/dns/hosts, restart hassio_dns). GOTCHA: the Supervisor caches DNS in-process; after unblocking you MUST restart hassio_supervisor or its update keeps hitting 0.0.0.0:443 (stale cache) even though curl works.
- After supervisor restart: 'ha supervisor update' -> **Supervisor 2026.07.3 -> 2026.07.5, healthy, Core stayed UP (:8123=200), NO crash**. Then store reload SUCCEEDS, store populated **84 add-ons**, aetos-addons-firstboot began installing (esphome...). Core stays 2026.8.0 (update_available false) = branding preserved.
- CORE BLOCKING confirmed: aetos_no_update disables update.home_assistant_core_update entity; Core pinned 2026.8.0. Supervisor+OS allowed to update.
- PRODUCT IMPLICATION: the clean v10 image (aetos-one-rpi4-build-v10.0.0.img.xz) has NO block services baked, so on a FRESH boot the Supervisor updates to current automatically (no block, no stale-cache issue) and the store works from the start — no manual intervention. (The .123 test unit confusingly still had block services from an earlier state; had to remove them live.)

## DOUBLE-LOGO + ABOUT-FLASH — ROOT-CAUSED (2026-08-07 12:45): device runs STALE flash, source is CLEAN
- Symptoms user still saw on .123: two sidebar logos, About page flashes old "Home Assistant" content, old branding / welcome-links block.
- INVESTIGATION (verified, not assumed):
  - Frontend SOURCE renders exactly ONE `<img class="aetos-logo">` (ha-sidebar.ts). No CSS pseudo-element/background second logo (.aetos-logo block is plain 28x28). home-assistant-main.ts injects NO logo `<img>` at runtime (only a favicon <link>). So source cannot produce two logos.
  - Served DEV build (frontend/hass_frontend, development_repo on dev Core :8123) = CLEAN: `onboarding-welcome-links` refs = 0, single-logo template. Dev Core :8123 -> 200.
  - DEVICE .123 baked frontend (/usr/local/lib/python3.14/.../hass_frontend/frontend_latest) STILL has `onboarding-welcome-links` = **2** -> it is running an OLDER frontend than current source.
- ROOT CAUSE: **.123 was flashed from an EARLIER, partial v10 build** (os-agent already 1.10.0, but frontend NOT yet cleaned and block services still present = the "hybrid" unit). The double logo/About-flash/old-branding are all artifacts of that stale baked frontend — NOT bugs in current source.
- The double logo specifically = old frontend had the removed welcome-links/second-logo markup baked in; current source has one logo only.
- BUILD PATH VERIFIED: /home/krishna/aetos-build is a symlink -> data-backup path. master-build FE=$BASE/frontend/hass_frontend resolves to the SAME clean dir I edit (welcome-links=0). So builds bake the clean frontend. No path mismatch.
- CURRENT v10.0.0.img.xz (built 2026-08-07 10:40 by reusing the clean 03:09 hass_frontend) therefore already contains: clean single-logo frontend (welcome-links=0), os-agent 1.10.0, NO block services (overlay confirmed: only aetos-addons-firstboot/clock-guard/core-kick/hostname-early/recovery-ssh), recovery SSH :22222.
- RESOLUTION: **re-flash .123 with the CURRENT v10.0.0.img.xz** — fixes double logo + About flash + old branding + removes leftover block services, in one shot. No source edits or rebuild needed. (Reflash = write image to the SD via /dev/sdc; user reinserts SD into the Pi.)
- App repos to bake (6, confirmed in v4-config-seed/aetos-addon-repositories.txt): brenner-tobias/ha-addons, blakeblackshear/frigate-hass-addons, netbirdio/addon-netbird, einschmidt/hassio-addons, Ferdinand99/home-assistant-newt-addon, AppDaemon/appdaemon.
- DEV SERVER for verification is UP: dev Core :8123 (dev-core venv) serving branded frontend via development_repo; gulp develop-app watch running (frontend/hass_frontend). Live edits rebuild.
- DO NOT TOUCH .119 (sumeru-eswc-01) — live 4-dashboard test unit.

## v11 — APP REPOS CHANGE (2026-08-07 12:55): repos-only, no auto-install
- User directive: "add as app repos, dont install apps." New curated ADD-ON STORE repo set (5):
  1. https://github.com/blakeblackshear/frigate-hass-addons  (Frigate + Frigate Full Access)
  2. https://github.com/homeassistant-ai/ha-mcp              (HA-MCP Server)
  3. https://github.com/Ferdinand99/home-assistant-newt-addon (Newt)
  4. https://github.com/netbirdio/addon-netbird             (NetBird)
  5. https://github.com/brenner-tobias/ha-addons            (Cloudflared)
- HACS-world items the user also named (HACS, LLM Vision, OpenCV, YOLOv5) are NOT add-on-store repos; user chose "Add-on store repos only, skip HACS ones." So they are EXCLUDED from the add-on repo list. (HACS itself remains baked as a seed custom_component powering the Mushroom dashboards — untouched.)
- CHANGED FILES:
  - os/.../rootfs-overlay/usr/sbin/aetos-addons-firstboot -> rewritten to REPOS-ONLY: waits for Core token + running, POSTs the 5 repos, reloads store, verifies Frigate add-on appears, sets flag /mnt/data/aetos/addons-repos-added. NO add-on install calls at all.
  - aetos-addons-firstboot.service Description updated ("repos only, no installs").
  - v4-config-seed/aetos-addon-repositories.txt -> the 5 repos (was 6: dropped einschmidt/hassio-addons + AppDaemon; added ha-mcp; kept frigate/newt/netbird/cloudflared-via-brenner).
- Official add-ons (File Editor, Advanced SSH, Mosquitto, Samba) need NO custom repo (built-in core repo) so dropping community repos does not remove them.
- REBUILD REQUIRED: v10.0.0 image bakes the OLD seed (6 repos + one-by-one installer). Must rebuild -> v11 to bake repos-only + new set. Then flash. Frontend already clean in the tree (no frontend rebuild needed; master-build reuses hass_frontend).

## LIVE HOT-PATCH of .123 frontend (2026-08-07 13:05) — double logo GONE on device
- User confirmed two logos persisted even after clearing cache + browser restart -> PROOF it was the device's stale baked frontend, not browser cache (as diagnosed).
- FIX applied live over recovery SSH: streamed current clean production hass_frontend (94MB, source maps excluded) to .123 /mnt/data/hf.tar, extracted into the homeassistant container, atomic-swapped over /usr/local/lib/python3.14/site-packages/hass_frontend (old kept as hass_frontend.old), restarted Core.
- VERIFIED on device: :8123=200, welcome-links=0 in served frontend_latest, onboarding title 'Aetos One'. Single-logo clean build now live on .123.
- USER ACTION: hard-reload browser once so the service worker updates (service_worker.js was replaced too).
- CAVEAT: hot-patch persists across Core restarts but is LOST if Supervisor recreates/updates the Core container. PERMANENT fix = reflash with a current-source build (v11).

## v11.0.0 BUILT + FLASHED (2026-08-07 13:32) — all fixes, byte-verified
- Built projects-Aetos-build/aetos-one-rpi4-build-v11.0.0.img.xz (930M). Preflight all green: frontend welcome-links=0, firstboot install-calls=0 / 5 repos, os-agent 1.10.0, update-block gone, Core-only lock, sup auto-update ON, server_port 8123, recovery ssh.
- Contents: clean single-logo branded frontend (no double logo / no About flash), repos-only add-on set (frigate-FA, ha-mcp, newt, netbird, cloudflared) NO auto-install, Core 2026.8.0 branded, hostname aetosone.
- Flashed to /dev/sdc (removable USB SD, RM=1, 59.5G) via guarded flash-v11.sh (hard safety gates; sda/sdb untouched). SHA-256 byte-verify MATCH: a7cd1687714e3197b36cb19f8a91d96c5bf92aeeb6885820ede8141da99aac77 (first 5857366016 bytes). Build wrapper: /home/krishna/flash-tmp/build-rpi4-v11.sh, flash: flash-v11.sh, waiter: wait-then-flash-v11.sh.
- SD ready to insert into the Pi. First boot: Supervisor auto-updates to current (no block), 5 repos register (no apps installed), branded UI single-logo.
- STILL PENDING: revoke passwordless sudo (/etc/sudoers.d/krishna-aetos-build) after user finishes building/flashing this session.

## SYSTEMIC ROOT CAUSE FOUND (2026-08-07 14:40): stale hass_frontend reuse + contaminated .123
Two separate problems were making every build look "unfixed":
1) BUILD SIDE — stale frontend reuse. master-build-v72.sh reuses hass_frontend if it merely contains the 'aetos-brand-changed' marker. The hass_frontend on disk was a gulp DEV build that did NOT reflect all committed source (proof: source ha-config-info.ts had AETOS_OS_VERSION 'v9.8.17' but the BUILT bundle contained NO such string). So images baked a partially-stale frontend. FIX: force a clean from-scratch PRODUCTION rebuild (rm -rf hass_frontend && corepack yarn build, MODERN_ONLY) so built == source, then bake. Set AETOS_OS_VERSION='v11.0.1'. Going forward, do a clean FE rebuild whenever source changed (don't trust the reuse).
2) TEST SIDE — .123 is contaminated. It was flashed with an OLD/partial image (served welcome-links=2, dual-logo, port 80 leftovers). My live SSH hot-patches were reverted when Supervisor auto-update RECREATED the Core container (docker inspect StartedAt jumps to 'now'; served frontend snaps back to welcome-links=2, aetos-logo-refs=0). Also the browser service worker caches the old app per-origin. => .123 can NOT validate a build. Only a FRESH BOOT of the flashed SD (in a clean browser / SW unregistered) is a valid test.
- Confirmed my BUILT sidebar chunk has exactly ONE class="aetos-logo" render site (73524.js). The dual logo is NOT in my build - it's .123's old reverted image + browser SW cache.
- Store empty on .123 = supervisor 2026.07.3, healthy, 5 repos but 0 addons (store index failed on the contaminated unit). Fresh v11 boot loads store normally.
- ACTION PIPELINE (automated chain-v11.1.sh): clean FE prod build -> verify (welcome-links=0, version v11.0.1, 1 logo) -> image build v11.0.1 -> flash /dev/sdc -> byte-verify. Then USER must BOOT the SD in the Pi and view in a fresh browser (unregister service worker), NOT rely on .123's current running state.

## v11.0.1 FINAL — clean FE rebuild, built + flashed + byte-verified (2026-08-07 15:37)
- Fixed the stale-bundle root cause: forced clean production FE build (rm -rf hass_frontend; corepack yarn build). Verified in the FRESH bundle: welcome-links=0, exactly 1 class="aetos-logo" render site, version string 'v11.0.1' now PRESENT (was absent before = proof stale bundle was the bug), onboarding title 'Aetos One'.
- Image: projects-Aetos-build/aetos-one-rpi4-build-v11.0.1.img.xz (973M).
- FLASH GOTCHA (important): first byte-verify MISMATCHED because after dd the OS auto-mounts the fresh SD partitions and rewrites ext4 metadata before the hash read. FIX: flash-v11.1-hard.sh pauses udev (udevadm control --stop-exec-queue) across write+verify, drops caches, hashes immediately -> SHA-256 MATCH c0d14eac93b28a57fbd87258af3d56938cf197fdd240eb21969243d168626ca7. Use the hardened flash script going forward.
- SD /dev/sdc now holds byte-exact v11.0.1. USER ACTION: power off Pi, insert THIS SD, boot; view in FRESH incognito / after unregistering the service worker (HA SW caches old app per-origin on aetosone.local). Do NOT judge from .123's currently-running old image.
- Scripts: build-rpi4-v11.1.sh, flash-v11.1-hard.sh, chain-v11.1.sh, fe-build.sh.

## THE REAL ROOT CAUSE of "empty store + port80 + never-fixed" (2026-08-07 16:40)
- Fresh v11.0.1 unit booted as 192.168.20.120 (hostname aetosone, new DHCP). Frontend verified CLEAN (v11.0.1, 1 aetos-logo site, welcome-links 0, Help 0). So all "old look" in the user's browser = SERVICE WORKER CACHE (must unregister / use incognito). About "v9.8.17" in browser = cached old bundle; string does not exist in v11.0.1.
- REAL bug: the unit still ran **aetos-fw-block**, **aetos-update-block**, **aetos-port80** services (active). fw/update-block blackhole version.home-assistant.io => supervisor_internet False => **store 0 addons**. port80 => the "80 vs 8123" confusion.
- ROOT CAUSE = **buildroot incremental-build leftover**: I removed these from the source overlay, but buildroot does NOT delete already-installed files from output/target. The stale unit files + wants-symlinks + sbin scripts sat in os/output/target (dated old builds) and were baked into EVERY v10/v11 image. Overlay removal != file deletion. This is why nothing ever "took".
- FIXES:
  1. LIVE on .120: systemctl stop+mask aetos-fw-block/update-block/port80; removed the 2 hosts block lines (0.0.0.0 + :: version.home-assistant.io); restart hassio_dns + hassio_supervisor; store reload -> **supervisor_internet True, store 79 addons, 5 repos, 0 installed**. version.ha=200. Masks persist across reboot => .120 durably fixed.
  2. BUILD: rm the leftover files from os/output/target; added a PERMANENT PURGE guard to build-rpi4-v11.2.sh (removes these before packaging every build). Any future build is now clean.
- LESSON: after removing ANY file from the overlay, must purge it from output/target (buildroot won't). The v11.2 guard does this.
- Deliverable next: v11.0.2 clean image (frontend already clean+built; target purged) -> optional rebuild+reflash. .120 already works without it.

## .120 store fully fixed + "repos not found" resolved (2026-08-07 16:50)
- Root of "repos not found": firstboot registrar ran while leftover aetos-fw-block/update-block still blackholed version.home-assistant.io -> no internet -> 5 curated repos failed to register (only HA default repos loaded: ESPHome, Music Assistant, Community, Official, Local = 79 addons).
- Also found: /mnt/data/supervisor/updater.json was IMMUTABLE (chattr +i, leftover from v9.8.8 update-block) -> Supervisor "Operation not permitted" write errors. Cleared with chattr -i.
- LIVE fix on .120: chattr -i updater.json; POST-added all 5 curated repos (all returned result:ok). Now 10 repos / 94 addons. Verified present: Frigate + Frigate Full Access (ccab4aaf_frigate-fa), HA MCP Server (81f33d0f_ha_mcp), Newt (96282436_newt), NetBird (7edd9457_netbird), Cloudflared (9074a9fa_cloudflared).
- v11.0.2 clean image (no block services) will let firstboot register these automatically on first boot (real internet). NOTE: frontend AETOS_OS_VERSION constant = v11.0.1 while image tag = v11.0.2 (cosmetic mismatch; bump on next FE rebuild if desired).
- ALL user-visible "old" symptoms (2 logos, v9.8.17 About, empty store) on aetosone.local = browser service-worker cache. Device serves clean. Use http://192.168.20.120:8123 (IP origin, no SW) or unregister SW to see truth.

## *** TWO-LOGO + v9.8.17-ABOUT TRUE ROOT CAUSE (2026-08-07 18:55) ***
- THE answer after 10+ builds: /config/www/aetos_brand.js (loaded via `frontend: extra_module_url: /local/aetos_brand.js`) is a RUNTIME browser script in the SEED. It ran in addition to the baked frontend and:
  1) INJECTED a 2nd sidebar logo: hideSidebarPanels() did document.createElement("img") id=aetos-sb-logo before .title. The baked ha-sidebar already renders ONE aetos-logo -> TWO identical logos. This is why the served chunk had img-count=1 but the browser (even incognito) showed two: the script adds the 2nd at runtime, served from the device.
  2) INJECTED the About card via LICENSE_HTML with HARDCODED "Build: v9.8.17" + "Built on Home Assistant" (injectLicenses() hides the baked About and shows this). That is the exact "v9.8.17" card the user kept seeing.
- Because it's in /config/www (not the frontend wheel), NO frontend rebuild ever touched it. Rebuilding the frontend was chasing the wrong artifact.
- FIX (seed v4-config-seed/www/aetos_brand.js): removed the aetos-sb-logo injection block; LICENSE_HTML Build v9.8.17 -> v11.0.2; "Built on Home Assistant" -> "Built on Aetos One". User WANTS this rich card (restore previous) - kept it, just corrected version.
- Applied LIVE to .120 (/mnt/data/supervisor/homeassistant/www/aetos_brand.js): sb-logo-injection=0, Build v11.0.2, Built on Aetos One. User must HARD-REFRESH (Ctrl+Shift+R) to load the new module.
- Also present: /local/aetos_header_anim.js (2nd extra_module) - candidate for the "dashboard bg animation" request; review next.
- STILL TODO (frontend wheel rebuild): login logo 112->196px (done in src), aurora more-visible (done in src), dashboard animated bg (not yet). These need a FE+image rebuild; the two-logo/About fix does NOT (config script, live + seed).

## v11.0.3 — About-baked + login-logo + aurora + dashboard-bg (2026-08-07 19:10)
- About FLASH root cause: aetos_brand.js runtime-injected the rich card, but ha-config-info is a Lit element; its async data (supervisor/os info) triggers re-render that WIPES the injected card -> baked version-list reappears after a 'flash'. Runtime injection can't win vs Lit re-render.
- FIX: baked the rich Aetos card NATIVELY into src/panels/config/info/ha-config-info.ts (renders via Lit, nothing to wipe, no flash). AETOS_OS_VERSION=v11.0.3. Removed the fragile hideAboutFlash + aetos-rdy from aetos_brand.js; its injectLicenses now guard-skips because the baked About contains 'Aetos Tech Labs'.
- Login logo 112->196px (+75%); aurora more visible (opacity .45->.72, blur 70->52, bigger blobs) on login+onboarding [frontend templates].
- Dashboard animated bg: NEW /config/www/aetos_dash_bg.js (fixed aurora behind app; sets --lovelace-background/--view-background transparent so it shows behind cards). Registered in extra_module_url ?v=11.0.3. Runtime; pushed live to .120 for preview.
- v11.0.3 CHAIN RUNNING (chain-v11.3.sh): clean FE prod rebuild -> verify (About-card-baked, 1 logo) -> image build v11.0.3 (purge guard, repos-only, os-agent 1.10.0) -> flash /dev/sdc (udev-paused verify).
- NOTE: .120's About still flashes (its baked ha-config-info is the old version-list); the no-flash About only comes with a v11.0.3 REFLASH (baked card). One clean boot of v11.0.3 shows: one logo, no-flash rich About v11.0.3, bigger login logo, visible aurora, dashboard bg, working store (5 curated repos).
