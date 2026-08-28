# Kiosk CEC — the ACTUAL root cause (wrong /dev/cec node) + meeting-end handling

**Date:** 2026-08-09
**Kiosk:** `kiosk-office-lab`, Pi at `192.168.20.127` (user `aetosone`, id 43, role `kiosk`)
**Server:** aetos-meet `161.97.79.175`, portal on `127.0.0.1:4000`
**TV:** Hisense (EDID `HEC` / `HISENSE`), Pi on the TV's **HDMI 1**

> ⚠️ **This supersedes `aetos-kiosk-cec-physaddr-rootcause-2026-07-31.md` entirely.**
> That document's conclusion — "adapter has no physical address, needs TV CEC on +
> reboot" — was wrong. The physical address was never broken.

---

## 1. The real root cause: there are TWO CEC adapters

The Pi has two HDMI sockets, each with **its own CEC adapter**. The cable is in the
**second** socket. Every script since July has been talking to the **first** one — which
has nothing plugged into it.

| Device | Adapter | DRM connector | Port | Status | Physical Address |
|---|---|---|---|---|---|
| `/dev/cec0` | `vc4-hdmi-0` | 36 | HDMI-A-1 | **disconnected** | `f.f.f.f` |
| `/dev/cec1` | `vc4-hdmi-1` | 45 | HDMI-A-2 | **connected → Hisense** | **`1.0.0.0`** |

`f.f.f.f` was the *correct, honest* answer for an empty port. Everything the Jul-31 doc
attributed to a driver/EDID fault was simply the wrong device node.

### Why the previous diagnosis went wrong
`aetos-cec-fix.sh` and the launcher both hard-coded `-d /dev/cec0` and only ever
inspected that one adapter, so the healthy adapter was never looked at. The proposed
remedies (TV menu, reboot, DRM re-detect) were all tested on 2026-08-09 and **none of
them changed anything**, because none of them addressed the real problem:

```
cec-ctl -d /dev/cec1 --playback -e .../edid
  -> "The CEC adapter doesn't allow setting the physical address manually"   (CAP_PHYS_ADDR unset - the Jul-31 capability analysis was correct)
echo detect > /sys/class/drm/card1-HDMI-A-2/status                            -> still f.f.f.f on cec0
full reboot with TV on and on HDMI 1                                         -> still f.f.f.f on cec0
```

### Second bug, also fixed
The launcher's `cecfire()` fallback was `PA=3.0.0.0` (TV HDMI 3). EDID reports
`Source physical address: 1.0.0.0`, i.e. **HDMI 1**. Both the device node and the
address are now auto-detected; nothing is hard-coded.

### Proof it now works
```
cec-ctl -d /dev/cec1 --playback
  Physical Address     : 1.0.0.0
  Logical Address Mask : 0x0010      <- LA 4 (Playback Device 1) allocated
  System Information for device 0 (TV) from device 4 (Playback Device 1)   <- TV replied
IMAGE_VIEW_ON / ACTIVE_SOURCE -> transmitted, no "Timeout, Max Retries"
```
TV switches to the Pi on meeting start. **Confirmed visually by the user.**

## 2. The TV cannot be switched back by CEC — all options exhausted

Tested exhaustively on 2026-08-09 against this Hisense. Each test first forced the TV
onto the Pi, then issued one candidate command:

| Direction | Command | Result |
|---|---|---|
| TV → Pi | `--active-source` + `--image-view-on` | ✅ **works** |
| Pi → TV | `--inactive-source` | ❌ ignored |
| Pi → TV | `--routing-change new-phys-addr=0.0.0.0` | ❌ ignored |
| Pi → TV | `--set-stream-path phys-addr=0.0.0.0` | ❌ ignored |
| Pi → TV | key `input-select` (0x34) | ⚠️ menu opens, then closes; no switch |
| Pi → TV | key `select-broadcast-type` digital (0x56) | ❌ ignored |
| Pi → TV | key `select-broadcast-type` analogue | ❌ ignored |
| Pi → TV | key `electronic-program-guide` (0x53) | ❌ ignored |
| Pi → TV | `input-select` + `down` + `select` | ❌ ignored |

The TV ACKs the messages (power status query returns `pwr-state: on`) but acts on none
of them. **Conclusion: this TV honours "switch to me" and deliberately ignores "leave
me".** This is normal vendor behaviour, not a fault.

**Design decision (user, 2026-08-09):** the TV stays on HDMI 1 permanently. "Monitoring
mode" = the Pi changes what *it* displays, which is the existing portal waiting page.
Remaining alternatives if live TV is ever required: Home Assistant `media_player.select_source`
via the VIDAA integration, or an IR blaster on the Pi's GPIO.

## 3. Server change — SSE `end` event

`/root/aetos/Jitsi/portal/server/server.js`
Backup: **`server.js.bak.meetingend.20260809-050725`**

