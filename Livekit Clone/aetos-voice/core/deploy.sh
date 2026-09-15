#!/bin/bash
# Sync the working source into the aetosd venv snapshot and restart Core.
#
# aetosd installs each component as an *editable* install pointing at a
# per-version snapshot under ~/.aetos/venvs/<name>@<version>/src. Editing the
# repo alone therefore changes nothing that is actually running — this script
# is what closes that gap during development.
set -e
SRC="/home/krishna/ai-work-space/ai-coworker/Livekit Clone/aetos-voice/core/aetos_core"
DST=~/.aetos/venvs/aetos-core@2.0.0/src/aetos_core
V=~/.aetos/venvs/aetos-core@2.0.0/bin

echo "=== sync source -> snapshot ==="
rsync -a --delete --exclude '__pycache__' "$SRC/" "$DST/"
ls "$DST" | tr '\n' ' '; echo

echo "=== restart core ==="
for p in $(pgrep -f "[u]vicorn aetos_core.main:app"); do kill "$p" 2>/dev/null || true; done
sleep 2
cd ~
setsid nohup $V/uvicorn aetos_core.main:app --host 0.0.0.0 --port 8100 \
  > /tmp/aetos-core.log 2>&1 < /dev/null &
sleep 6
tail -6 /tmp/aetos-core.log

echo "=== routes ==="
curl -s http://localhost:8100/api/v1/openapi.json | $V/python3.12 -c "
import sys, json
d = json.load(sys.stdin)
ps = sorted(d['paths'])
print('paths:', len(ps))
for p in ps: print('  ', p)
"
