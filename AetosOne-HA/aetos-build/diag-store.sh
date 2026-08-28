#!/bin/sh
echo "=== supervisor info (connectivity/channel/version) ==="
docker exec hassio_cli ha supervisor info 2>&1 | grep -iE "connectivity|channel|^version|version_latest|healthy|supported" | head
echo "=== network info connectivity ==="
docker exec hassio_cli ha network info 2>&1 | grep -iE "connectivity|internet|host_internet|supervisor_internet" | head
echo "=== resolution issues ==="
docker exec hassio_cli ha resolution info 2>&1 | grep -iE "store|internet|fatal|unhealthy|connectivity" | head -20
echo "=== connectivity check reachability from supervisor ==="
docker exec hassio_supervisor python3 -c "import socket; print('checkonline', socket.gethostbyname('checkonline.home-assistant.io'))" 2>&1
docker exec hassio_supervisor python3 -c "import urllib.request as u; print('checkonline HTTP', u.urlopen('https://checkonline.home-assistant.io/online.txt', timeout=6).status)" 2>&1
echo "=== try a store reload (does it recover or say no-internet?) ==="
docker exec hassio_cli ha store reload 2>&1 | head
sleep 4
echo "--- addon count after reload ---"
docker exec hassio_cli ha store addons 2>&1 | grep -c "slug:"
