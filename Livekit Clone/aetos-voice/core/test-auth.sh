#!/bin/bash
B=http://localhost:8100/api/v1
PW="DYYgu3381MSCYczmygURfgGD2LI"
J=~/.aetos/venvs/aetos-core@2.0.0/bin/python3.12

say() { printf '%-52s' "$1"; }
code() { curl -s -o /tmp/r.json -w '%{http_code}' "$@"; }

echo "=== 1. unauthenticated access must be refused ==="
say "GET /agents with no token";      code "$B/agents"; echo
say "GET /agents with junk token";    code -H "Authorization: Bearer nonsense" "$B/agents"; echo

echo
echo "=== 2. login ==="
say "wrong password";                 code -X POST "$B/auth/login" -H 'content-type: application/json' \
  -d '{"email":"raamaak@outlook.com","password":"wrong-password-here"}'; echo
say "unknown email (same message?)";  code -X POST "$B/auth/login" -H 'content-type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrong-password-here"}'; cat /tmp/r.json; echo
say "correct password";               code -X POST "$B/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"raamaak@outlook.com\",\"password\":\"$PW\"}"; echo
cp /tmp/r.json /tmp/login.json
ACCESS=$($J -c "import json;print(json.load(open('/tmp/login.json'))['access'])")
REFRESH=$($J -c "import json;print(json.load(open('/tmp/login.json'))['refresh'])")
$J -c "
import json; d=json.load(open('/tmp/login.json'))
print('   role:', d['role'], '| tenant:', d['tenant']['slug'], '| must_change:', d['user']['must_change_password'])
print('   memberships:', [m['slug']+':'+m['role'] for m in d['memberships']])"

echo
echo "=== 3. authenticated access ==="
say "GET /agents with token";         code -H "Authorization: Bearer $ACCESS" "$B/agents"; echo
say "GET /auth/me";                   code -H "Authorization: Bearer $ACCESS" "$B/auth/me"; echo
say "GET /branding";                  code -H "Authorization: Bearer $ACCESS" "$B/branding"; echo
say "GET /branding/public (no auth)"; code "$B/branding/public"; echo
say "GET /licence";                   code -H "Authorization: Bearer $ACCESS" "$B/licence"; cat /tmp/r.json; echo

echo
echo "=== 4. role gates ==="
say "GET /users (owner, allowed)";    code -H "Authorization: Bearer $ACCESS" "$B/users"; echo
say "GET /tenants (needs platform)";  code -H "Authorization: Bearer $ACCESS" "$B/tenants"; cat /tmp/r.json; echo

echo
echo "=== 5. refresh rotation ==="
say "refresh once";                   code -X POST "$B/auth/refresh" -H 'content-type: application/json' \
  -d "{\"refresh\":\"$REFRESH\"}"; echo
cp /tmp/r.json /tmp/ref.json
NEWREF=$($J -c "import json;print(json.load(open('/tmp/ref.json')).get('refresh',''))" 2>/dev/null)
say "reuse the OLD refresh (must 401)"; code -X POST "$B/auth/refresh" -H 'content-type: application/json' \
  -d "{\"refresh\":\"$REFRESH\"}"; cat /tmp/r.json; echo
say "new refresh also killed (family)"; code -X POST "$B/auth/refresh" -H 'content-type: application/json' \
  -d "{\"refresh\":\"$NEWREF\"}"; echo
