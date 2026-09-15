#!/bin/bash
# The new console sections, exercised for real: create, read back, reject the
# bad input, and clean up. Idempotent — it removes its own fixtures first.
B=http://localhost:8100/api/v1
J=~/.aetos/venvs/aetos-core@2.0.0/bin/python3.12
EMAIL=${LATTICE_TEST_EMAIL:-raamaak@outlook.com}
PASS_=${LATTICE_TEST_PASSWORD:-'L@Suseelarao@1'}

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then printf '  PASS  %-46s %s\n' "$1" "$3"; pass=$((pass+1));
        else printf '  FAIL  %-46s expected %s got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi }
code() { curl -s -o /tmp/sec.json -w '%{http_code}' "$@"; }
val() { $J -c "import json,sys;d=json.load(open('/tmp/sec.json'));print(eval(sys.argv[1],{'d':d}))" "$1"; }

T=$(curl -s -X POST "$B/auth/login" -H 'content-type: application/json' \
      --data-binary "{\"email\":\"$EMAIL\",\"password\":\"$PASS_\"}" \
    | $J -c "import json,sys;print(json.load(sys.stdin).get('access',''))")
[ -z "$T" ] && { echo "login failed"; exit 1; }
H="Authorization: Bearer $T"
JS='content-type: application/json'

# Fixtures from a previous run would collide on the unique (tenant, name)
# constraints, so clear them by name before anything else.
cleanup() {
  for path in rooms tools knowledge-bases; do
    curl -s -H "$H" "$B/$path" \
      | $J -c "import json,sys;print(' '.join(x['id'] for x in json.load(sys.stdin) if x['name'].startswith('zz-test')))" \
      | tr ' ' '\n' | while read -r id; do
          [ -n "$id" ] && curl -s -o /dev/null -X DELETE -H "$H" "$B/$path/$id"
        done
  done
  for path in reports notes; do
    curl -s -H "$H" "$B/$path" \
      | $J -c "import json,sys;print(' '.join(x['id'] for x in json.load(sys.stdin) if (x.get('name') or x.get('title','')).startswith('zz-test')))" \
      | tr ' ' '\n' | while read -r id; do
          [ -n "$id" ] && curl -s -o /dev/null -X DELETE -H "$H" "$B/$path/$id"
        done
  done
}
cleanup

echo "=== rooms ==="
chk "list rooms"            200 "$(code -H "$H" "$B/rooms")"
chk "create room"           201 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-room","kind":"voice"}' "$B/rooms")"
RID=$(val "d['id']")
chk "duplicate name -> 409" 409 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-room"}' "$B/rooms")"
chk "get room"              200 "$(code -H "$H" "$B/rooms/$RID")"
chk "patch room"            200 "$(code -X PATCH -H "$H" -H "$JS" -d '{"max_participants":24}' "$B/rooms/$RID")"
chk "patch applied"          24 "$(val "d['max_participants']")"
chk "close room"            200 "$(code -X POST -H "$H" "$B/rooms/$RID/close")"
chk "status closed"    "closed" "$(val "d['status']")"
chk "unknown room -> 404"   404 "$(code -H "$H" "$B/rooms/rm_doesnotexist")"

echo; echo "=== tools ==="
chk "list tools"            200 "$(code -H "$H" "$B/tools")"
chk "non-http url rejected" 400 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-bad","kind":"http","url":"file:///etc/passwd"}' "$B/tools")"
chk "http tool with no url" 400 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-bad2","kind":"http"}' "$B/tools")"
chk "create tool"           201 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-tool","kind":"http","url":"https://example.com/hook","method":"post"}' "$B/tools")"
TID=$(val "d['id']")
chk "method upper-cased"   POST "$(val "d['method']")"
chk "patch tool"            200 "$(code -X PATCH -H "$H" -H "$JS" -d '{"enabled":false}' "$B/tools/$TID")"
chk "delete tool"           204 "$(code -X DELETE -H "$H" "$B/tools/$TID")"

echo; echo "=== knowledge base ==="
chk "overlap >= size -> 400" 400 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-bad-kb","chunk_size":200,"chunk_overlap":200}' "$B/knowledge-bases")"
chk "create kb"             201 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-kb","chunk_size":100,"chunk_overlap":20}' "$B/knowledge-bases")"
KID=$(val "d['id']")
chk "empty document -> 400" 400 "$(code -X POST -H "$H" -H "$JS" -d '{"title":"zz","source":"text","content":""}' "$B/knowledge-bases/$KID/documents")"
chk "add document"          201 "$(code -X POST -H "$H" -H "$JS" -d "{\"title\":\"zz-test-doc\",\"source\":\"text\",\"content\":\"$(printf 'x%.0s' $(seq 1 500))\"}" "$B/knowledge-bases/$KID/documents")"
DID=$(val "d['id']")
# 500 chars, size 100, overlap 20 -> step 80; 20 + 6*80 = 500, so six windows
# cover it exactly. Assert the number the indexer will really produce.
chk "chunked"                 6 "$(val "d['chunks']")"
chk "indexed"         "indexed" "$(val "d['status']")"
chk "doc count on kb"       200 "$(code -H "$H" "$B/knowledge-bases/$KID")"
chk "kb doc_count is 1"       1 "$(val "d['doc_count']")"
chk "reindex"               200 "$(code -X POST -H "$H" "$B/knowledge-bases/$KID/reindex")"
chk "delete document"       204 "$(code -X DELETE -H "$H" "$B/knowledge-bases/$KID/documents/$DID")"
chk "delete kb"             204 "$(code -X DELETE -H "$H" "$B/knowledge-bases/$KID")"

