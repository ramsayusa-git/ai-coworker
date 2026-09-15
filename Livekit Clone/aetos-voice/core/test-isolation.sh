#!/bin/bash
# Tenant isolation + auth gate tests. These are security assertions, not smoke
# tests: a failure here is a data-leak bug.
B=http://localhost:8100/api/v1
J=~/.aetos/venvs/aetos-core@2.0.0/bin/python3.12
CORE=~/.aetos/venvs/aetos-core@2.0.0/bin
SRC="/home/krishna/ai-work-space/ai-coworker/Livekit Clone/aetos-voice/core"

pass=0; fail=0
chk() { # chk "label" expected actual
  if [ "$2" = "$3" ]; then printf '  PASS  %-46s %s\n' "$1" "$3"; pass=$((pass+1));
  else printf '  FAIL  %-46s expected %s got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
code() { curl -s -o /tmp/r.json -w '%{http_code}' "$@"; }

echo "=== setup: second tenant with its own owner ==="
cd "$SRC"
PYTHONPATH=. $CORE/python3.12 - <<'PY'
from aetos_core.db import Session, Tenant, User, Membership, BrandProfile, default_brand, ensure_tenancy
from aetos_core.security import hash_password
with Session() as s:
    ensure_tenancy(s)
    t = s.query(Tenant).filter(Tenant.slug=="acme").first()
    if not t:
        t = Tenant(slug="acme", name="Acme Pty Ltd"); s.add(t); s.flush()
        s.add(BrandProfile(tenant_id=t.id, **default_brand()))
    u = s.query(User).filter(User.email=="owner@acme-demo.com").first()
    if not u:
        u = User(email="owner@acme-demo.com", name="Acme Owner",
                 password_hash=hash_password("AcmeOwnerPass2026!")); s.add(u); s.flush()
    if not s.query(Membership).filter_by(tenant_id=t.id, user_id=u.id).first():
        s.add(Membership(tenant_id=t.id, user_id=u.id, role="owner"))
    s.commit()
    # Reset the fixture so the run is idempotent — otherwise agents created by
    # a previous run make the "count is 0" and "create succeeds" checks fail
    # for reasons that have nothing to do with isolation.
    from aetos_core.db import Agent
    n = s.query(Agent).filter(Agent.tenant_id == t.id).delete()
    s.commit()
    print(f"  acme tenant: {t.id} (cleared {n} leftover agent(s))")
PY

login() { curl -s -X POST "$B/auth/login" -H 'content-type: application/json' -d "$1"; }

A=$(login '{"email":"raamaak@outlook.com","password":"LatticeNet-Ramsay-2026"}')
TA=$($J -c "import json,sys;print(json.loads(sys.argv[1])['access'])" "$A")
B2=$(login '{"email":"owner@acme-demo.com","password":"AcmeOwnerPass2026!"}')
TB=$($J -c "import json,sys;print(json.loads(sys.argv[1])['access'])" "$B2")

echo
echo "=== 1. authentication is required ==="
chk "GET /agents no token"        401 "$(code $B/agents)"
chk "GET /agents junk token"      401 "$(code -H 'Authorization: Bearer junk' $B/agents)"
chk "GET /sessions no token"      401 "$(code $B/sessions)"
chk "GET /analytics no token"     401 "$(code $B/analytics/overview)"
chk "GET /telephony/trunks none"  401 "$(code $B/telephony/trunks)"
chk "GET /system/info no token"   401 "$(code $B/system/info)"

echo
echo "=== 2. each tenant sees only its own rows ==="
NA=$(curl -s -H "Authorization: Bearer $TA" $B/agents | $J -c "import json,sys;print(len(json.load(sys.stdin)))")
NB=$(curl -s -H "Authorization: Bearer $TB" $B/agents | $J -c "import json,sys;print(len(json.load(sys.stdin)))")
chk "default tenant agent count"  3 "$NA"
chk "acme tenant agent count"     0 "$NB"
SA=$(curl -s -H "Authorization: Bearer $TA" $B/sessions | $J -c "import json,sys;print(json.load(sys.stdin)['total'])")
SB=$(curl -s -H "Authorization: Bearer $TB" $B/sessions | $J -c "import json,sys;print(json.load(sys.stdin)['total'])")
chk "default tenant session count" 48 "$SA"
chk "acme tenant session count"    0  "$SB"

echo
echo "=== 3. cross-tenant id returns 404, not 403 ==="
AID=$(curl -s -H "Authorization: Bearer $TA" $B/agents | $J -c "import json,sys;print(json.load(sys.stdin)[0]['id'])")
chk "acme GET default's agent"    404 "$(code -H "Authorization: Bearer $TB" $B/agents/$AID)"
chk "acme PATCH default's agent"  404 "$(code -X PATCH -H "Authorization: Bearer $TB" -H 'content-type: application/json' -d '{"name":"hijacked"}' $B/agents/$AID)"
chk "acme DELETE default's agent" 404 "$(code -X DELETE -H "Authorization: Bearer $TB" $B/agents/$AID)"
chk "owner still sees own agent"  200 "$(code -H "Authorization: Bearer $TA" $B/agents/$AID)"

echo
echo "=== 4. same names allowed in different tenants ==="
chk "acme creates 'Aetos Receptionist'" 201 "$(code -X POST -H "Authorization: Bearer $TB" -H 'content-type: application/json' \
  -d '{"name":"Aetos Receptionist","kind":"voice","prompt":"hi","pipeline":{"llm":"fast"},"tools":[],"kb":[]}' $B/agents)"
chk "duplicate within acme rejected"    409 "$(code -X POST -H "Authorization: Bearer $TB" -H 'content-type: application/json' \
  -d '{"name":"Aetos Receptionist","kind":"voice","prompt":"hi","pipeline":{"llm":"fast"},"tools":[],"kb":[]}' $B/agents)"

echo
echo "=== 5. platform-only surfaces ==="
chk "non-platform GET /tenants"   403 "$(code -H "Authorization: Bearer $TA" $B/tenants)"
chk "non-platform component action" 403 "$(code -X POST -H "Authorization: Bearer $TA" $B/components/tts-mock/restart)"

echo
echo "=== 6. audit is tenant-scoped ==="
AA=$(curl -s -H "Authorization: Bearer $TA" "$B/system/audit?n=500" | $J -c "import json,sys;print(len(json.load(sys.stdin)))")
AB=$(curl -s -H "Authorization: Bearer $TB" "$B/system/audit?n=500" | $J -c "import json,sys;print(len(json.load(sys.stdin)))")
echo "  default audit rows: $AA | acme audit rows: $AB"
[ "$AA" != "$AB" ] && echo "  PASS  audit logs differ per tenant" && pass=$((pass+1))

echo
echo "================ $pass passed, $fail failed ================"
[ "$fail" -eq 0 ] || exit 1
