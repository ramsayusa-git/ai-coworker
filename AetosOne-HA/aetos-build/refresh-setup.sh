#!/bin/sh
B=http://localhost:8123
CID="$B/"
J=/tmp/aetos_cj; rm -f $J
FLOW=$(curl -s -c $J -X POST $B/auth/login_flow -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$CID\",\"handler\":[\"homeassistant\",null],\"redirect_uri\":\"$CID\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['flow_id'])")
CODE=$(curl -s -b $J -c $J -X POST $B/auth/login_flow/$FLOW -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$CID\",\"username\":\"admin\",\"password\":\"Suseelarao@1\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('result',''))")
TOK=$(curl -s -X POST $B/auth/token -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=$CODE&client_id=$CID" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
[ -z "$TOK" ] && { echo "TOKEN FAIL"; exit 1; }
echo "token OK"; echo "$TOK" > /tmp/aetos_token
api() { curl -s -H "Authorization: Bearer $TOK" "$@"; }

echo "=== calendar events ==="
api -X POST $B/api/services/calendar/create_event -H "Content-Type: application/json" \
  -d '{"entity_id":"calendar.aetos_calendar","summary":"Team standup","start_date_time":"2026-07-29 09:30:00","end_date_time":"2026-07-29 10:00:00"}' -o /dev/null -w "e1:%{http_code}\n"
api -X POST $B/api/services/calendar/create_event -H "Content-Type: application/json" \
  -d '{"entity_id":"calendar.aetos_calendar","summary":"HVAC filter change","start_date_time":"2026-07-30 14:00:00","end_date_time":"2026-07-30 15:00:00"}' -o /dev/null -w "e2:%{http_code}\n"
api -X POST $B/api/services/calendar/create_event -H "Content-Type: application/json" \
  -d '{"entity_id":"calendar.aetos_calendar","summary":"Security review","start_date_time":"2026-07-31 16:00:00","end_date_time":"2026-07-31 17:00:00"}' -o /dev/null -w "e3:%{http_code}\n"

echo "=== generic streaming camera ==="
GID=$(api -X POST $B/api/config/config_entries/flow -H "Content-Type: application/json" \
  -d '{"handler":"generic","show_advanced_options":false}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('flow_id',''))" 2>/dev/null)
echo "flow: $GID"
api -X POST $B/api/config/config_entries/flow/$GID -H "Content-Type: application/json" \
  -d '{"still_image_url":"","stream_source":"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8","rtsp_transport":"tcp","framerate":25,"verify_ssl":true}' | head -c 500
echo ""
