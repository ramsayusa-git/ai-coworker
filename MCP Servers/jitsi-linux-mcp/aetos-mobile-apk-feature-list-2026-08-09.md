# AetosOne Standby — Android APK feature list

**Compiled:** 2026-08-09
**Latest build in project folder:** `AetosOne-standby-debug-v1.7.apk` (4,019,086 bytes)
**Package:** `com.aetosiot.standby` · Capacitor 6 · minSdk 22 / target+compile 34 · debug-signed

> Verified by inspecting the **v1.7 binary itself** (AndroidManifest, classes.dex strings,
> capacitor.config.json), not only from the build notes — the notes stop at v1.6.

---

## 1. What the app is

A **meeting pager**. A native Android WebView wrapper around the live standby page
`https://meet.aetosiot.com/m`:

```json
{ "appId": "com.aetosiot.standby", "appName": "AetosOne",
  "server": { "url": "https://meet.aetosiot.com/m", "androidScheme": "https" },
  "plugins": {} }
```

Because it points at the **live URL**, any portal or `/m` change takes effect immediately —
**no APK rebuild** needed for web-side changes. Only native behaviour (ring, wake, service)
requires a rebuild.

## 2. Feature list

| # | Feature | Added | Verified in v1.7 by |
|---|---|---|---|
| 1 | Sign in once, stays logged in (`aetos_token`) | base | loads `/m` |
| 2 | SSE presence + **auto-join** on room `join` push | base | loads `/m` |
| 3 | Camera + mic in meetings (OS runtime **and** WebView grant) | v1.1 | `CAMERA`, `RECORD_AUDIO` |
| 4 | Keeps screen on in foreground (`FLAG_KEEP_SCREEN_ON`) | base | `WAKE_LOCK` |
| 5 | AetosOne launcher icon (shield → round badge) | v1.2 → v1.4 | — |
| 6 | **Foreground service** — survives minimise / screen-off | v1.3 | `StandbyService` (4 refs) |
| 7 | Battery-optimisation exemption prompt on first launch | v1.3 | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` |
| 8 | **Wake screen + bring app to front**, over the lock screen | v1.4 | `wakeAndFront`, `USE_FULL_SCREEN_INTENT` |
| 9 | Full-screen-intent notification (incoming-call pattern) | v1.4 | `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS` |
| 10 | **Incoming ring** — device ringtone ~8s, loop, + vibration | v1.5 | `startIncomingRing`, `surfaceIncoming` |
| 11 | Native `openMeeting(url)` — loads meeting directly into WebView | v1.6 | `openMeeting` |
| 12 | Auto-restart after reboot | v1.3 | `RECEIVE_BOOT_COMPLETED` |
| 13 | One-join-per-person (no duplicate joins across tabs/devices) | server-side 07-31 | `/m` page logic |
| 14 | Manual "Join my meeting now" + Sign out + status dot | base | `/m` page |
| 15 | Screen Wake Lock toggle | base | `/m` page |

### Declared permissions (12)
```
INTERNET            CAMERA               RECORD_AUDIO       MODIFY_AUDIO_SETTINGS
POST_NOTIFICATIONS  WAKE_LOCK            FOREGROUND_SERVICE FOREGROUND_SERVICE_DATA_SYNC
USE_FULL_SCREEN_INTENT  REQUEST_IGNORE_BATTERY_OPTIMIZATIONS  RECEIVE_BOOT_COMPLETED  DUMP
```

### Native classes
`com.aetosiot.standby.MainActivity` · `com.aetosiot.standby.StandbyService` ·
JS bridge `AetosNative` (`wakeAndFront`, `openMeeting`, `surfaceIncoming`, `startIncomingRing`)

## 3. ⚠️ Confirmed NOT in this build

**No Firebase / FCM.** Checked directly:
```
firebase entries in APK : 0
firebase strings in dex : 0
capacitor plugins       : {}
```

**Consequence — the reliability boundary:**

| App state | Rings / wakes / joins? |
|---|---|
| Foreground | ✅ yes |
| Minimised | ✅ yes (foreground service) |
| Screen off / locked | ✅ yes (wake lock + full-screen intent) |
| Device rebooted | ✅ service restarts |
| **Force-closed / swiped away** | ❌ **NO** — needs the FCM build |

The server side for FCM is **already deployed** (`server/fcm.js`, `device_tokens` table,
`POST /api/devices/register`, push on `broadcastToRoom`, Settings → Mobile push card).
Only the **app half** is missing. To finish it:

1. Firebase project → Android app `com.aetosiot.standby` → `google-services.json` into `android/app/`
2. Firebase service-account JSON → portal **Settings → Mobile push**
3. Re-add `@capacitor/push-notifications`, rebuild

## 4. Other known gaps

- **Screen share / local screen-record** — `getDisplayMedia` is not implemented by Android
  System WebView. Needs the native Jitsi Mobile SDK (MediaProjection). **Deferred.**
  *(In-meeting Record via Jibri is server-side and DOES work.)*
- **iOS** — needs a Mac + Apple Developer account + VoIP/CallKit. **Deferred.**
- **Play Store** — needs signed AAB + keystore + $25 account. Also, the direct
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` prompt is **restricted on Play**; a Play release
  would need an exemption or a manual-settings flow. Fine for sideloaded pager use.

## 5. Version history

| APK | vc | Size | Headline change | In folder |
|---|---|---|---|---|
| `...-debug.apk` | 1 | 3.75 MB | first buildable base | ✅ |
| v1.1 | 2 | 3.75 MB | camera/mic runtime-permission fix | ✅ |
| v1.2 | 3 | 3.95 MB | AetosOne shield icon | ✅ |
| v1.3 | 4 | 3.95 MB | foreground service + battery exemption | ✅ |
| v1.4 | 5 | 4.02 MB | wake-to-front, full-screen intent, round icon | ✅ |
| v1.5 | 6 | 4.02 MB | incoming ring | ✅ |
| v1.6 | 7 | — | `openMeeting()` — "rings but doesn't join" fix | ❌ **missing** |
| **v1.7** | ? | **4.02 MB** | v1.6 fix + small change (undocumented) | ✅ **latest — install this** |

**Note on v1.7:** no build note exists for it. Evidence: file list is **identical** to v1.5,
`classes.dex` is **+448 bytes**, and `openMeeting` (the v1.6 fix) **is present**. So v1.7 is
v1.6 plus a minor change. v1.6 itself is absent from the project folder.

## 6. Install notes

- Uninstall older builds first (debug-signed, same package).
- On first launch grant: **notifications**, and accept the **battery-optimisation** dialog
  (set to *Unrestricted* on OEM skins — Xiaomi/Oppo/Vivo/Samsung kill background apps aggressively).
- For a dedicated pager device: keep it **plugged in** and **unrestricted**.
