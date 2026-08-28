#!/bin/sh
# Runs on HAOS host. Logs in as admin, mints a token, creates a Local Calendar.
B=http://localhost:8123
CID="$B/"
J=/tmp/aetos_cj
rm -f $J

FLOW=$(curl -s -c $J -X POST $B/auth/login_flow -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$CID\",\"handler\":[\"homeassistant\",null],\"redirect_uri\":\"$CID\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['flow_id'])" 2>/dev/null)
echo "login flow: $FLOW"

CODE=$(curl -s -b $J -c $J -X POST $B/auth/login_flow/$FLOW -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$CID\",\"username\":\"admin\",\"password\":\"Suseelarao@1\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('result',''))" 2>/dev/null)
echo "auth code: ${CODE:0:8}..."

TOKEN=$(curl -s -X POST $B/auth/token -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=$CODE&client_id=$CID" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then echo "TOKEN FAILED"; exit 1; fi
echo "token OK (${#TOKEN} chars)"
echo "$TOKEN" > /tmp/aetos_token

echo "=== existing weather/calendar entities ==="
curl -s -H "Authorization: Bearer $TOKEN" $B/api/states | tr "{" "\n" | grep -oE '"entity_id": "(weather|calendar|sun)[^"]*"' | head

echo "=== create Local Calendar ==="
CF=$(curl -s -X POST $B/api/config/config_entries/flow -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"handler":"local_calendar","show_advanced_options":false}')
FID=$(echo "$CF" | python3 -c "import sys,json;print(json.load(sys.stdin).get('flow_id',''))" 2>/dev/null)
echo "cal flow: $FID"
if [ -n "$FID" ]; then
  curl -s -X POST $B/api/config/config_entries/flow/$FID -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"calendar_name":"Aetos Calendar"}' | head -c 200
  echo ""
else
  echo "calendar flow start failed: $(echo $CF | head -c 200)"
fi
