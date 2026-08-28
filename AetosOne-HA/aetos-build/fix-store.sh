#!/bin/sh
echo "=== confirm connectivity check passes now (clock fixed) ==="
docker exec hassio_supervisor python3 -c "import urllib.request as u; print('checkonline HTTP', u.urlopen('https://checkonline.home-assistant.io/online.txt', timeout=8).status)" 2>&1 | tail -1
echo "=== reload store via supervisor API ==="
TOKEN=$(docker exec hassio_supervisor sh -c 'echo $SUPERVISOR_TOKEN')
docker exec hassio_supervisor curl -s -X POST -H "Authorization: Bearer $TOKEN" http://172.30.32.2/store/reload 2>&1 | head -c 300
echo ""
echo "=== also refresh supervisor connectivity + reload updater ==="
docker exec hassio_supervisor curl -s -X POST -H "Authorization: Bearer $TOKEN" http://172.30.32.2/supervisor/reload 2>&1 | head -c 200
echo ""
echo "waiting 25s for git clones..."
sleep 25
echo "=== store addons count ==="
docker exec hassio_supervisor curl -s -H "Authorization: Bearer $TOKEN" http://172.30.32.2/store/addons 2>&1 | grep -o '"slug"' | wc -l
echo "=== store repositories ==="
docker exec hassio_supervisor curl -s -H "Authorization: Bearer $TOKEN" http://172.30.32.2/store/repositories 2>&1 | grep -o '"slug"' | wc -l
echo "=== any remaining store errors in log ==="
docker logs hassio_supervisor 2>&1 | grep -iE "store|clone|internet" | tail -6
