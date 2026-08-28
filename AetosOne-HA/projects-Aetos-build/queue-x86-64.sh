#!/bin/bash
# Waits for the RPi4 build-v2 to finish, then builds x86-64 — but ONLY if the
# RPi4 image was actually produced (don't chain a build onto a failure).
LOG=/tmp/build-x86.log
echo "[queue] $(date): waiting for RPi4 build-v2 to finish..." > "$LOG"
while pgrep -f "build-v2-osbuild.sh" >/dev/null 2>&1 || pgrep -f "make rpi4_64" >/dev/null 2>&1; do
  sleep 60
done
echo "[queue] $(date): RPi4 build ended." >> "$LOG"
if ls /home/krishna/aetos-build/os/output/images/*.img.xz >/dev/null 2>&1; then
  echo "[queue] $(date): RPi4 image found -> starting x86-64 build." >> "$LOG"
  bash /home/krishna/projects/Aetos-build/build-x86-64.sh >> "$LOG" 2>&1
  echo "[queue] $(date): x86-64 build finished." >> "$LOG"
else
  echo "[queue] $(date): NO RPi4 image (build may have failed) -> NOT starting x86-64." >> "$LOG"
fi
