#!/bin/bash
# Re-apply Aetos branding onto the freshly-extracted 2026.8.0 frontend (/tmp/newfe).
set -e
NFE=/tmp/newfe/hass_frontend
FL=$NFE/frontend_latest
B=/run/media/krishna/data-backup/claude-cowork/AetosOne-HA/aetos-build
ABOUT=$FL/79088.d4287436eda1cd04.js
AUTH=$FL/authorize.7e18b8f0390e2fc3.js

echo "== 1. About page render (Build v9.8.9 / Core dynamic) =="
python3 - "$ABOUT" <<'PY'
import sys
f=sys.argv[1]; s=open(f).read()
start=s.find('render(){const t=this.hass,')
assert start>0, "render start missing"
mark='</hass-subpage> `}'
e=s.find(mark, start); assert e>0, "end missing"
old=s[start:e+len(mark)]
new=('render(){const t=this.hass;return s.qy` '
 '<hass-subpage .hass=${this.hass} .narrow=${this.narrow} back-path="/config" '
 '.header=${this.hass.localize("ui.panel.config.info.caption")}> '
 '<div class="content"> <ha-card outlined class="header"> '
 '<img src="/static/icons/favicon-192x192.png" alt="Aetos One" style="width:96px;height:96px;object-fit:contain;margin-top:8px"/> '
 '<p>Aetos One</p> '
 '<div style="opacity:.7;margin-top:-14px;margin-bottom:8px;font-size:14px;text-align:center">Smart Home Controller</div> '
 '<ul class="versions"> '
 '<li> <span class="version-label">Build</span> <span class="version">v9.8.9</span> </li> '
 '<li> <span class="version-label">Core</span> <span class="version">${t.connection.haVersion}</span> </li> '
 '<li> <span class="version-label">Powered by</span> <span class="version">Aetos Tech Labs</span> </li> '
 '<li> <span class="version-label">Web</span> <span class="version"><a href="https://www.aetostechlabs.com" target="_blank" rel="noreferrer noopener">www.aetostechlabs.com</a></span> </li> '
 '<li> <span class="version-label">Support</span> <span class="version"><a href="mailto:krishna@aetostechlabs.com">krishna@aetostechlabs.com</a></span> </li> '
 '<li> <span class="version-label">Mobile</span> <span class="version">+91 99666 12678</span> </li> '
 '</ul> '
 '<div style="text-align:center;margin-top:6px;font-size:11px;opacity:.55">Built on Home Assistant (Apache-2.0). Open-source license details available on request.</div> '
 '</ha-card> </div> </hass-subpage> `}')
s=s.replace(old,new,1)+"\n/*aetos-brand-changed v9.8.9*/"
open(f,"w").write(s)
print("  about patched; version-list removed:", 'installation_method' not in s)
PY

echo "== 2. Hide login + onboarding Help links (authorize) =="
python3 - "$AUTH" <<'PY'
import sys
f=sys.argv[1]; s=open(f).read()
import re
# docs/authentication button -> display:none (insert style before href)
s=re.sub(r'(<ha-button[^>]*?)( href="https://www\.home-assistant\.io/docs/authentication/")',
         r'\1 style="display:none"\2', s, count=1)
# forgot-password / locked_out link -> display:none
s=s.replace('<a class="forgot-password" href="https://www.home-assistant.io/docs/locked_out/#forgot-password"',
            '<a class="forgot-password" style="display:none" href="https://www.home-assistant.io/docs/locked_out/#forgot-password"',1)
open(f,"w").write(s)
print("  auth hidden: authn=", 'display:none" href="https://www.home-assistant.io/docs/authentication' in s or 'display:none"  href' in s, "| lockedout=", 'forgot-password" style="display:none"' in s)
PY

echo "== 3. Transparent logo icons into static/icons =="
SRCICON=$B/frontend/hass_frontend/static/icons
for n in favicon-16x16.png favicon-32x32.png favicon-192x192.png favicon-384x384.png favicon-512x512.png favicon-1024x1024.png favicon-apple-180x180.png favicon.ico aetos-shield.png aetos-logo-main.png; do
  [ -f "$SRCICON/$n" ] && cp "$SRCICON/$n" "$NFE/static/icons/$n"
done
echo "  icons copied: $(ls $NFE/static/icons/ | grep -cE 'favicon|aetos')"

echo "== 4. strip precompressed variants of edited chunks =="
rm -f "$ABOUT.gz" "$ABOUT.br" "$AUTH.gz" "$AUTH.br" $NFE/static/icons/*.png.gz $NFE/static/icons/*.png.br 2>/dev/null || true

echo "== 5. syntax check =="
node --check "$ABOUT" && echo "  about OK"
node --check "$AUTH" && echo "  auth OK"
echo "  marker: $(grep -rlq aetos-brand-changed $FL/ && echo present || echo MISSING)"
echo "REAPPLY DONE"
