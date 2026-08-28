#!/bin/sh
# Runs on HAOS host. Downloads HACS + 3 Lovelace card bundles into /config via the HA container.
DEX="docker exec homeassistant"
echo "=== free space on /config ==="
$DEX df -h /config 2>&1 | tail -1

$DEX sh -c 'mkdir -p /config/custom_components /config/www/community/mushroom /config/www/community/mini-graph-card /config/www/community/button-card'

echo "=== download + unzip HACS ==="
$DEX python3 - <<'PY'
import urllib.request, zipfile, io, os, ssl
url="https://github.com/hacs/integration/releases/latest/download/hacs.zip"
try:
    data=urllib.request.urlopen(url, timeout=60).read()
    dest="/config/custom_components/hacs"
    os.makedirs(dest, exist_ok=True)
    zipfile.ZipFile(io.BytesIO(data)).extractall(dest)
    print("HACS extracted:", len(os.listdir(dest)), "entries", "-", round(len(data)/1e6,1), "MB")
except Exception as e:
    print("HACS ERR", repr(e))
PY

echo "=== download card bundles ==="
$DEX python3 - <<'PY'
import urllib.request
cards={
 "/config/www/community/mushroom/mushroom.js":"https://github.com/piitaya/lovelace-mushroom/releases/latest/download/mushroom.js",
 "/config/www/community/mini-graph-card/mini-graph-card-bundle.js":"https://github.com/kalkih/mini-graph-card/releases/latest/download/mini-graph-card-bundle.js",
 "/config/www/community/button-card/button-card.js":"https://github.com/custom-cards/button-card/releases/latest/download/button-card.js",
}
for path,url in cards.items():
    try:
        d=urllib.request.urlopen(url, timeout=60).read()
        open(path,"wb").write(d)
        print("OK", path.split("/")[-1], round(len(d)/1024,1), "KB")
    except Exception as e:
        print("ERR", path, repr(e))
PY
echo "=== result tree ==="
$DEX sh -c 'ls /config/custom_components/hacs | head -3; echo ---; find /config/www/community -name "*.js" -exec ls -la {} \;'
