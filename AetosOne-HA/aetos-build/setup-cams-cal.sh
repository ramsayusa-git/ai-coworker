#!/bin/sh
B=http://localhost:8123
TOK=$(cat /tmp/aetos_token)
api() { curl -s -H "Authorization: Bearer $TOK" "$@"; }

mkcam() { # $1=name $2=file
  FID=$(api -X POST $B/api/config/config_entries/flow -H "Content-Type: application/json" \
    -d '{"handler":"local_file","show_advanced_options":false}' \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('flow_id',''))" 2>/dev/null)
  api -X POST $B/api/config/config_entries/flow/$FID -H "Content-Type: application/json" \
    -d "{\"name\":\"$1\",\"file_path\":\"$2\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('cam',d.get('type'),d.get('title',d.get('errors','')))" 2>/dev/null
}
echo "=== local_file cameras ==="
mkcam "Front door cam" /config/www/cam_front.jpg
mkcam "Garden cam" /config/www/cam_garden.jpg
mkcam "Garage cam" /config/www/cam_garage.jpg
mkcam "Living cam" /config/www/cam_living.jpg

echo "=== generic streaming camera (video) ==="
GID=$(api -X POST $B/api/config/config_entries/flow -H "Content-Type: application/json" \
  -d '{"handler":"generic","show_advanced_options":false}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('flow_id',''))" 2>/dev/null)
echo "generic flow: $GID"
api -X POST $B/api/config/config_entries/flow/$GID -H "Content-Type: application/json" \
  -d '{"still_image_url":"","stream_source":"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8","rtsp_transport":"tcp","framerate":25,"verify_ssl":true}' \
  | head -c 400
echo ""

echo "=== calendar sample events ==="
for ev in \
  '{"summary":"Team standup","start_date_time":"2026-07-29 09:30:00","end_date_time":"2026-07-29 10:00:00"}' \
  '{"summary":"HVAC filter change","start_date_time":"2026-07-30 14:00:00","end_date_time":"2026-07-30 15:00:00"}' \
  '{"summary":"Security review","start_date_time":"2026-07-31 16:00:00","end_date_time":"2026-07-31 17:00:00"}' ; do
  api -X POST "$B/api/services/calendar/create_event?return_response" -H "Content-Type: application/json" \
    -d "{\"entity_id\":\"calendar.aetos_calendar\",$(echo $ev | sed 's/^{//')" -o /dev/null -w "event: %{http_code}\n"
done
