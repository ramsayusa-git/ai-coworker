# Aetos One Health — Play Store submission notes

## Artifacts

| File | Use |
|---|---|
| `app/build/outputs/bundle/release/app-release.aab` | Upload this to Play Console |
| `app/build/outputs/apk/release/app-release.apk` | Sideload for testing on your own phone |

Signing certificate (this is the identity Play will bind the app to — keep the
keystore safe, it cannot be regenerated):

- Keystore: `aetosone-release.jks` (alias `aetosone`, RSA 4096, valid to 2054)
- Credentials: `keystore.properties` — **git-ignored on purpose**
- SHA-256: `0C:50:FE:FF:80:EF:AC:C2:46:CB:3B:4A:C6:D8:B7:7C:4D:D9:4F:9C:24:C4:94:77:5C:3E:1B:36:37:DF:7C:46`

If Google Play App Signing is enabled (the default for new apps), this key
becomes your *upload* key and Google holds the app signing key. Losing the
upload key is recoverable by contacting Play support; losing both is not.

## Store listing

**App name:** Aetos One Health

**Short description (80 max):**
> Live ECG and blood-pressure readings from your own Bluetooth devices.

**Full description:**
> Aetos One Health connects directly to your ikinloop ECG sensor and your RBP
> Bluetooth blood-pressure cuff, and keeps every reading on your phone.
>
> • Live ECG trace on a proper ECG-paper grid, with heart rate, RR interval and
>   a continuous signal-quality readout.
> • Blood-pressure readings captured the moment the cuff finishes, with
>   systolic, diastolic, pulse, mean arterial pressure and AHA/ACC category.
> • Profiles, so several people can share one device and each keeps their own
>   history.
> • Calibration: nudge any value up or down to line the app up with your
>   device's own screen. Offsets are applied for display only — the raw
>   measurement is always what gets stored.
> • Full history with trend charts, plus CSV and PDF export you can hand to a
>   clinician.
> • Everything is local. No account, no cloud, no tracking.

**Category:** Health & Fitness
**Content rating questionnaire:** no user-generated content, no ads, no purchases.

## Data safety form

- Data collected: **none leaves the device.**
- Health data is stored locally in the app's private database and is only
  shared when the user explicitly taps Export and picks a target.
- No analytics SDK, no advertising ID, no network permission is requested at
  all — the manifest has no `INTERNET` permission, which is worth pointing out
  in the review notes.

## Health-app declaration

Play requires a declaration for apps handling health data. The honest position:

- This app reads consumer Bluetooth devices and displays their values. It does
  **not** diagnose, treat, or make clinical claims.
- The in-app PDF export carries the line "For personal reference only. Not a
  diagnostic device."
- If you intend to market it as a medical device, that is a different
  regulatory path (FDA/CE) and the listing must change accordingly.

## Assets still needed for the listing

Play will not accept a submission without these; they are design work, not code:

1. Feature graphic, 1024 x 500 PNG.
2. At least 2 phone screenshots (up to 8), 16:9 or 9:16, min 320 px.
3. App icon 512 x 512 PNG — generate from the same Aetos One mark.
4. Privacy policy URL, publicly reachable. Given the app collects nothing, this
   can be a single page on aetostechlabs.com.

## Release checklist

```bash
export ANDROID_HOME=/path/to/android-sdk
./gradlew :app:testDebugUnitTest      # protocol + DSP tests
./gradlew :app:bundleRelease          # -> app-release.aab
./gradlew :app:assembleRelease        # -> app-release.apk for sideloading
```

Bump `versionCode` (integer, must increase every upload) and `versionName` in
`app/build.gradle.kts` before each Play upload.
