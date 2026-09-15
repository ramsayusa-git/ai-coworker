#!/bin/bash
# Every endpoint the console screens actually call, exercised as a real signed-in
# owner. A page that renders but whose data call 404s is not "working", so this
# is the check that backs the claim that the internal pages are functional.
B=http://localhost:8100/api/v1
J=~/.aetos/venvs/aetos-core@2.0.0/bin/python3.12
EMAIL=${LATTICE_TEST_EMAIL:-raamaak@outlook.com}
PASS_=${LATTICE_TEST_PASSWORD:-'L@Suseelarao@1'}

pass=0; fail=0
ok() { # ok "screen" "label" expected actual
  if [ "$3" = "$4" ]; then printf '  PASS  %-14s %-42s %s\n' "$1" "$2" "$4"; pass=$((pass+1));
  else printf '  FAIL  %-14s %-42s expected %s got %s\n' "$1" "$2" "$3" "$4"; fail=$((fail+1)); fi
}
code() { curl -s -o /tmp/tc.json -w '%{http_code}' "$@"; }

T=$(curl -s -X POST "$B/auth/login" -H 'content-type: application/json' \
      --data-binary "{\"email\":\"$EMAIL\",\"password\":\"$PASS_\"}" \
    | $J -c "import json,sys;print(json.load(sys.stdin).get('access',''))")
if [ -z "$T" ]; then echo "login failed for $EMAIL — nothing else can pass"; exit 1; fi
H="Authorization: Bearer $T"
echo "signed in as $EMAIL"

echo; echo "=== Dashboard ==="
ok Dashboard "analytics overview"   200 "$(code -H "$H" "$B/analytics/overview?window=24h")"
ok Dashboard "analytics 7d"         200 "$(code -H "$H" "$B/analytics/overview?window=7d")"
ok Dashboard "analytics 30d"        200 "$(code -H "$H" "$B/analytics/overview?window=30d")"
ok Dashboard "system info"          200 "$(code -H "$H" "$B/system/info")"
ok Dashboard "licence"              200 "$(code -H "$H" "$B/licence")"

echo; echo "=== Agents ==="
ok Agents    "list"                 200 "$(code -H "$H" "$B/agents")"
AID=$(curl -s -H "$H" "$B/agents" | $J -c "import json,sys;d=json.load(sys.stdin);print(d[0]['id'] if d else '')")
if [ -n "$AID" ]; then
  ok Agents  "detail"               200 "$(code -H "$H" "$B/agents/$AID")"
  ok Designer "version list"        200 "$(code -H "$H" "$B/agents/$AID/versions")"
  ok Designer "latest version"      200 "$(code -H "$H" "$B/agents/$AID/versions/latest")"
else
  ok Agents  "detail"               200 "no-agents"
fi

echo; echo "=== Sessions ==="
ok Sessions  "list"                 200 "$(code -H "$H" "$B/sessions?limit=25")"
SID=$(curl -s -H "$H" "$B/sessions?limit=1" | $J -c "import json,sys;d=json.load(sys.stdin)['items'];print(d[0]['id'] if d else '')")
if [ -n "$SID" ]; then
  ok Sessions "detail"              200 "$(code -H "$H" "$B/sessions/$SID")"
  # Turns ride along inside the detail payload — there is no separate GET, so
  # the check is that the transcript is actually there for the page to render.
  ok Sessions "detail carries turns" yes \
     "$($J -c "import json;print('yes' if 'turns' in json.load(open('/tmp/tc.json')) else 'no')")"
fi

echo; echo "=== Telephony ==="
ok Telephony "trunks"               200 "$(code -H "$H" "$B/telephony/trunks")"
ok Telephony "numbers"              200 "$(code -H "$H" "$B/telephony/numbers")"
ok Telephony "routing rules"        200 "$(code -H "$H" "$B/telephony/rules")"

echo; echo "=== Components ==="
ok Components "installed"           200 "$(code -H "$H" "$B/components")"
ok Components "store"               200 "$(code -H "$H" "$B/components/store")"

echo; echo "=== Settings ==="
ok Settings  "users"                200 "$(code -H "$H" "$B/users")"
ok Settings  "api keys"             200 "$(code -H "$H" "$B/api-keys")"
ok Settings  "branding"             200 "$(code -H "$H" "$B/branding")"
ok Settings  "branding (public)"    200 "$(code "$B/branding/public")"
ok Settings  "audit log"            200 "$(code -H "$H" "$B/system/audit?n=50")"
ok Settings  "sessions (mine)"      200 "$(code -H "$H" "$B/auth/sessions")"
# Platform surfaces are gated on the ACTIVE tenant, not on holding a platform
# membership somewhere — so refused while the session is on a normal tenant,
# and available after switching. Both halves matter.
ok Settings  "tenants refused off-platform" 403 "$(code -H "$H" "$B/tenants")"
PT=$(curl -s -X POST "$B/auth/switch-tenant" -H "$H" -H 'content-type: application/json' \
       -d '{"tenant_id":"ten_platform"}' \
     | $J -c "import json,sys;print(json.load(sys.stdin).get('access',''))")
if [ -n "$PT" ]; then
  ok Platform "tenants after switch"  200 "$(code -H "Authorization: Bearer $PT" "$B/tenants")"
  ok Platform "component action"       200 "$(code -X POST -H "Authorization: Bearer $PT" "$B/components/tts-mock/restart")"
else
  ok Platform "switch to platform"     ok "failed"
fi

echo
echo "================ $pass passed, $fail failed ================"
[ "$fail" -eq 0 ] || exit 1
