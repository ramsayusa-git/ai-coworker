#!/bin/bash
B=http://localhost:8100/api/v1
J=~/.aetos/venvs/aetos-core@2.0.0/bin/python3.12
T=$(curl -s -X POST "$B/auth/login" -H 'content-type: application/json' \
  --data-binary '{"email":"raamaak@outlook.com","password":"L@Suseelarao@1"}' \
  | $J -c "import json,sys;print(json.load(sys.stdin)['access'])")
H="Authorization: Bearer $T"
AID=$(curl -s -H "$H" "$B/agents" | $J -c "import json,sys;print(json.load(sys.stdin)[0]['id'])")

GOOD='{"graph":{"nodes":[
 {"id":"n1","type":"entry","x":60,"y":150,"config":{}},
 {"id":"n2","type":"stt","x":250,"y":150,"config":{"component":"stt-mock","language":"en"}},
 {"id":"n3","type":"llm","x":440,"y":150,"config":{"component":"fast"}},
 {"id":"n4","type":"tts","x":630,"y":150,"config":{"component":"tts-mock","voice":"tone"}}],
 "edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"},{"from":"n3","to":"n4"}]},
 "prompt":"v1 prompt","tools":["transfer_call"],"note":"first","publish":true}'

echo "=== POST /agents/$AID/versions ==="
curl -s -w '\nstatus=%{http_code}\n' -X POST -H "$H" -H 'content-type: application/json' \
  --data-binary "$GOOD" "$B/agents/$AID/versions" | head -c 1200
echo
echo "=== core log tail ==="
tail -25 /tmp/aetos-core.log
