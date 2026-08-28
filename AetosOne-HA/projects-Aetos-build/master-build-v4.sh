#!/bin/bash
# ================= Aetos One build-v4 master =================
# Frontend (top-menu + shield + footers) -> branded core -> HAOS image with:
#  motd/banner rebrand, HTTPS cert, and /config seed (HACS + cards + integrations
#  + themes + dashboard + lovelace resources). RPi4 (arm64), offline.
set -e
BASE=/home/krishna/aetos-build; FE=$BASE/frontend; OS=$BASE/os
SEED=$BASE/v4-config-seed; PKG=$OS/buildroot-external/package/hassio
WWW="$SEED/www/community"; CC="$SEED/custom_components"; TH="$SEED/themes"; ST="$SEED/.storage"
mkdir -p "$WWW" "$CC" "$TH" "$ST"
api(){ curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$1/releases/latest" 2>/dev/null; }

echo "== [1/8] fetch HACS =="
if [ ! -d "$CC/hacs" ]; then
  u=$(api hacs/integration | grep -oE '"browser_download_url":[^,]*hacs.zip' | grep -oE 'https[^"]+'); \
  if [ -n "$u" ]; then curl -fsSL "$u" -o /tmp/hacs.zip && mkdir -p "$CC/hacs" && (cd "$CC/hacs" && unzip -oq /tmp/hacs.zip) && echo "  HACS ok"; else echo "  HACS FAIL"; fi
fi

echo "== [2/8] fallback cards (raw dist) =="
raw(){ # slug  path  destname
  mkdir -p "$WWW/$3"; if curl -fsSL "https://raw.githubusercontent.com/$1/master/$2" -o "$WWW/$3/$(basename "$2")" 2>/dev/null || curl -fsSL "https://raw.githubusercontent.com/$1/main/$2" -o "$WWW/$3/$(basename "$2")" 2>/dev/null; then echo "  $3 ok"; else echo "  $3 FAIL"; fi; }
[ ! -e "$WWW/banner-card" ] && raw "nervetattack/lovelace-banner-card" "banner-card.js" "banner-card"
[ ! -e "$WWW/alarmo-card/alarmo-card.js" ] && { u=$(api nielsfaber/alarmo-card | grep -oE 'https[^"]+\.js' | head -1); [ -n "$u" ] && mkdir -p "$WWW/alarmo-card" && curl -fsSL "$u" -o "$WWW/alarmo-card/alarmo-card.js" && echo "  alarmo-card ok" || raw "nielsfaber/alarmo-card" "dist/alarmo-card.js" "alarmo-card"; }
[ ! -e "$WWW/minimalistic-area-card/minimalistic-area-card.js" ] && raw "junalmeida/minimalistic-area-card" "dist/minimalistic-area-card.js" "minimalistic-area-card"

echo "== [3/8] themes (best effort) =="
curl -fsSL "https://raw.githubusercontent.com/Nerwyn/material-rounded-theme/main/themes/material_rounded.yaml" -o "$TH/mushroom_round.yaml" 2>/dev/null && echo "  round theme ok" || echo "  round theme skip"

echo "== [4/8] lovelace resources (.storage) =="
python3 - "$WWW" "$ST" <<'PY'
import os,sys,json
www,st=sys.argv[1],sys.argv[2]
items=[]; i=0
for d,_,fs in os.walk(www):
    for f in fs:
        if f.endswith(".js"):
            i+=1; rel=os.path.relpath(os.path.join(d,f),www)
            items.append({"id":str(i),"type":"module","url":f"/local/community/{rel}"})
json.dump({"version":1,"minor_version":1,"key":"lovelace_resources","data":{"items":items}},
          open(os.path.join(st,"lovelace_resources"),"w"))
print(f"  registered {len(items)} resources")
PY

echo "== [5/8] configuration.yaml + dashboard =="
cp /home/krishna/projects/Aetos-build/aetosone-dashboard.yaml "$SEED/aetosone-dashboard.yaml"
cat > "$SEED/configuration.yaml" <<'YAML'
default_config:
frontend:
  themes: !include_dir_merge_named themes
http:
  ssl_certificate: /ssl/aetosone.crt
  ssl_key: /ssl/aetosone.key
lovelace:
  dashboards:
    aetos-one:
      mode: yaml
      title: Aetos One
      icon: mdi:shield-crown
      show_in_sidebar: true
      filename: aetosone-dashboard.yaml
YAML
mkdir -p "$SEED/themes"

echo "== [6/8] motd + SSH banner rebrand =="
sed -i 's/Home Assistant OS/Aetos One OS/; s/Home Assistant CLI/Aetos One CLI/' "$OS/buildroot-external/rootfs-overlay/etc/motd" 2>/dev/null || true
sed -i 's/Home Assistant OS/Aetos One OS/; s/Home Assistant CLI/Aetos One CLI/' "$OS/output/target/etc/motd" 2>/dev/null || true

echo "== [7/8] stage seed into OS tree + create-data-partition =="
tar cf "$PKG/aetos-seed.tar" -C "$SEED" .
DP="$PKG/create-data-partition.sh"
# replace the printf configuration.yaml line with a tar extract of the full seed
python3 - "$DP" <<'PY'
import sys,re
f=sys.argv[1]; s=open(f).read()
old="printf 'default_config:\\\\nhttp:\\\\n  ssl_certificate: /ssl/aetosone.crt\\\\n  ssl_key: /ssl/aetosone.key\\\\n' > \"${data_dir}/supervisor/homeassistant/configuration.yaml\""
new='tar xf /build/buildroot-external/package/hassio/aetos-seed.tar -C "${data_dir}/supervisor/homeassistant"'
if old in s:
    s=s.replace(old,new); open(f,'w').write(s); print("  create-data-partition -> full seed extract")
elif 'aetos-seed.tar' in s:
    print("  already seeds full tree")
else:
    print("  WARN: anchor not found; leaving as-is")
PY

echo "== [8/8] BUILD frontend -> core -> image =="
cd "$FE"; rm -rf hass_frontend
MODERN_ONLY=1 NODE_OPTIONS=--max-old-space-size=6144 corepack yarn build 2>&1 | tail -3
test -d hass_frontend && echo "  frontend v4 built"
CTX=$BASE/brand-core-v4; rm -rf "$CTX"; mkdir -p "$CTX"
cp -r "$FE"/hass_frontend "$CTX"/hass_frontend
printf 'FROM ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2\nCOPY hass_frontend/ /usr/local/lib/python3.14/site-packages/hass_frontend/\n' > "$CTX"/Dockerfile
sudo -n podman build --platform linux/arm64 -t aetos-core:v4 "$CTX" 2>&1 | tail -2
sudo -n podman tag aetos-core:v4 ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
rm -f "$PKG"/aetos-core.tar
sudo -n podman save --format docker-archive -o "$PKG"/aetos-core.tar ghcr.io/home-assistant/raspberrypi4-64-homeassistant:2026.7.2
cp "$PKG"/aetos-core.tar "$OS"/output/build/hassio-1.0.0/images/aetos-core.tar 2>/dev/null || true
rm -f "$OS"/output/build/hassio-1.0.0/.stamp_images_installed "$OS"/output/images/rootfs.erofs "$OS"/output/images/*.img*
mkdir -p "$BASE/haos-cache"
cd "$OS"
sudo -n podman run --rm --privileged -v /dev:/dev -v "$OS:/build" -v "$BASE/haos-cache:/cache" \
  -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" hassos:local make rpi4_64 2>&1 | grep -viE 'cgroup|systemd|linger|Emulate'
echo "== RESULT v4 =="
ls -lh "$OS"/output/images/*.img.xz 2>/dev/null && cp "$OS"/output/images/*.img.xz /home/krishna/projects/Aetos-build/aetos-one-rpi4-build-v4.img.xz && echo "  -> deliverables" || echo "no img"
echo "== BUILD-V4 DONE =="
