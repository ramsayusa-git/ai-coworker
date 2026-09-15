#!/bin/bash
# Agent versioning + asset upload. Assertions, not a smoke test.
B=http://localhost:8100/api/v1
J=~/.aetos/venvs/aetos-core@2.0.0/bin/python3.12
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then printf '  PASS  %-44s %s\n' "$1" "$3"; pass=$((pass+1));
        else printf '  FAIL  %-44s expected %s got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

T=$(curl -s -X POST "$B/auth/login" -H 'content-type: application/json' \
  --data-binary '{"email":"raamaak@outlook.com","password":"L@Suseelarao@1"}' \
  | $J -c "import json,sys;print(json.load(sys.stdin)['access'])")
H="Authorization: Bearer $T"
AID=$(curl -s -H "$H" "$B/agents" | $J -c "import json,sys;print(json.load(sys.stdin)[0]['id'])")
echo "agent: $AID"

GOOD='{"graph":{"nodes":[
 {"id":"n1","type":"entry","x":60,"y":150,"config":{}},
 {"id":"n2","type":"stt","x":250,"y":150,"config":{"component":"stt-mock","language":"en"}},
 {"id":"n3","type":"llm","x":440,"y":150,"config":{"component":"fast"}},
 {"id":"n4","type":"tts","x":630,"y":150,"config":{"component":"tts-mock","voice":"tone"}}],
 "edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"},{"from":"n3","to":"n4"}]},
 "prompt":"v1 prompt","tools":["transfer_call"],"note":"first","publish":true}'

BAD='{"graph":{"nodes":[{"id":"x1","type":"stt","x":0,"y":0,"config":{}}],"edges":[]},
 "prompt":"","tools":[],"note":"broken","publish":true}'

echo; echo "=== compile validates without saving ==="
chk "valid graph compiles" 200 "$(curl -s -o /tmp/c.json -w '%{http_code}' -X POST -H "$H" \
  -H 'content-type: application/json' --data-binary "$GOOD" "$B/agents/$AID/compile")"
chk "compile reports valid" "True" "$($J -c "import json;print(json.load(open('/tmp/c.json'))['valid'])")"
chk "pipeline flattened" "stt-mock" "$($J -c "import json;print(json.load(open('/tmp/c.json'))['pipeline']['stt'])")"

curl -s -o /tmp/b.json -X POST -H "$H" -H 'content-type: application/json' \
  --data-binary "$BAD" "$B/agents/$AID/compile" >/dev/null
chk "invalid graph flagged" "False" "$($J -c "import json;print(json.load(open('/tmp/b.json'))['valid'])")"
chk "problems carry node id" "x1" "$($J -c "
import json; p=json.load(open('/tmp/b.json'))['problems']
print(next((x.get('node') for x in p if x.get('node')), 'none'))")"

echo; echo "=== publishing a broken graph is refused ==="
chk "publish invalid -> 422" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$H" \
  -H 'content-type: application/json' --data-binary "$BAD" "$B/agents/$AID/versions")"

echo; echo "=== save + publish v1 ==="
chk "create version" 201 "$(curl -s -o /tmp/v1.json -w '%{http_code}' -X POST -H "$H" \
  -H 'content-type: application/json' --data-binary "$GOOD" "$B/agents/$AID/versions")"
V1=$($J -c "import json;print(json.load(open('/tmp/v1.json'))['id'])")
chk "status published" "published" "$($J -c "import json;print(json.load(open('/tmp/v1.json'))['status'])")"
chk "agent pipeline updated" "tts-mock" "$(curl -s -H "$H" "$B/agents/$AID" | $J -c "import json,sys;print(json.load(sys.stdin)['pipeline']['tts'])")"

echo; echo "=== v2 with a changed provider ==="
V2BODY=$(echo "$GOOD" | sed 's/tts-mock/tts-piper/; s/"first"/"swap tts"/; s/v1 prompt/v2 prompt/')
chk "create v2" 201 "$(curl -s -o /tmp/v2.json -w '%{http_code}' -X POST -H "$H" \
  -H 'content-type: application/json' --data-binary "$V2BODY" "$B/agents/$AID/versions")"
