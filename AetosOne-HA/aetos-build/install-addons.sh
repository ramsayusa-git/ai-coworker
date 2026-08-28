#!/bin/sh
# runs on the HAOS host; installs the 8 target add-ons sequentially, logs to /tmp/aetos-addons.log
T=$(docker exec homeassistant printenv SUPERVISOR_TOKEN 2>/dev/null)
LOG=/tmp/aetos-addons.log
: > "$LOG"
for slug in \
  core_configurator \
  core_mosquitto \
  core_samba \
  a0d7b954_ssh \
  396f0234_cloudflared \
  7edd9457_netbird \
  96282436_newt \
  81f33d0f_ha_mcp ; do
  echo "=== $(date +%H:%M:%S) install $slug ===" >> "$LOG"
  docker exec homeassistant curl -s -X POST -H "Authorization: Bearer $T" \
    "http://supervisor/store/addons/$slug/install" >> "$LOG" 2>&1
  echo "" >> "$LOG"
done
echo "=== ALL INSTALL CALLS DONE $(date +%H:%M:%S) ===" >> "$LOG"