The `/joinmeeting` shell already POSTed `leave` to `/api/meeting/event`; it was recorded
in `meeting_sessions` but never broadcast. Added:

- **`broadcastEndToRoom(slug, reason)`** — sends SSE `event: end` to the room's clients.
- **`maybeBroadcastEnd(slug, uid)`** — fires when the leaver is a kiosk, or when the last
  open session in the room closes.
- one call added in the `leave` branch of `/api/meeting/event`.

### Three bugs found while testing this (all fixed)

1. **Wrong delivery target.** First version only pushed to `roomListeners`
   (room-token displays). But the kiosk signs in with a **member token (a user JWT)**, so
   it lives in `liveClients` keyed by userId. Symptom: `[broadcast-end] … displays=0`.
   Fixed by pushing to room members' `liveClients` **and** `roomListeners`.
2. **Kiosk detection.** The check was `uid === 'kiosk'`, but a member-token kiosk reports
   its real user id (`43`). Now resolves the user and tests `role === 'kiosk'`
   (still accepts the literal `'kiosk'` used by room-token displays).
3. **Duplicate broadcasts.** One hangup produces several `leave` POSTs (hangup +
   `beforeunload` + `visibilitychange`) → 5 identical `end` broadcasts. Added a 15s
   per-room de-dupe (`_lastEndAt`).

Portal is **not** a systemd unit and **not** in a container — it is a bare `node` process
in the host mount namespace. Restart with:
```bash
nsenter -t 1 -m -p -- sh -c 'cd /root/aetos/Jitsi/portal && setsid nohup ./aetos-portal.sh >> /root/aetos/portal.log 2>&1 </dev/null &'
```
(`aetos-portal.sh` does `fuser -k 4000/tcp` itself, so it replaces the running instance.)

> ⚠️ The container `linux-mcp-suite` (`d6ffba42dc81`) shows as the parent of the node
> process because of PID-namespace sharing. **Do not `docker restart` it** — that is the
> MCP server itself, and it would not restart the portal.

## 4. Kiosk launcher rewrite

`/usr/local/bin/aetos-kiosk-run` — backups `.bak.cecfix.*`, `.bak.debounce.*`, `.bak.reap.*`

- **`cec_detect()`** — picks the first `/dev/cec*` whose physical address is neither
  `f.f.f.f` nor `0.0.0.0`; falls back to EDID `Source physical address` of the connected
  DRM connector. No hard-coded device, no hard-coded port.
- **`cecfire()`** — on SSE `join`: `--playback`, `--image-view-on`, then `--active-source`
  ×3. Logs `[cec] wake + switch dev=… pa=…`.
- **`cecback()`** — on SSE `end`: waits `AETOS_MONITOR_GRACE_SEC` (25s), then optionally
  forces the browser back to the waiting page. **Debounced 120s.**
- **Idle watchdog** — if a meeting never reports an end (crashed tab, dropped SSE),
  returns to monitoring after `AETOS_MEETING_MAX_MIN` (default 180).
- **Chromium reaper** — see §5.

### Config knobs (set in `/etc/aetos/kiosk.sh`)

| Variable | Default | Meaning |
|---|---|---|
| `AETOS_MONITOR_FORCE_RELOAD` | `0` | `1` = force-restart Chromium on meeting end |
| `AETOS_MONITOR_GRACE_SEC` | `25` | delay before acting on `end` |
| `AETOS_END_DEBOUNCE_SEC` | `120` | ignore repeat `end` events within this window |
| `AETOS_MEETING_MAX_MIN` | `180` | idle watchdog timeout |

`AETOS_MONITOR_FORCE_RELOAD` defaults to **0** deliberately: the `/joinmeeting` page
navigates itself back to the waiting screen, so the force-restart is only a safety net.
With it on (the initial default) each duplicate `end` killed Chromium and produced a
visible restart loop — that is what led to the debounce.

## 5. Chromium restart-loop bug (found and fixed during testing)

Symptom: `Opening in existing browser session.` followed by `chromium exited … restart in
3s`, every ~5 seconds, forever.

Cause: **snap launches Chromium in its own systemd scope**, so it escapes the
`aetos-kiosk.service` cgroup and survives a service restart. The next launch then finds
the profile locked, hands off the URL to the old instance and exits immediately — and the
launcher's `while true` loop respawns it 3s later.

Fix: reap leftovers at the top of the launch loop, before starting Chromium:
```bash
pkill -f "snap/chromium.*aetos-kiosk" 2>/dev/null || true
sleep 1
rm -f "$HOME/snap/chromium/common/aetos-kiosk/Singleton"* 2>/dev/null || true
```
Also note the profile is at `~/snap/chromium/common/aetos-kiosk`, **not**
`~/.config/chromium` — the old Singleton cleanup line was pointing at the wrong path.

