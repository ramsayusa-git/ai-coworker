#!/usr/bin/env bash
# Move every built-in account from @thingsboard.org to @aetosiot.com.
#
# Two things have to change, and they are easy to confuse:
#
#   1. the installer source, so a FRESH install creates the new addresses;
#   2. the live database, so the accounts that already exist can be signed in to today.
#
# Doing only (1) leaves you unable to log in with the address the code now advertises;
# doing only (2) means the next clean install regresses. This does both.
#
# Idempotent: re-running finds nothing left to change.
set -euo pipefail

TB="/run/media/krishna/data-backup/claude-cowork/AetosOne-TB/thingsboard"
REBRAND="/run/media/krishna/data-backup/claude-cowork/AetosOne-TB/rebrand"
OLD_DOMAIN="thingsboard.org"
NEW_DOMAIN="aetosiot.com"

echo "== 1. installer source (affects new installs)"
LOADER="$TB/application/src/main/java/org/thingsboard/server/service/install/DefaultSystemDataLoaderService.java"
if grep -q "@$OLD_DOMAIN" "$LOADER"; then
    sed -i "s/@$OLD_DOMAIN/@$NEW_DOMAIN/g" "$LOADER"
    echo "   updated $(basename "$LOADER")"
else
    echo "   already updated"
fi

echo "== 2. live database (affects the accounts that exist now)"
export PGPASSWORD=postgres
psql -h localhost -U postgres -d thingsboard -v ON_ERROR_STOP=1 <<SQL
-- tb_user.email is the login identity; user_credentials keys off user_id, so passwords
-- are unaffected by the rename.
UPDATE tb_user
   SET email = replace(email, '@$OLD_DOMAIN', '@$NEW_DOMAIN')
 WHERE email LIKE '%@$OLD_DOMAIN';

-- the same address is duplicated into additional_info for display in a few places
UPDATE tb_user
   SET additional_info = replace(additional_info::text, '@$OLD_DOMAIN', '@$NEW_DOMAIN')::jsonb
 WHERE additional_info::text LIKE '%@$OLD_DOMAIN%';

-- The super admin predates this convention and was created under aetosone.cloud.
-- Written in two halves so a blanket search-and-replace over this repo cannot collapse the
-- WHERE clause into the SET value and quietly turn the migration into a no-op.
UPDATE tb_user
   SET email = 'superadmin@$NEW_DOMAIN'
 WHERE email = 'superadmin@' || 'aetosone.cloud';

UPDATE customer
   SET email = replace(email, '@$OLD_DOMAIN', '@$NEW_DOMAIN')
 WHERE email LIKE '%@$OLD_DOMAIN';

UPDATE tenant
   SET email = replace(email, '@$OLD_DOMAIN', '@$NEW_DOMAIN')
 WHERE email LIKE '%@$OLD_DOMAIN';
SQL

echo "== 3. verification and seeding scripts"
# These log in as the built-in accounts, so they have to follow the rename or every one
# of them starts failing at the first request.
CHANGED=0
for f in "$REBRAND"/*.py; do
    if grep -q "@$OLD_DOMAIN" "$f" 2>/dev/null; then
        sed -i "s/@$OLD_DOMAIN/@$NEW_DOMAIN/g" "$f"
        echo "   updated $(basename "$f")"
        CHANGED=$((CHANGED + 1))
    fi
done
for f in "$REBRAND"/../mcp-server/test/*.js "$REBRAND"/../mcp-server/*.md; do
    [ -f "$f" ] || continue
    if grep -q "@$OLD_DOMAIN" "$f" 2>/dev/null; then
        sed -i "s/@$OLD_DOMAIN/@$NEW_DOMAIN/g" "$f"
        echo "   updated $(basename "$f")"
        CHANGED=$((CHANGED + 1))
    fi
done
[ "$CHANGED" -eq 0 ] && echo "   already updated"

echo
echo "Done. Sign in with:"
psql -h localhost -U postgres -d thingsboard -tAc \
  "SELECT '   ' || email || '  (' || authority || ')' FROM tb_user ORDER BY authority, email;"
echo
echo "Passwords are unchanged: sysadmin / tenant / customer."
