#!/bin/bash
# Offline pre-fetch of HACS + cards + integrations + themes for build-v4.
# Uses GitHub API (releases/latest) so asset names aren't hardcoded.
# Stages into a /config seed tree: custom_components/, www/community/, themes/.
set -u
SEED=/home/krishna/aetos-build/v4-config-seed
WWW="$SEED/www/community"; CC="$SEED/custom_components"; TH="$SEED/themes"
mkdir -p "$WWW" "$CC" "$TH"
LOG=/home/krishna/aetos-build/v4-fetch.log; : > "$LOG"
ok(){ echo "OK   $1" | tee -a "$LOG"; }
fail(){ echo "FAIL $1  ($2)" | tee -a "$LOG"; }

api(){ curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$1/releases/latest" 2>/dev/null; }

# --- CARDS: download release .js asset(s) into www/community/<name>/ ---
fetch_card(){ # slug  destname
  local slug="$1" name="$2" j urls d="$WWW/$2"
  j=$(api "$slug"); [ -z "$j" ] && { fail "$slug" "no release"; return; }
  urls=$(echo "$j" | grep -oE '"browser_download_url":[^,]*' | grep -oE 'https[^"]+\.js' )
  [ -z "$urls" ] && { fail "$slug" "no .js asset"; return; }
  mkdir -p "$d"
  for u in $urls; do curl -fsSL "$u" -o "$d/$(basename "$u")" && ok "$slug -> www/community/$name/$(basename "$u")" || fail "$slug" "dl $u"; done
}

for pair in \
  "piitaya/lovelace-mushroom:mushroom" \
  "kalkih/mini-graph-card:mini-graph-card" \
  "custom-cards/button-card:button-card" \
  "custom-cards/stack-in-card:stack-in-card" \
  "custom-cards/decluttering-card:decluttering-card" \
  "ofekashery/vertical-stack-in-card:vertical-stack-in-card" \
  "rianadon/timer-bar-card:timer-bar-card" \
  "flixlix/power-flow-card-plus:power-flow-card-plus" \
  "kalkih/simple-weather-card:simple-weather-card" \
  "pkissling/clock-weather-card:clock-weather-card" \
  "mattieha/slider-button-card:slider-button-card" \
  "nervetattack/lovelace-banner-card:banner-card" \
  "nielsfaber/alarmo-card:alarmo-card" \
  "ljmerza/light-entity-card:light-entity-card" \
  "dylandoamaral/uptime-card:uptime-card" \
  "junalmeida/minimalistic-area-card:minimalistic-area-card" \
  "francois-le-ko4la/lovelace-entity-progress-card:entity-progress-card" \
; do fetch_card "${pair%%:*}" "${pair##*:}"; done

# --- INTEGRATIONS: shallow-clone, copy custom_components/<domain> ---
fetch_integration(){ # slug
  local slug="$1" tmp; tmp=$(mktemp -d)
  if git clone --depth 1 -q "https://github.com/$slug" "$tmp" 2>/dev/null; then
    if [ -d "$tmp/custom_components" ]; then cp -r "$tmp"/custom_components/* "$CC"/ && ok "$slug -> custom_components"; else fail "$slug" "no custom_components"; fi
  else fail "$slug" "clone"; fi
  rm -rf "$tmp"
}
for slug in nielsfaber/alarmo frenck/spook dummylabs/thewatchman jcwillox/hass-auto-backup; do fetch_integration "$slug"; done

echo "== SUMMARY ==" | tee -a "$LOG"
grep -c '^OK'  "$LOG" | sed 's/^/OK count:   /' | tee -a "$LOG"
grep -c '^FAIL' "$LOG" | sed 's/^/FAIL count: /' | tee -a "$LOG"
echo "staged tree:" | tee -a "$LOG"
find "$SEED" -maxdepth 2 -type d | sed "s#$SEED#  #" | tee -a "$LOG"
echo "== FETCH DONE ==" | tee -a "$LOG"
