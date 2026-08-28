#!/usr/bin/env bash
# Provision the standard Aetos One add-ons ("Apps") on a HAOS/Supervised box.
# Run inside the SSH/Terminal add-on, or via SSH. Requires the Supervisor token
# (present in a login shell on the add-on). Installs + starts each add-on.
#
#   bash provision-apps.sh
#
# Official core add-ons install without any extra repository. The Advanced SSH &
# Web Terminal is a community add-on (hassio-addons repo) — its repo is added first.
set -uo pipefail

say(){ echo "[apps] $*"; }

# Community repo needed for Advanced SSH & Web Terminal (a0d7b954_ssh)
ha addons repositories add https://github.com/hassio-addons/repository 2>/dev/null || true

# slug list: File Editor, Advanced SSH & Web Terminal, Mosquitto, Samba
APPS=(
  core_configurator      # File Editor
  a0d7b954_ssh           # Advanced SSH & Web Terminal (community)
  core_mosquitto         # Mosquitto broker
  core_samba             # Samba share
)

for slug in "${APPS[@]}"; do
  say "installing $slug ..."
  if ha addons install "$slug" 2>/dev/null; then
    ha addons start "$slug" 2>/dev/null && say "$slug started"
  else
    say "WARN: could not install $slug (already installed, or repo/slug differs)"
  fi
done
say "done. Configure add-on options (e.g. SSH auth) in Settings > Add-ons."
