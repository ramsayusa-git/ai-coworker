#!/bin/sh
echo "=== date sanity ==="; date
echo "=== restart supervisor (forces store re-clone) ==="
docker restart hassio_supervisor >/dev/null 2>&1 && echo "restarted"
echo "waiting for supervisor to come up + clone store..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 10
  up=$(docker inspect -f '{{.State.Running}}' hassio_supervisor 2>/dev/null)
  cnt=$(docker exec hassio_cli ha store addons 2>/dev/null | grep -c "slug:")
  echo "  t+$((i*10))s running=$up addons=$cnt"
  [ "$cnt" -gt 0 ] && break
done
echo "=== final store errors (should be none new) ==="
docker logs hassio_supervisor 2>&1 | grep -iE "Loading apps from store|clone|no supervisor internet" | tail -5
