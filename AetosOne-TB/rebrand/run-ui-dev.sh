#!/usr/bin/env bash
# Start the Angular dev server for the Aetos One Cloud UI on http://localhost:4200
# (hot-reloads branding changes; proxies /api and /ws to the backend on :8080)
set -euo pipefail

UI="/run/media/krishna/data-backup/claude-cowork/AetosOne-TB/thingsboard/ui-ngx"
# use the Node that the Maven build downloaded, so versions match CI
export PATH="$UI/target/node:$PATH"

cd "$UI"
# 4 GB, not the upstream 8 GB: this box has 15 GB total and the platform JVM takes
# ~3 GB, so an 8 GB heap cap lets the watcher grow until the OOM killer takes it.
exec node --max_old_space_size=4096 ./node_modules/@angular/cli/bin/ng serve \
  --configuration development --host 0.0.0.0 --port 4200