## 6. Verified end-to-end (2026-08-09 10:57 IST)

```
[cec] dev=/dev/cec1 pa=1.0.0.0 10:56:43          <- correct adapter auto-detected
[cec] wake + switch dev=/dev/cec1 pa=1.0.0.0 10:57:22   <- meeting start, TV switches
[cec] meeting end -> monitoring mode in 25s 10:57:52    <- fires exactly ONCE
```
```
[broadcast]     room=office-lab online=[kiosk-office-lab] sessions=2
[broadcast-end] room=office-lab reason=kiosk-left clients=2
```
Post-run health: `chromium exits: 0`, `session handoffs: 0`, browser running,
service `active`.

## 7. Gotchas for future sessions

- **`pkill -f <pattern>` over SSH kills its own session** if the pattern appears in the
  remote command line. Cost two dropped connections (exit 255, no output) before it was
  spotted. Use the `[c]hromium` bracket trick, or send the script **base64-encoded** so
  the pattern never appears literally. Base64 is also the reliable way around
  PowerShell/cmd nested-quote mangling.
- Contrary to `aetos-cec-hdmi-debug-2026-07-24.md`, the Pi **is** reachable from the cloud
  sandbox — `ssh aetosone@192.168.20.127` works directly. No need to relay through the
  Windows desktop.
- `/etc/aetos/kiosk.sh` contains `AETOS_SYS_PASS` in **plaintext** (mode 600). Same
  password as the SSH account — rotate both if either leaks.
- SSE connections leak: `clients=` reached **45** for a 3-member room before a portal
  restart cleared it. Worth investigating `liveRemove()` / `req.on('close')` separately.
- Pi load average sits at **~4.0 on 4 cores** — saturated. Unrelated to this work, still open.

## 6a. DEFINITIVE cold-start test — TV on tuner → meeting → Pi input (11:50 IST)

All earlier tests began with the TV **already on the Pi's input**, which only proved the
command was accepted, not that it actually changed anything. This run started with the
user having manually switched the TV to **TV/tuner mode**:

```
>>> FIRING MEETING START
[cec] wake + switch dev=/dev/cec1 pa=1.0.0.0  11:50:16
adapter: Physical Address 1.0.0.0, Logical Address Mask 0x0010 (LA 4)
TV: pwr-state: on
```

User confirmed on screen: **"working"** — the TV left the tuner and switched to the Pi's
HDMI input. This is the original requirement, verified from a genuine cold start.

## 7a. Moving the cable — both cases are handled (2026-08-09, later)

Backup: `.bak.hotplug.*`

**Moving to a different TV input** (HDMI 1 → 2/3): the EDID `Source physical address`
changes and `cecfire()` re-reads the adapter address on **every** meeting start, so it
picks up `2.0.0.0` etc. automatically and logs
`[cec] physical address changed 1.0.0.0 -> 2.0.0.0 (input moved)`.

**Moving to the Pi's other HDMI socket**: `cec_detect()` scans every `/dev/cec*` with no
preference and takes whichever reports a real address, so `/dev/cec0` simply becomes the
winner.

Two fixes were needed to make this true:

1. `cecfire()` previously re-detected only when `CEC_DEV` was **empty**, never when it had
   gone **stale**. A cable moved while the kiosk was running would have kept using the old
   adapter until a restart. It now re-validates the address each time and re-detects on
   `f.f.f.f`/`0.0.0.0`.
2. The EDID fallback hard-coded `CEC_DEV=/dev/cec1`. It now maps the connected DRM
   connector to its owning adapter via `connector_id` ↔ `cec-ctl … "connector N"`.

Verification run:

| Check | Result |
|---|---|
| picks correct adapter now | `/dev/cec1 1.0.0.0` ✅ |
| connector → adapter mapping | `card1-HDMI-A-2 (connector 45) -> /dev/cec1` ✅ |
| EDID address read live | `Source physical address: 1.0.0.0` ✅ |
| fall-through to other adapter | **unproven** — socket 0 is empty, nothing to detect |

The fall-through is reasoned from the code (a symmetric loop), **not** measured. Confirm it
the first time the cable actually moves.

Caveats: moving the Pi's socket also moves the **video output** — if the screen is blank
after the swap, reboot (display config, not CEC). And `vc4_hdmi` latches the address at
**hotplug**, so allow a few seconds after replugging.

## 8. Rollback

```bash
# Pi
sudo cp /usr/local/bin/aetos-kiosk-run.bak.cecfix.20260809-104553 /usr/local/bin/aetos-kiosk-run
systemctl --user restart aetos-kiosk

# Server
cd /root/aetos/Jitsi/portal/server
cp server.js.bak.meetingend.20260809-050725 server.js
cd /root/aetos/Jitsi/portal && ./aetos-portal.sh
```
