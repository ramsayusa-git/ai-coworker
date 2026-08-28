# Aetos One — get your flashable SD card (RPi4)

One pre-branded image. Build in CI, download, flash with Raspberry Pi Imager. No
two-step, no re-branding after boot.

## Step 1 — Push this repo to your GitHub
Create a repo (e.g. `aetos-one`) and push the whole `aetos-frontend/` folder,
including `.github/workflows/`, `branding/patches/`, and `branding/assets/`.

## Step 2 — Run the build
GitHub → **Actions** → **"Build branded HAOS image (RPi4)"** → **Run workflow**.
It runs on a CI runner (which has the rootful Docker the build needs):
1. builds the Aetos One branded frontend,
2. bakes it into the RPi4 core container,
3. preloads that core into HAOS (offline-branded first boot),
4. builds the OS and outputs the image.
Takes a few hours. When done, the run has an artifact **and** a Release with:
`haos_rpi4-64-<version>.img.xz`.

## Step 3 — Flash it
1. Download `haos_rpi4-64-*.img.xz` from the workflow's artifact/Release.
2. Open **Raspberry Pi Imager** → **Choose OS** → scroll to bottom →
   **Use custom** → select the downloaded `.img.xz`.
3. **Choose Storage** → your SD card → **Write**.
4. Boot the Pi from the card → it comes up as **Aetos One**, branded from the
   first screen, fully offline.

## Notes
- For a hard disk / x86 machine instead of a Pi: same idea with the
  `generic-x86-64` target (a sibling workflow can be added — ask and it's a
  10-line change: base image `generic-x86-64-homeassistant`, target `make generic_x86_64`).
- If the CI runner runs low on disk, the workflow already frees ~30 GB; if a
  future HAOS grows, we can move the build onto a larger runner.
