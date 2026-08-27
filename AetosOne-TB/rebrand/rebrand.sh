#!/usr/bin/env bash
# Aetos One Cloud rebrand of ThingsBoard CE.
# Idempotent: safe to re-run after `git pull` on the upstream repo.
set -euo pipefail

TB="/run/media/krishna/data-backup/claude-cowork/AetosOne-TB/thingsboard"
UI="$TB/ui-ngx/src"
BRAND="Aetos One Cloud"

echo "==> 1/8 index.html"
perl -0pi -e 's{<title>ThingsBoard</title>}{<title>Aetos One Cloud</title>};
              s{href="thingsboard\.ico"}{href="aetosone.ico"};
              s{background-color: rgb\(43,160,199\);}{background-color: #273A80;};' \
  "$UI/index.html"
grep -q 'apple-touch-icon' "$UI/index.html" || perl -0pi -e \
  's{(<link rel="icon" type="image/x-icon" href="aetosone\.ico">)}{$1\n  <link rel="apple-touch-icon" sizes="180x180" href="assets/icons/apple-180.png">\n  <link rel="manifest" href="assets/manifest.webmanifest">\n  <meta name="theme-color" content="#273A80">\n  <meta name="description" content="Aetos One Cloud \x2d IoT platform">}' \
  "$UI/index.html"

echo "==> 2/8 angular.json favicon reference"
perl -0pi -e 's{"src/thingsboard\.ico"}{"src/aetosone.ico"}g' "$TB/ui-ngx/angular.json"

echo "==> 3/8 app title / issuer / console banner"
perl -0pi -e "s{appTitle: 'ThingsBoard'}{appTitle: '$BRAND'}" \
  "$UI/environments/environment.ts" "$UI/environments/environment.prod.ts"
perl -0pi -e 's{`ThingsBoard Version:}{`Aetos One Cloud Version:}' "$UI/app/app.component.ts"
perl -0pi -e "s!issuerName = \[\{value: 'ThingsBoard'!issuerName = [{value: 'AetosOne'!" \
  "$UI/app/modules/home/pages/admin/two-factor-auth-settings.component.ts"

echo "==> 4/8 login logo link"
perl -0pi -e 's{<tb-logo link="https://thingsboard\.io" target="_blank"}{<tb-logo link="/" }' \
  "$UI/app/modules/login/pages/login/login.component.html"

echo "==> 4b/8 remove upstream ThingsBoard GitHub star badge from the toolbar"
perl -0pi -e 's{^\s*<tb-github-badge class="lt-md:!hidden"></tb-github-badge>\n}{}m' \
  "$UI/app/modules/home/home.component.html"

echo "==> 5/8 brand colours (#305680 -> #273A80 etc.)"
grep -rlI --exclude-dir=node_modules -e '305680' -e '527dad' -e 'a7c1de' "$UI" | while read -r f; do
  perl -0pi -e 's{#305680}{#273A80}gi; s{#527dad}{#3E5AA8}gi; s{#a7c1de}{#B9C2E2}gi;' "$f"
done

echo "==> 6/8 user-visible product name in locale bundles"
for f in "$UI"/assets/locale/locale.constant-*.json; do
  perl -0pi -e "s{ThingsBoard}{$BRAND}g" "$f"
done
# dashboard seed data shown on home pages
for f in "$UI"/assets/dashboard/*_home_page.json; do
  perl -0pi -e "s{ThingsBoard}{$BRAND}g" "$f"
done

echo "==> 6b/8 drop upstream 'Connect mobile app' QR tile from home pages"
python3 "$(dirname "$0")/remove_mobile_qr_tile.py"

echo "==> 7/8 transactional email templates"
for f in "$TB"/application/src/main/resources/templates/*.ftl; do
  perl -0pi -e "s{&mdash; The ThingsBoard}{&mdash; The Aetos One Cloud Team}g;
                s{by ThingsBoard\.}{by Aetos One Cloud.}g;
                s{ThingsBoard}{$BRAND}g;" "$f"
done

echo "==> 8/8 REST API docs metadata"
perl -0pi -e 's{ThingsBoard REST API}{Aetos One Cloud REST API};
              s{ThingsBoard open-source IoT platform REST API documentation\.}{Aetos One Cloud IoT platform REST API documentation.};
              s{SWAGGER_CONTACT_NAME:ThingsBoard team}{SWAGGER_CONTACT_NAME:Aetos One Cloud team};' \
  "$TB/application/src/main/resources/thingsboard.yml"

echo "==> 9/9 remaining user-visible strings"
# The footers, the Swagger examples and the one example domain in a validation hint.
#
# Explicitly NOT touched, and each for a reason:
#   * org.thingsboard.* package names, imports, Maven coordinates, proto packages and
#     database table names — renaming any of them breaks the build or the schema for no
#     visible benefit;
#   * "The ThingsBoard Authors" in licence headers — Apache-2.0 requires that attribution
#     be retained in a derivative work, so the product name is added beside it rather than
#     replacing it;
#   * https://thingsboard.io as the in-app help base URL — those pages document the platform
#     this is built on. Repointing them at a site that does not host the same content would
#     turn working help into 404s.

# app footer: our name first, upstream credit retained
perl -0pi -e 's{<small>Copyright . \{\{year\}\} The ThingsBoard Authors</small>}
              {<small>Copyright \xc2\xa9 \{\{year\}\} Aetos One Cloud &middot; built on ThingsBoard, \xc2\xa9 The ThingsBoard Authors</small>}x' \
  "$UI/app/shared/components/footer.component.html" 2>/dev/null || true

# dashboard "Powered by" line
perl -0pi -e 's{Powered by <a href="https://thingsboard\.io" target="_blank">ThingsBoard v\.}
              {Powered by <a href="https://aetosiot.com" target="_blank">Aetos One Cloud v.}x' \
  "$UI/app/modules/home/components/dashboard-page/dashboard-page.component.html" 2>/dev/null || true

# example domain in a validation hint
perl -0pi -e 's{thingsboard\.io}{aetosiot.com}g' \
  "$UI/assets/locale/locale.constant-en_US.json" 2>/dev/null || true

# Swagger examples render in the API docs, so the addresses there are user-visible
grep -rl '@thingsboard\.org' "$TB/application/src/main/java" "$TB/common/data/src/main/java" 2>/dev/null \
  | xargs -r sed -i 's/@thingsboard\.org/@aetosiot.com/g'

echo
echo "Rebrand pass complete."
echo "Residual user-visible 'ThingsBoard' strings in ui-ngx (excluding licence headers / package ids):"
grep -rn "ThingsBoard" --include="*.html" --include="*.ts" --include="*.json" "$UI" \
  | grep -vi "thingsboard authors\|org.thingsboard\|thingsboard.io\|github.com/thingsboard" | head -20 || true
