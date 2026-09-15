#!/bin/bash
cd "/home/krishna/ai-work-space/ai-coworker/Livekit Clone/aetos-voice/core"
V=~/.aetos/venvs/aetos-core@2.0.0/bin

echo "=== seed owner ==="
PYTHONPATH=. $V/python3.12 -m aetos_core seed-owner --email raamaak@outlook.com --tenant default --name "Ramsay"

echo "=== restart core ==="
for p in $(pgrep -f "[u]vicorn aetos_core.main:app"); do kill "$p" 2>/dev/null; done
sleep 2
cd ~
setsid nohup $V/uvicorn aetos_core.main:app --host 0.0.0.0 --port 8100 \
  > /tmp/aetos-core.log 2>&1 < /dev/null &
sleep 6
tail -5 /tmp/aetos-core.log

echo "=== route inventory ==="
curl -s http://localhost:8100/api/v1/openapi.json | $V/python3.12 -c "
import sys, json
d = json.load(sys.stdin)
ps = sorted(d['paths'])
print('paths:', len(ps))
for p in ps:
    print('  ', p)
"