echo; echo "=== reports ==="
chk "bad kind -> 400"       400 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-bad","kind":"nonsense"}' "$B/reports")"
chk "bad window -> 400"     400 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-bad","kind":"calls","window":"1y"}' "$B/reports")"
chk "create report"         201 "$(code -X POST -H "$H" -H "$JS" -d '{"name":"zz-test-report","kind":"calls","window":"7d"}' "$B/reports")"
PID_=$(val "d['id']")
chk "run report"            200 "$(code -X POST -H "$H" "$B/reports/$PID_/run")"
chk "run has totals"       True "$(val "'totals' in d")"
chk "delete report"         204 "$(code -X DELETE -H "$H" "$B/reports/$PID_")"

echo; echo "=== notes ==="
chk "bad category -> 400"   400 "$(code -X POST -H "$H" -H "$JS" -d '{"title":"zz-test-bad","category":"nope"}' "$B/notes")"
chk "create note"           201 "$(code -X POST -H "$H" -H "$JS" -d '{"title":"zz-test-note","category":"runbook","body":"restart the trunk"}' "$B/notes")"
NID=$(val "d['id']")
chk "get note"              200 "$(code -H "$H" "$B/notes/$NID")"
chk "delete note"           204 "$(code -X DELETE -H "$H" "$B/notes/$NID")"

echo; echo "=== chats & recordings ==="
chk "list chats"            200 "$(code -H "$H" "$B/chats")"
chk "list recordings"       200 "$(code -H "$H" "$B/recordings")"
chk "recording needs a target" 400 "$(code -X POST -H "$H" -H "$JS" -d '{}' "$B/recordings")"
SID=$(curl -s -H "$H" "$B/sessions?limit=1" | $J -c "import json,sys;d=json.load(sys.stdin)['items'];print(d[0]['id'] if d else '')")
if [ -n "$SID" ]; then
  chk "start recording"     201 "$(code -X POST -H "$H" -H "$JS" -d "{\"session_id\":\"$SID\",\"kind\":\"audio\"}" "$B/recordings")"
  RECID=$(val "d['id']")
  chk "stop recording"      200 "$(code -X POST -H "$H" "$B/recordings/$RECID/stop")"
  chk "stopping twice -> 409" 409 "$(code -X POST -H "$H" "$B/recordings/$RECID/stop")"
  chk "delete recording"    204 "$(code -X DELETE -H "$H" "$B/recordings/$RECID")"
fi

echo; echo "=== settings groups ==="
chk "group index"           200 "$(code -H "$H" "$B/settings")"
for g in server security email storage finance mcp; do
  chk "get $g"              200 "$(code -H "$H" "$B/settings/$g")"
done
chk "unknown group -> 404"  404 "$(code -H "$H" "$B/settings/nope")"
chk "unknown key rejected"  400 "$(code -X PUT -H "$H" -H "$JS" -d '{"value":{"not_a_setting":1}}' "$B/settings/server")"
chk "wrong type rejected"   400 "$(code -X PUT -H "$H" -H "$JS" -d '{"value":{"max_concurrent_calls":"lots"}}' "$B/settings/server")"
chk "save server settings"  200 "$(code -X PUT -H "$H" -H "$JS" -d '{"value":{"timezone":"Australia/Sydney","max_concurrent_calls":75}}' "$B/settings/server")"
chk "value persisted"        75 "$(code -H "$H" "$B/settings/server" >/dev/null; val "d['value']['max_concurrent_calls']")"
# A secret must never come back, only a flag saying whether it is set.
chk "smtp password set"     200 "$(code -X PUT -H "$H" -H "$JS" -d '{"value":{"smtp_host":"smtp.example.com","smtp_password":"s3cr3t"}}' "$B/settings/email")"
chk "secret not echoed"    True "$(val "'smtp_password' not in d['value']")"
chk "secret flagged set"   True "$(val "d['value']['smtp_password_set']")"
chk "empty secret keeps it" 200 "$(code -X PUT -H "$H" -H "$JS" -d '{"value":{"smtp_password":""}}' "$B/settings/email")"
chk "still set"            True "$(val "d['value']['smtp_password_set']")"

echo; echo "=== dependencies ==="
chk "dependency inventory"  200 "$(code -H "$H" "$B/system/dependencies")"
chk "fastapi found"        True "$(val "any(p['name']=='fastapi' and p['status']=='installed' for p in d['packages'])")"

echo
echo "================ $pass passed, $fail failed ================"
[ "$fail" -eq 0 ] || exit 1