V2=$($J -c "import json;print(json.load(open('/tmp/v2.json'))['id'])")
chk "version number increments" 2 "$($J -c "import json;print(json.load(open('/tmp/v2.json'))['version'])")"
chk "live pipeline now piper" "tts-piper" "$(curl -s -H "$H" "$B/agents/$AID" | $J -c "import json,sys;print(json.load(sys.stdin)['pipeline']['tts'])")"

echo; echo "=== diff ==="
curl -s -o /tmp/d.json -H "$H" "$B/agents/$AID/versions/$V2/diff" >/dev/null
chk "diff from v1 to v2" "1->2" "$($J -c "
import json; d=json.load(open('/tmp/d.json')); print(f\"{d['from']}->{d['to']}\")")"
chk "tts change detected" "tts-piper" "$($J -c "
import json; d=json.load(open('/tmp/d.json'))
print(next((c['to'] for c in d['changes'] if c['field']=='pipeline.tts'), 'none'))")"
chk "prompt change detected" "prompt" "$($J -c "
import json; d=json.load(open('/tmp/d.json'))
print(next((c['field'] for c in d['changes'] if c['field']=='prompt'), 'none'))")"

echo; echo "=== rollback ==="
chk "rollback to v1" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$H" \
  "$B/agents/$AID/versions/$V1/rollback")"
chk "pipeline restored" "tts-mock" "$(curl -s -H "$H" "$B/agents/$AID" | $J -c "import json,sys;print(json.load(sys.stdin)['pipeline']['tts'])")"
chk "only one published" 1 "$(curl -s -H "$H" "$B/agents/$AID/versions" | $J -c "
import json,sys; print(sum(1 for v in json.load(sys.stdin) if v['status']=='published'))")"

echo; echo "=== designer reopens on the saved graph ==="
chk "latest returns graph" 200 "$(curl -s -o /tmp/l.json -w '%{http_code}' -H "$H" "$B/agents/$AID/versions/latest")"
chk "graph has 4 nodes" 4 "$($J -c "import json;print(len(json.load(open('/tmp/l.json'))['graph']['nodes']))")"

echo; echo "=== asset upload ==="
printf '\x89PNG\r\n\x1a\n' > /tmp/t.png; head -c 200 /dev/urandom >> /tmp/t.png
chk "png accepted" 200 "$(curl -s -o /tmp/a.json -w '%{http_code}' -X POST -H "$H" \
  -F "file=@/tmp/t.png" "$B/branding/assets?kind=logo")"
URL=$($J -c "import json;print(json.load(open('/tmp/a.json')).get('url',''))" 2>/dev/null)
chk "asset served back" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8100$URL")"

echo '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' > /tmp/bad.svg
chk "scripted svg rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$H" \
  -F "file=@/tmp/bad.svg" "$B/branding/assets?kind=logo")"

echo '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>' > /tmp/ok.svg
chk "clean svg accepted" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$H" \
  -F "file=@/tmp/ok.svg" "$B/branding/assets?kind=logo")"

head -c 300 /dev/urandom > /tmp/t.bin
chk "unknown type rejected" 415 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$H" \
  -F "file=@/tmp/t.bin" "$B/branding/assets?kind=logo")"
chk "bad kind rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$H" \
  -F "file=@/tmp/t.png" "$B/branding/assets?kind=evil")"
chk "path traversal blocked" 404 "$(curl -s -o /dev/null -w '%{http_code}' \
  "$B/assets/ten_default/..%2f..%2f..%2fetc%2fpasswd")"

rm -f /tmp/t.png /tmp/bad.svg /tmp/ok.svg /tmp/t.bin /tmp/[abcdlv]*.json
echo; echo "================ $pass passed, $fail failed ================"
[ "$fail" -eq 0 ] || exit 1
