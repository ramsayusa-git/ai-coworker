#!/bin/bash
# Add more components to the v4 seed + make the dashboard EDITABLE (storage mode).
set -u
BASE=/home/krishna/aetos-build; SEED=$BASE/v4-config-seed
WWW="$SEED/www/community"; CC="$SEED/custom_components"; ST="$SEED/.storage"; TH="$SEED/themes"
PKG=$BASE/os/buildroot-external/package/hassio
mkdir -p "$WWW" "$CC" "$ST" "$TH"
python3 -c "import yaml" 2>/dev/null || pip install --break-system-packages -q pyyaml 2>/dev/null
api(){ curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$1/releases/latest" 2>/dev/null; }

echo "== new cards =="
card(){ local slug="$1" name="$2" u d="$WWW/$2"; u=$(api "$slug"|grep -oE 'https[^"]+\.js'|head -1); if [ -n "$u" ]; then mkdir -p "$d"; curl -fsSL "$u" -o "$d/$(basename "$u")" && echo "  $name ok"; else for b in main master; do for p in "$name.js" "dist/$name.js"; do curl -fsSL "https://raw.githubusercontent.com/$slug/$b/$p" -o "$d/$(basename "$p")" 2>/dev/null && { mkdir -p "$d"; echo "  $name raw ok"; break 2; }; done; done; fi; }
card vineetchoudhary/lovelace-unavailable-entity-card unavailable-entity-card
card djdevil/AlertTicker-Card alert-ticker-card
# still-missing from before
card nervetattack/lovelace-banner-card banner-card
card junalmeida/minimalistic-area-card minimalistic-area-card

echo "== new integrations =="
integ(){ local slug="$1" tmp; tmp=$(mktemp -d); if git clone --depth 1 -q "https://github.com/$slug" "$tmp" 2>/dev/null; then if [ -d "$tmp/custom_components" ]; then cp -r "$tmp"/custom_components/* "$CC"/ && echo "  $slug ok"; else echo "  $slug no custom_components"; fi; else echo "  $slug clone FAIL"; fi; rm -rf "$tmp"; }
integ valentinfrlch/ha-llmvision
integ make-all/tuya-local
integ homeassistant-ai/ha-mcp

echo "== add-on repo URLs (offline note; install needs internet) =="
cat > "$SEED/aetos-addon-repositories.txt" <<EOF
https://github.com/brenner-tobias/ha-addons
https://github.com/blakeblackshear/frigate-hass-addons
https://github.com/netbirdio/addon-netbird
https://github.com/einschmidt/hassio-addons
https://github.com/Ferdinand99/home-assistant-newt-addon
https://github.com/AppDaemon/appdaemon
EOF
echo "  recorded $(wc -l < "$SEED/aetos-addon-repositories.txt") repos"

echo "== regenerate lovelace resources =="
python3 - "$WWW" "$ST" <<'PY'
import os,sys,json
www,st=sys.argv[1],sys.argv[2]; items=[]; i=0
for d,_,fs in os.walk(www):
  for f in fs:
    if f.endswith('.js'):
      i+=1; rel=os.path.relpath(os.path.join(d,f),www)
      items.append({"id":str(i),"type":"module","url":f"/local/community/{rel}"})
json.dump({"version":1,"minor_version":1,"key":"lovelace_resources","data":{"items":items}}, open(os.path.join(st,"lovelace_resources"),"w"))
print("  resources:",len(items))
PY

echo "== dashboard -> STORAGE mode (EDITABLE via UI) =="
python3 - <<'PY'
import yaml,json
SEED="/home/krishna/aetos-build/v4-config-seed"; ST=SEED+"/.storage"
cfg=yaml.safe_load(open("/home/krishna/projects/Aetos-build/aetosone-dashboard.yaml"))
dash={"version":1,"minor_version":1,"key":"lovelace.aetos_one",
      "data":{"config":{"title":cfg.get("title","Aetos One"),"views":cfg["views"]}}}
json.dump(dash, open(ST+"/lovelace.aetos_one","w"))
reg={"version":1,"minor_version":1,"key":"lovelace_dashboards","data":{"items":[
  {"id":"aetos_one","url_path":"aetos-one","mode":"storage","title":"Aetos One",
   "icon":"mdi:shield-crown","show_in_sidebar":True,"require_admin":False}]}}
json.dump(reg, open(ST+"/lovelace_dashboards","w"))
print("  storage dashboard written -> editable in UI")
PY

echo "== configuration.yaml (no yaml-mode lovelace; dashboard stays editable; v7.3 = no SSL) =="
cat > "$SEED/configuration.yaml" <<'YAML'
default_config:

# Aetos One: rebrand 'Home Assistant' -> 'Aetos One' in Supervisor/Core notifications.
aetos_rebrand:

# Aetos One: keep Core/OS/Supervisor updates disabled (no update UI, no notifications).
aetos_no_update:

homeassistant:
  packages: !include_dir_named packages

frontend:
  themes: !include_dir_merge_named themes

# SSL/HTTPS removed for v7.3 — Aetos One serves plain HTTP on :8123.
# (Add TLS later via a reverse proxy or Nabu Casa if needed; do not bake a self-signed cert.)
YAML

echo "== rebuild seed tar =="
tar cf "$PKG/aetos-seed.tar" -C "$SEED" .
echo "  seed tar: $(du -h "$PKG/aetos-seed.tar" | cut -f1)"
echo "  cards: $(find "$WWW" -name '*.js' | wc -l)  integrations: $(ls "$CC" | wc -l)"
echo "== SEED UPDATE DONE =="
