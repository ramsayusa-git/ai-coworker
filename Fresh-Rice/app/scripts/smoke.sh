#!/usr/bin/env bash
# End-to-end smoke test against a running API. Usage: scripts/smoke.sh [http://localhost:4100]
A="${1:-http://localhost:4100}/v1"; J=(-s -H "Content-Type: application/json"); fail=0
py(){ python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }
tok(){ curl "${J[@]}" -X POST $A/auth/otp/request -d "{\"phone\":\"$1\"}" >/dev/null; curl "${J[@]}" -X POST $A/auth/otp/verify -d "{\"phone\":\"$1\",\"code\":\"123456\"}" | py "print(d['token'])"; }
check(){ if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got: $2, want: $3)"; fail=1; fi; }
C=$(tok 9000000003); AD=$(tok 9000000001); R=$(tok 9000000002); B=$(tok 9000000004)
check "zone check" "$(curl -s "$A/zones/check?pincode=500072" | py "print(d['serviceable'])")" True
ADDR=$(curl -s -H "Authorization: Bearer $C" $A/addresses | py "print(d[0]['id'])")
SKU=$(curl -s "$A/catalog" | py "print([s['id'] for v in d['items'] for s in v['skus'] if s['code']=='SONA-20'][0])")
TOM=$(date -d "+1 day" +%F); KEY="smoke-$(date +%s)"
O=$(curl "${J[@]}" -H "Authorization: Bearer $C" -X POST $A/orders -d "{\"addressId\":\"$ADDR\",\"deliveryDate\":\"$TOM\",\"items\":[{\"skuId\":\"$SKU\",\"qty\":1}],\"paymentMethod\":\"UPI\",\"idempotencyKey\":\"$KEY\"}")
OID=$(echo "$O" | py "print(d['id'])"); check "order confirmed" "$(echo "$O" | py "print(d['status'])")" CONFIRMED
check "idempotent" "$(curl "${J[@]}" -H "Authorization: Bearer $C" -X POST $A/orders -d "{\"addressId\":\"$ADDR\",\"deliveryDate\":\"$TOM\",\"items\":[{\"skuId\":\"$SKU\",\"qty\":1}],\"paymentMethod\":\"UPI\",\"idempotencyKey\":\"$KEY\"}" | py "print(d['id'])")" "$OID"
check "invoice" "$(curl -s -H "Authorization: Bearer $C" -X POST $A/orders/$OID/invoice | py "print(d['invoice']['invoiceNo'][:3])")" "FR/"
curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/dispatch/batch -d "{\"date\":\"$TOM\"}" >/dev/null
RT=$(curl -s -H "Authorization: Bearer $AD" "$A/admin/dispatch/routes?date=$TOM" | py "print([r['id'] for r in d if any(s['orderId']=='$OID' for s in r['stops'])][0])")
RID=$(curl -s -H "Authorization: Bearer $AD" $A/admin/riders | py "print(d[0]['id'])")
curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/dispatch/routes/$RT/assign -d "{\"riderId\":\"$RID\"}" >/dev/null
check "route start" "$(curl -s -H "Authorization: Bearer $R" -X POST $A/rider/routes/$RT/start | py "print(d['status'])")" IN_PROGRESS
STOP=$(curl -s -H "Authorization: Bearer $R" $A/rider/manifest | py "print([s['id'] for r in d for s in r['stops'] if s['orderId']=='$OID'][0])")
OTP=$(curl -s -H "Authorization: Bearer $AD" $A/notifications | py "import re;print(re.search(r'is (\d{4})',[x for x in d if x['template']=='otp_delivery'][0]['body']).group(1))")
check "scan wrong lot rejected" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/stops/$STOP/scan -d '{"lotNo":"LOT-NOPE"}' | py "print(d['statusCode'])")" 400
check "scan lot" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/stops/$STOP/scan -d "{\"lotNo\":\"$(echo "$O" | py "print(d['items'][0]['lot']['lotNo'])")\"}" | py "print(d['loaded'])")" True
LOTNO=$(echo "$O" | py "print(d['items'][0]['lot']['lotNo'])")
check "scan lot via QR trace URL" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/stops/$STOP/scan -d "{\"lotNo\":\"https://freshrice.in/trace/$LOTNO\"}" | py "print(d['loaded'])")" True
check "public trace page data" "$(curl -s "$A/inventory/trace/$LOTNO" | py "print(d['found'] and d['lotNo']=='$LOTNO' and 'mill' in d)")" True
check "public trace unknown lot" "$(curl -s "$A/inventory/trace/NOPE-000" | py "print(d['found'])")" False
curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/location -d '{"lat":17.48,"lng":78.39}' >/dev/null
check "rider location" "$(curl -s -H "Authorization: Bearer $C" $A/orders/$OID/rider-location | py "print(d['lat'])")" 17.48
check "deliver" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/stops/$STOP/deliver -d "{\"otp\":\"$OTP\"}" | py "print(d['status'])")" DELIVERED
check "sub run" "$(curl -s -H "Authorization: Bearer $AD" -X POST "$A/admin/subscriptions/run?date=$TOM" | py "print(d['failed'])")" 0
check "b2b prepaid" "$(curl "${J[@]}" -H "Authorization: Bearer $B" -X POST $A/orders -d "{\"addressId\":\"$(curl -s -H "Authorization: Bearer $B" $A/addresses | py "print(d[0]['id'])")\",\"items\":[{\"skuId\":\"$(curl -s -H "Authorization: Bearer $B" $A/catalog | py "print([s['id'] for v in d['items'] for s in v['skus'] if s['code']=='SONA-25'][0])")\",\"qty\":1}],\"paymentMethod\":\"UPI\"}" | py "print(d['status'])")" CONFIRMED
curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/coupons -d '{"code":"SMOKE10","type":"PERCENT","value":10,"usesPerUser":99}' >/dev/null
check "coupon" "$(curl "${J[@]}" -H "Authorization: Bearer $C" -X POST $A/coupons/check -d '{"code":"smoke10","subtotalPaise":100000}' | py "print(d['discountPaise'])")" 10000
check "whatsapp SKIP" "$(curl "${J[@]}" -X POST $A/webhooks/whatsapp -d '{"phone":"919000000003","text":"SKIP"}' | py "print(d['action'])")" skip
NEWP="9$(date +%s | tail -c 10)"; CODE=$(curl -s -H "Authorization: Bearer $C" $A/auth/referrals/mine | py "print(d['code'])"); W0=$(curl -s -H "Authorization: Bearer $C" $A/auth/me | py "print(d['walletBalance'])")
curl "${J[@]}" -X POST $A/auth/otp/request -d "{\"phone\":\"$NEWP\"}" >/dev/null; N=$(curl "${J[@]}" -X POST $A/auth/otp/verify -d "{\"phone\":\"$NEWP\",\"code\":\"123456\",\"name\":\"Smoke Neighbour\",\"referral\":\"$CODE\"}" | py "print(d['token'])")
NADDR=$(curl "${J[@]}" -H "Authorization: Bearer $N" -X POST $A/addresses -d '{"line1":"Flat 1, Sai Enclave","complex":"Sai Enclave","pincode":"500072","floor":1,"hasLift":true,"lat":17.485,"lng":78.392}' | py "print(d['id'])")
NO=$(curl "${J[@]}" -H "Authorization: Bearer $N" -X POST $A/orders -d "{\"addressId\":\"$NADDR\",\"deliveryDate\":\"$TOM\",\"items\":[{\"skuId\":\"$SKU\",\"qty\":1}],\"paymentMethod\":\"COD\"}")
check "referee ₹100 off first order" "$(echo "$NO" | py "print(d['discountPaise'])")" 10000
NOID=$(echo "$NO" | py "print(d['id'])"); curl "${J[@]}" -H "Authorization: Bearer $AD" -X PATCH $A/admin/orders/$NOID/status -d '{"status":"PACKED"}' >/dev/null; curl "${J[@]}" -H "Authorization: Bearer $AD" -X PATCH $A/admin/orders/$NOID/status -d '{"status":"OUT_FOR_DELIVERY"}' >/dev/null; curl "${J[@]}" -H "Authorization: Bearer $AD" -X PATCH $A/admin/orders/$NOID/status -d '{"status":"DELIVERED"}' >/dev/null
check "referrer wallet +₹100 on delivery" "$(curl -s -H "Authorization: Bearer $C" $A/auth/me | py "print(d['walletBalance'] - $W0)")" 10000
check "referrer notified" "$(curl -s -H "Authorization: Bearer $AD" $A/notifications | py "print(any(x['template']=='referral_reward' for x in d[:5]))")" True
check "referral stats" "$(curl -s -H "Authorization: Bearer $C" $A/auth/referrals/mine | py "print(d['converted']>=1)")" True
check "reports daily" "$(curl -s -H "Authorization: Bearer $AD" "$A/admin/reports/daily" -o /dev/null -w '%{http_code}')" 200
check "reports gst csv" "$(curl -s -H "Authorization: Bearer $AD" "$A/admin/reports/gst?format=csv" | head -1 | grep -c "Invoice No")" 1

# --- RBAC: marketing, sales, vendor portal, warehouse staff ---
# Sales rep is field staff (flag set before login so the JWT carries isField) — one OTP per phone per run keeps us under the 5/10min per-phone cap.
SID=$(curl -s -H "Authorization: Bearer $AD" $A/admin/staff | py "print([s['id'] for s in d if s['role']=='SALES'][0])"); curl "${J[@]}" -H "Authorization: Bearer $AD" -X PATCH $A/admin/staff/$SID -d '{"isField":true}' >/dev/null
MK=$(tok 9000000005); SL=$(tok 9000000006); WH=$(tok 9000000007); VN=$(tok 9000000008)
check "marketing can read coupons" "$(curl -s -H "Authorization: Bearer $MK" "$A/admin/coupons" -o /dev/null -w '%{http_code}')" 200
check "marketing forbidden from vendors" "$(curl -s -H "Authorization: Bearer $MK" "$A/admin/vendors" -o /dev/null -w '%{http_code}')" 403
check "sales can read b2b accounts" "$(curl -s -H "Authorization: Bearer $SL" "$A/admin/b2b" -o /dev/null -w '%{http_code}')" 200
check "sales forbidden from inventory" "$(curl -s -H "Authorization: Bearer $SL" "$A/inventory/summary" -o /dev/null -w '%{http_code}')" 403
check "vendor portal sees own POs" "$(curl -s -H "Authorization: Bearer $VN" "$A/vendor/pos" -o /dev/null -w '%{http_code}')" 200
check "vendor portal forbidden from admin vendors" "$(curl -s -H "Authorization: Bearer $VN" "$A/admin/vendors" -o /dev/null -w '%{http_code}')" 403
check "warehouse staff sees own summary" "$(curl -s -H "Authorization: Bearer $WH" "$A/inventory/summary" -o /dev/null -w '%{http_code}')" 200
check "warehouse staff forbidden from transfers" "$(curl -s -H "Authorization: Bearer $WH" "$A/inventory/transfers" -o /dev/null -w '%{http_code}')" 403

# --- Sales CRM: leads, activities, follow-ups, conversion ---
LEAD=$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/sales/leads -d '{"name":"Smoke Test Lead","phone":"9812349999","company":"Smoke Co","estValueRupees":50000}')
LID=$(echo "$LEAD" | py "print(d['id'])"); check "lead created" "$(echo "$LEAD" | py "print(d['status'])")" NEW
FUP_DATE=$(date +%F)
check "log activity + set follow-up" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/sales/leads/$LID/activities -d "{\"type\":\"CALL\",\"note\":\"intro call\",\"nextFollowUpAt\":\"$FUP_DATE\"}" | py "print(d['type'])")" CALL
check "lead moved to contacted" "$(curl -s -H "Authorization: Bearer $SL" $A/sales/leads/$LID | py "print(d['status'])")" CONTACTED
check "appears in followups today" "$(curl -s -H "Authorization: Bearer $SL" $A/sales/followups/today | py "print(any(l['id']=='$LID' for l in d))")" True
OTHER_SALES_LEAD=$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/sales/leads -d '{"name":"Admin Owned Lead","phone":"9812349998","assignedToId":"'"$(curl -s -H "Authorization: Bearer $AD" $A/auth/me | py "print(d['id'])")"'"}' | py "print(d['id'])")
check "sales rep cannot see admin-assigned lead detail" "$(curl -s -H "Authorization: Bearer $SL" $A/sales/leads/$OTHER_SALES_LEAD -o /dev/null -w '%{http_code}')" 403
CONV=$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/sales/leads/$LID/convert -d '{}')
check "lead converts to b2b account" "$(echo "$CONV" | py "print(d.get('id') is not None)")" True
check "lead marked WON after convert" "$(curl -s -H "Authorization: Bearer $SL" $A/sales/leads/$LID | py "print(d['status'])")" WON

# --- Product ideas: cook-mode, mill story, compare price, rice meter, lot milestones, duplicate-scan flag ---
check "trace has cook mode" "$(curl -s "$A/inventory/trace/$LOTNO" | py "c=d['cook'];print(c['ratio'].startswith('1 : ') and c['soakMin']>0)")" True
check "trace has our price/kg" "$(curl -s "$A/inventory/trace/$LOTNO" | py "print(d['ourPricePerKgPaise']>0)")" True
ORIG_STORY=$(curl -s -H "Authorization: Bearer $VN" $A/vendor/me); STORY="Smoke story $(date +%s)"
curl "${J[@]}" -H "Authorization: Bearer $VN" -X PATCH $A/vendor/me/story -d "{\"storyTitle\":\"Smoke Mill\",\"story\":\"$STORY\"}" >/dev/null
VLOT=$(curl -s -H "Authorization: Bearer $VN" $A/vendor/deliveries | py "print(d[0]['lotNo'])")
check "mill story shows on trace" "$(curl -s "$A/inventory/trace/$VLOT" | py "print(d['millStory']['text']=='$STORY')")" True
curl "${J[@]}" -H "Authorization: Bearer $VN" -X PATCH $A/vendor/me/story -d "$(echo "$ORIG_STORY" | py "import json;print(json.dumps({'storyTitle':d.get('storyTitle') or '','story':d.get('story') or ''}))")" >/dev/null  # restore the real story
check "vendor photo validated" "$(curl "${J[@]}" -H "Authorization: Bearer $VN" -X PATCH $A/vendor/me/story -d '{"storyPhoto":"http://not-https/x.png"}' -o /dev/null -w '%{http_code}')" 400
curl "${J[@]}" -H "Authorization: Bearer $C" -X PATCH $A/auth/me -d '{"householdSize":4}' >/dev/null
RM=$(curl -s -H "Authorization: Bearer $C" $A/orders/rice-meter)
check "rice meter predicts" "$(echo "$RM" | py "print(d['hasHistory'] and d['dailyKg']>0 and d['suggested']['pricePaise']>0 and d['householdSize']==4)")" True
ML1=$(curl -s -H "Authorization: Bearer $AD" -X POST $A/admin/jobs/lot-milestones); ML2=$(curl -s -H "Authorization: Bearer $AD" -X POST $A/admin/jobs/lot-milestones)
check "lot milestone job idempotent" "$(echo "$ML2" | py "print(d['sent'])")" 0
check "lot milestone notified this order" "$(curl -s -H "Authorization: Bearer $AD" "$A/notifications" | py "print(any(n['template']=='lot_milestone' and '$LOTNO' in n['body'] for n in d))")" True
for i in 1 2 3; do curl -s -H "X-Forwarded-For: 203.0.113.$i" "$A/inventory/trace/$LOTNO" >/dev/null; done
check "duplicate-scan flag" "$(curl -s -H "Authorization: Bearer $AD" "$A/admin/trace-scans?hours=1&minIps=3" | py "print(any(r['lotNo']=='$LOTNO' and r['flagged'] for r in d))")" True

# --- Live tracking: riders + field staff, duty shifts ---
check "staff sees live list" "$(curl -s -H "Authorization: Bearer $SL" $A/admin/dispatch/live | py "print(any(r['kind']=='rider' for r in d))")" True
check "customer sees on-duty riders only" "$(curl -s -H "Authorization: Bearer $C" $A/riders/live | py "print(all(r['kind']=='rider' and r['route'] for r in d))")" True
check "customer cannot share location" "$(curl "${J[@]}" -H "Authorization: Bearer $C" -X POST $A/rider/location -d '{"lat":1,"lng":1}' -o /dev/null -w '%{http_code}')" 403
check "rider-location carries rider phone" "$(curl -s -H "Authorization: Bearer $C" $A/orders/$OID/rider-location | py "print(d is None or ('rider' in d and 'phone' in d['rider']))")" True
check "field staff clocks in" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/me/shift/start -d '{"lat":17.44,"lng":78.35}' | py "print(d.get('id') is not None)")" True
check "field staff can share location" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/rider/location -d '{"lat":17.44,"lng":78.35}' | py "print(d['ok'])")" True
check "field staff on live map for staff" "$(curl -s -H "Authorization: Bearer $AD" $A/admin/dispatch/live | py "print(any(r['kind']=='field' and r['onDuty'] for r in d))")" True
check "field staff hidden from customers" "$(curl -s -H "Authorization: Bearer $C" $A/riders/live | py "print(not any(r['kind']=='field' for r in d))")" True
check "field staff clocks out" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/me/shift/end -d '{}' | py "print(d.get('endedAt') is not None)")" True
check "hours report lists them" "$(curl -s -H "Authorization: Bearer $AD" "$A/admin/shifts" | py "print(any(r['userId']=='$SID' and r['shifts']>=1 for r in d))")" True

# --- Exports (csv/xlsx/pdf) + imports with validation ---
for fmt in csv xlsx pdf; do check "daily report $fmt" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AD" "$A/admin/reports/daily?format=$fmt")" 200; done
check "orders export pdf is a PDF" "$(curl -s -H "Authorization: Bearer $AD" "$A/admin/export/orders?format=pdf" | head -c 4)" "%PDF"
check "customers export xlsx" "$(curl -s -o /dev/null -w '%{content_type}' -H "Authorization: Bearer $AD" "$A/admin/export/customers?format=xlsx" | cut -d';' -f1)" "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
check "sales can export leads" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SL" "$A/admin/export/leads?format=csv")" 200
check "marketing blocked from customers export" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $MK" "$A/admin/export/customers?format=csv")" 400
IMPP="98480$(date +%s | tail -c 6)"
check "import validates bad rows" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/import/leads -d "{\"rows\":[{\"name\":\"Smoke Import\",\"phone\":\"$IMPP\",\"status\":\"NEW\"},{\"name\":\"Bad\",\"phone\":\"12\",\"status\":\"MAYBE\"}],\"commit\":false}" | py "print(d['valid'],d['invalid'],d['committed'])")" "1 1 False"
check "import commits valid rows" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/import/leads -d "{\"rows\":[{\"name\":\"Smoke Import\",\"phone\":\"$IMPP\",\"status\":\"NEW\"}],\"commit\":true}" | py "print(d['created'])")" 1
check "import updates on re-run (no dupes)" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/import/leads -d "{\"rows\":[{\"name\":\"Smoke Import\",\"phone\":\"$IMPP\",\"status\":\"CONTACTED\"}],\"commit\":true}" | py "print(d['updated'])")" 1
check "api still alive after exports" "$(curl -s -o /dev/null -w '%{http_code}' "$A/zones/check?pincode=500072")" 200

# --- Invoices: resend (signed public link + pdf), reissue with audit trail ---
INV=$(curl -s -H "Authorization: Bearer $C" $A/orders/$OID/invoice | py "print(d['invoice']['invoiceNo'])")
RS=$(curl "${J[@]}" -H "Authorization: Bearer $C" -X POST $A/orders/$OID/invoice/resend -d '{}')
check "customer resend logs whatsapp" "$(echo "$RS" | py "print(d['results']['whatsapp'])")" logged
PUB=$(echo "$RS" | py "print(d['url'].split('/i/')[1])")
check "public invoice link opens" "$(curl -s -o /dev/null -w '%{http_code}' "$A/invoices/public/$PUB")" 200
check "public invoice pdf" "$(curl -s "$A/invoices/public/$PUB?format=pdf" | head -c 4)" "%PDF"
check "public link bad signature" "$(curl -s -o /dev/null -w '%{http_code}' "$A/invoices/public/$(echo $PUB | cut -d/ -f1)/nope")" 403
check "customer cannot reissue" "$(curl "${J[@]}" -H "Authorization: Bearer $C" -X POST $A/orders/$OID/invoice/reissue -d '{"reason":"x"}' -o /dev/null -w '%{http_code}')" 403
check "reissue needs reason" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/orders/$OID/invoice/reissue -d '{"reason":""}' -o /dev/null -w '%{http_code}')" 400
RI=$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/orders/$OID/invoice/reissue -d '{"reason":"smoke gstin fix","buyerGstin":"36AABCU9603R1ZM"}')
check "reissue cancels old + issues rev 2" "$(echo "$RI" | py "print(d['cancelled']['status'], d['invoice']['revision'], d['invoice']['invoiceNo']!='$INV')")" "CANCELLED 2 True"
check "active invoice is the new one" "$(curl -s -H "Authorization: Bearer $C" $A/orders/$OID/invoice | py "print(d['invoice']['revision'], len(d['history']))")" "2 2"

# --- Invoice templates ---
check "templates list has a default" "$(curl -s -H "Authorization: Bearer $AD" $A/admin/invoice-templates | py "print(any(t['isDefault'] for t in d))")" True
check "template gstin validated" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/invoice-templates -d '{"name":"bad","gstin":"NOPE"}' -o /dev/null -w '%{http_code}')" 400
TPL=$(curl -s -H "Authorization: Bearer $AD" $A/admin/invoice-templates | py "print(d[0]['id'])")
check "template preview html" "$(curl -s -o /dev/null -w '%{http_code}' "$A/admin/invoice-templates/$TPL/preview?t=$AD")" 200
check "template preview needs token" "$(curl -s -o /dev/null -w '%{http_code}' "$A/admin/invoice-templates/$TPL/preview")" 401
check "sales cannot edit templates" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/admin/invoice-templates -d '{"name":"x"}' -o /dev/null -w '%{http_code}')" 403
check "new invoice number unique + prefixed" "$(curl -s -H "Authorization: Bearer $C" $A/orders/$OID/invoice | py "import re;print(bool(re.match(r'^[A-Z0-9-]{1,8}/20\\d\\d-\\d\\d/\\d{6}$', d['invoice']['invoiceNo'])))")" True

# --- Issues desk ---
IS=$(curl "${J[@]}" -H "Authorization: Bearer $C" -X POST $A/issues -d "{\"category\":\"DAMAGED\",\"title\":\"Smoke torn bag\",\"orderId\":\"$OID\"}")
IID=$(echo "$IS" | py "print(d['id'])"); check "customer raises issue (auto HIGH)" "$(echo "$IS" | py "print(d['status'], d['priority'])")" "OPEN HIGH"
check "bad category rejected" "$(curl "${J[@]}" -H "Authorization: Bearer $C" -X POST $A/issues -d '{"category":"NOPE","title":"x"}' -o /dev/null -w '%{http_code}')" 400
check "staff sees queue" "$(curl -s -H "Authorization: Bearer $SL" "$A/issues?status=OPEN" | py "print(any(i['id']=='$IID' for i in d))")" True
curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/issues/$IID/messages -d '{"body":"On it","internal":false}' >/dev/null
curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/issues/$IID/messages -d '{"body":"secret","internal":true}' >/dev/null
check "reply auto-assigns + in progress" "$(curl -s -H "Authorization: Bearer $SL" $A/issues/$IID | py "print(d['status'], d['assignee'] is not None, d['firstResponseAt'] is not None)")" "IN_PROGRESS True True"
check "customer never sees internal notes" "$(curl -s -H "Authorization: Bearer $C" $A/issues/$IID | py "print(len(d['messages']))")" 1
check "customer cannot change status" "$(curl "${J[@]}" -H "Authorization: Bearer $C" -X PATCH $A/issues/$IID -d '{"status":"CLOSED"}' -o /dev/null -w '%{http_code}')" 403
check "resolve needs note" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X PATCH $A/issues/$IID -d '{"status":"RESOLVED"}' -o /dev/null -w '%{http_code}')" 400
check "resolve with note" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X PATCH $A/issues/$IID -d '{"status":"RESOLVED","resolution":"replaced"}' | py "print(d['status'])")" RESOLVED
check "whatsapp RATE closes + rates" "$(curl "${J[@]}" -X POST $A/webhooks/whatsapp -d '{"phone":"919000000003","text":"RATE 4"}' | py "print(d['action'])")" issue_rate
check "whatsapp ISSUE opens or appends ticket" "$(curl "${J[@]}" -X POST $A/webhooks/whatsapp -d '{"phone":"919000000003","text":"ISSUE order is late"}' | py "print(d['action'].startswith('issue_'))")" True
check "issue stats" "$(curl -s -H "Authorization: Bearer $AD" $A/issues/stats | py "print(d['open']>=1 and 'byCategory30d' in d)")" True

# --- Order modifications + discount approvals ---
MO=$(curl "${J[@]}" -H "Authorization: Bearer $C" -X POST $A/orders -d "{\"addressId\":\"$ADDR\",\"deliveryDate\":\"$(date -d '+2 day' +%F)\",\"items\":[{\"skuId\":\"$SKU\",\"qty\":1}],\"paymentMethod\":\"UPI\"}"); MOID=$(echo "$MO" | py "print(d['id'])"); MT0=$(echo "$MO" | py "print(d['totalPaise'])")
check "customer adds note (self-service)" "$(curl "${J[@]}" -H "Authorization: Bearer $C" -X PATCH $A/orders/$MOID -d '{"type":"NOTE","reason":"gate code","note":"Gate code 4321"}' | py "print(d['status'])")" APPLIED
check "customer cannot change items" "$(curl "${J[@]}" -H "Authorization: Bearer $C" -X PATCH $A/orders/$MOID -d '{"type":"ITEMS","reason":"x","items":[]}' -o /dev/null -w '%{http_code}')" 403
check "modify needs reason" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/orders/$MOID/modify -d "{\"type\":\"ITEMS\",\"items\":[{\"skuId\":\"$SKU\",\"qty\":2}]}" -o /dev/null -w '%{http_code}')" 400
check "paid order increase needs collect flag" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/orders/$MOID/modify -d "{\"type\":\"ITEMS\",\"reason\":\"wants 2 bags\",\"items\":[{\"skuId\":\"$SKU\",\"qty\":2}]}" -o /dev/null -w '%{http_code}')" 400
MI=$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/orders/$MOID/modify -d "{\"type\":\"ITEMS\",\"reason\":\"wants 2 bags\",\"collectOnDelivery\":true,\"items\":[{\"skuId\":\"$SKU\",\"qty\":2}]}")
check "items modified, delta positive" "$(echo "$MI" | py "print(d['status']=='APPLIED' and d['after']['delta']>0 and d['after']['items'][0]['qty']==2)")" True
check "order revision + balance due event" "$(curl -s -H "Authorization: Bearer $C" $A/orders/$MOID | py "print(d['revision']==3 and d['items'][0]['qty']==2 and any(e['type']=='BALANCE_DUE' for e in d['events']) and len(d['modifications'])==2)")" True
check "audit trail visible to staff" "$(curl -s -H "Authorization: Bearer $SL" $A/orders/$MOID/modifications | py "print(len(d)==2 and d[1]['requester']['role']=='ADMIN')")" True
check "discount limits default" "$(curl -s -H "Authorization: Bearer $SL" $A/admin/settings/discount-limits | py "print(d['SALES'])")" 10000
check "sales cannot edit limits" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X PUT $A/admin/settings/discount-limits -d '{"SALES":1}' -o /dev/null -w '%{http_code}')" 403
W1=$(curl -s -H "Authorization: Bearer $C" $A/auth/me | py "print(d['walletBalance'])")
check "sales small discount auto-applied" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/admin/orders/$MOID/discount -d '{"amountPaise":5000,"reason":"late delivery apology"}' | py "print(d['applied'])")" True
check "paid order → wallet credit" "$(curl -s -H "Authorization: Bearer $C" $A/auth/me | py "print(d['walletBalance']-$W1)")" 5000
PD=$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/admin/orders/$MOID/discount -d '{"amountPaise":15000,"reason":"damaged bag"}'); PDID=$(echo "$PD" | py "print(d['id'])")
check "sales big discount goes to approval" "$(echo "$PD" | py "print(d['status'], d['approvers'][0])")" "PENDING_APPROVAL OPS"
check "discount over pct cap rejected" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/orders/$MOID/discount -d '{"pct":50,"reason":"x"}' -o /dev/null -w '%{http_code}')" 400
check "sales cannot see approvals" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SL" $A/admin/approvals)" 403
check "approval queue lists it" "$(curl -s -H "Authorization: Bearer $AD" $A/admin/approvals | py "print(any(x['id']=='$PDID' and x['canApprove'] for x in d))")" True
check "reject needs note" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/approvals/$PDID/reject -d '{}' -o /dev/null -w '%{http_code}')" 400
check "admin approves" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/approvals/$PDID/approve -d '{"note":"ok"}' | py "print(d['status'])")" APPROVED
check "approved discount applied to order" "$(curl -s -H "Authorization: Bearer $C" $A/orders/$MOID | py "print(d['discountPaise'])")" 20000
check "already decided" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/approvals/$PDID/approve -d '{}' -o /dev/null -w '%{http_code}')" 400
check "approval stats" "$(curl -s -H "Authorization: Bearer $SL" $A/admin/approvals/stats | py "print(d['discountsToday']>=2)")" True
# --- HR: attendance, leave, roster, payroll ---
MON=$(date +%Y-%m); MID=$(curl -s -H "Authorization: Bearer $AD" $A/admin/staff | py "print([s['id'] for s in d if s['role']=='MARKETING'][0])")
check "hr policy default" "$(curl -s -H "Authorization: Bearer $AD" $A/admin/hr/policy | py "print(d['fullDayHours'], len(d['leaveTypes']))")" "8 4"
check "customer blocked from hr" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $C" $A/me/hr)" 403
check "marketing (office role) can clock in" "$(curl "${J[@]}" -H "Authorization: Bearer $MK" -X POST $A/me/hr/clock-in -d '{}' | py "print('lateMin' in d)")" True
check "clock in twice is idempotent" "$(curl "${J[@]}" -H "Authorization: Bearer $MK" -X POST $A/me/hr/clock-in -d '{}' | py "print(d['alreadyOn'])")" True
check "me/hr shows on duty" "$(curl -s -H "Authorization: Bearer $MK" $A/me/hr | py "print(d['onDuty'] and d['today'] is not None and d['today']['firstIn'] is not None)")" True
check "clock out" "$(curl "${J[@]}" -H "Authorization: Bearer $MK" -X POST $A/me/hr/clock-out -d '{}' | py "print(d['endedAt'] is not None)")" True
check "hr today lists staff" "$(curl -s -H "Authorization: Bearer $AD" $A/admin/hr/today | py "print(any(r['user']['id']=='$MID' and r['firstIn'] for r in d['rows']))")" True
check "sales cannot see hr admin" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SL" $A/admin/hr/today)" 403
check "profile: salary + manager" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X PATCH $A/admin/hr/staff/$MID/profile -d "{\"employeeCode\":\"FR-MK1\",\"joinedOn\":\"2025-01-01\",\"designation\":\"Marketing exec\",\"monthlySalaryPaise\":3000000,\"weeklyOffs\":[0],\"managerId\":\"$SID\"}" | py "print(d['employeeCode'], d['monthlySalaryPaise'])")" "FR-MK1 3000000"
check "profile: bad weekly off rejected" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X PATCH $A/admin/hr/staff/$MID/profile -d '{"weeklyOffs":[9]}' -o /dev/null -w '%{http_code}')" 400
NXT=$(date -d "next monday +$((RANDOM % 40 + 2)) week" +%F); HOL=$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/hr/holidays -d "{\"date\":\"$(date -d '+40 day' +%F)\",\"name\":\"Smoke holiday\"}" | py "print(d['id'])")
check "holiday listed to staff" "$(curl -s -H "Authorization: Bearer $MK" "$A/hr/holidays?year=$(date -d '+40 day' +%Y)" | py "print(any(h['id']=='$HOL' for h in d))")" True
check "leave balances" "$(curl -s -H "Authorization: Bearer $MK" $A/me/hr/balances | py "print([b['balance'] for b in d if b['code']=='CL'][0] >= 0)")" True
check "leave needs reason" "$(curl "${J[@]}" -H "Authorization: Bearer $MK" -X POST $A/me/hr/leave -d "{\"type\":\"CL\",\"from\":\"$NXT\"}" -o /dev/null -w '%{http_code}')" 400
LV=$(curl "${J[@]}" -H "Authorization: Bearer $MK" -X POST $A/me/hr/leave -d "{\"type\":\"LWP\",\"from\":\"$NXT\",\"to\":\"$(date -d "$NXT +1 day" +%F)\",\"reason\":\"family function\"}"); LVID=$(echo "$LV" | py "print(d['id'])")
check "leave request 2 days pending" "$(echo "$LV" | py "print(d['status'], d['days'])")" "PENDING 2"
check "overlapping leave rejected" "$(curl "${J[@]}" -H "Authorization: Bearer $MK" -X POST $A/me/hr/leave -d "{\"type\":\"SL\",\"from\":\"$NXT\",\"reason\":\"x\"}" -o /dev/null -w '%{http_code}')" 400
check "manager (sales) sees report's request" "$(curl -s -H "Authorization: Bearer $SL" $A/hr/leave-queue | py "print(any(r['id']=='$LVID' for r in d))")" True
check "requester cannot self-approve" "$(curl "${J[@]}" -H "Authorization: Bearer $MK" -X POST $A/hr/leave/$LVID/approve -d '{}' -o /dev/null -w '%{http_code}')" 403
check "manager approves" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/hr/leave/$LVID/approve -d '{}' | py "print(d['status'])")" APPROVED
check "usage counted" "$(curl -s -H "Authorization: Bearer $MK" "$A/me/hr/balances?year=${NXT:0:4}" | py "print([b['used'] for b in d if b['code']=='LWP'][0] >= 2)")" True
YD=$(date -d "-$((RANDOM % 300 + 3)) day" +%F); RG=$(curl "${J[@]}" -H "Authorization: Bearer $MK" -X POST $A/me/hr/leave -d "{\"type\":\"REG\",\"from\":\"$YD\",\"reason\":\"forgot to punch\",\"claimedIn\":\"${YD}T03:30:00Z\",\"claimedOut\":\"${YD}T12:30:00Z\"}"); RGID=$(echo "$RG" | py "print(d['id'])")
check "regularisation pending" "$(echo "$RG" | py "print(d['status'], d['type'])")" "PENDING REG"
check "admin approves regularisation → shift created" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/hr/leave/$RGID/approve -d '{}' >/dev/null; curl -s -H "Authorization: Bearer $AD" "$A/admin/hr/attendance?month=${YD:0:7}&userId=$MID" | py "print([x['code'] for x in d['rows'][0]['days'] if x['date']=='$YD'][0])")" P
check "payroll json has net" "$(curl -s -H "Authorization: Bearer $AD" "$A/admin/hr/payroll?month=$MON" | py "print([r['netPayableRupees']>0 for r in d if r['employeeCode']=='FR-MK1'][0])")" True
check "payroll xlsx" "$(curl -s -o /dev/null -w '%{content_type}' -H "Authorization: Bearer $AD" "$A/admin/hr/payroll?month=$MON&format=xlsx" | cut -d';' -f1)" "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
check "attendance csv" "$(curl -s -H "Authorization: Bearer $AD" "$A/admin/hr/attendance.export?month=$MON&format=csv" | head -1 | grep -c 'Employee Code.*D01')" 1
check "roster upsert" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X PUT $A/admin/hr/roster -d "{\"rows\":[{\"userId\":\"$MID\",\"date\":\"$NXT\",\"start\":\"06:00\",\"end\":\"14:00\",\"label\":\"early\"}]}" | py "print(d['upserted'])")" 1
check "ops cannot edit policy" "$(curl "${J[@]}" -H "Authorization: Bearer $MK" -X PUT $A/admin/hr/policy -d '{"graceMin":5}' -o /dev/null -w '%{http_code}')" 403
curl -s -X DELETE -H "Authorization: Bearer $AD" $A/admin/hr/holidays/$HOL >/dev/null
# --- Fleet: vehicles, vendors, ledger, checks, costs ---
REG="TS09S$(date +%s | tail -c 5)"; FV=$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/fleet/vendors -d '{"name":"Smoke Autos","phone":"9800000011","paymentTerms":"monthly net 7"}'); FVID=$(echo "$FV" | py "print(d['id'])")
check "fleet vendor created" "$(echo "$FV" | py "print(d['name'])")" "Smoke Autos"
check "hired vehicle needs vendor" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/fleet/vehicles -d "{\"regNo\":\"$REG\",\"ownership\":\"HIRED\"}" -o /dev/null -w '%{http_code}')" 400
VH=$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/fleet/vehicles -d "{\"regNo\":\"$REG\",\"ownership\":\"HIRED\",\"vendorId\":\"$FVID\",\"hireRatePaise\":1500000,\"hireBasis\":\"PER_MONTH\",\"odometerKm\":12000,\"insuranceExpiry\":\"$(date -d '+10 day' +%F)\"}"); VHID=$(echo "$VH" | py "print(d['id'])")
check "vehicle created (regNo normalised)" "$(echo "$VH" | py "print(d['regNo']=='$REG' and d['status']=='ACTIVE')")" True
check "assign rider to vehicle" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X PATCH $A/admin/fleet/vehicles/$VHID -d "{\"assignedRiderId\":\"$RID\"}" | py "print(d['assignedRiderId']=='$RID')")" True
check "doc alert within 30d" "$(curl -s -H "Authorization: Bearer $AD" $A/admin/fleet/alerts | py "print(any(a['regNo']=='$REG' and a['kind']=='Insurance' for a in d))")" True
check "rider sees vehicle" "$(curl -s -H "Authorization: Bearer $R" $A/rider/vehicle | py "print(d['regNo']=='$REG' and d['checkedToday']==False)")" True
check "odometer below last rejected" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/vehicle/$VHID/logs -d '{"type":"FUEL","amountPaise":50000,"litres":5,"odometerKm":100}' -o /dev/null -w '%{http_code}')" 400
check "rider logs fuel" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/vehicle/$VHID/logs -d '{"type":"FUEL","amountPaise":50000,"litres":5,"odometerKm":12050}' | py "print(d['type'])")" FUEL
check "rider cannot log maintenance" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/vehicle/$VHID/logs -d '{"type":"MAINTENANCE","amountPaise":1}' -o /dev/null -w '%{http_code}')" 403
check "pre-trip check ok" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/vehicle/check -d '{"odometerStart":12050,"checklist":{"brakes":true,"lights":true}}' | py "print(d['ok'], d['vehicleStatus'])")" "True ACTIVE"
check "end trip" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/vehicle/end-trip -d '{"odometerEnd":12090}' | py "print(d['odometerEnd'])")" 12090
check "failed brakes → maintenance + ops alert" "$(curl "${J[@]}" -H "Authorization: Bearer $R" -X POST $A/rider/vehicle/check -d '{"checklist":{"brakes":false},"issues":"brake lever loose"}' | py "print(d['ok'], d['vehicleStatus'])")" "False MAINTENANCE"
check "ops alerted on whatsapp" "$(curl -s -H "Authorization: Bearer $AD" $A/notifications | py "print(any(x['template']=='vehicle_issue' and '$REG' in x['body'] for x in d))")" True
check "maintenance vehicle blocks route assign" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/dispatch/routes/$RT/assign -d "{\"riderId\":\"$RID\"}" -o /dev/null -w '%{http_code}')" 400
check "ops logs repair → back to active" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/fleet/vehicles/$VHID/logs -d '{"type":"REPAIR","amountPaise":120000,"vendorName":"Bajaj service","description":"brake lever","nextDueKm":15000}' >/dev/null; curl -s -H "Authorization: Bearer $AD" $A/admin/fleet/vehicles/$VHID | py "print(d['status'], d['serviceDue']['kmLeft'])")" "ACTIVE 2910"
check "bill monthly hire" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/fleet/vendors/$FVID/bill-hire -d "{\"month\":\"$MON\"}" | py "print(d['results'][0]['billedPaise'])")" 1500000
check "bill hire idempotent" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/fleet/vendors/$FVID/bill-hire -d "{\"month\":\"$MON\"}" | py "print(d['results'][0].get('skipped'))")" "already billed"
check "payment needs ref" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/fleet/vendors/$FVID/ledger -d '{"reason":"PAYMENT","amountPaise":500000}' -o /dev/null -w '%{http_code}')" 400
check "record payment" "$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/fleet/vendors/$FVID/ledger -d '{"reason":"PAYMENT","amountPaise":500000,"method":"UPI","ref":"UTR123"}' | py "print(d['deltaPaise'])")" -500000
check "vendor balance" "$(curl -s -H "Authorization: Bearer $AD" $A/admin/fleet/vendors/$FVID/ledger | py "print(d['balancePaise'], d['billed'], d['paid'])")" "1000000 1500000 500000"
check "cost per vehicle" "$(curl -s -H "Authorization: Bearer $AD" "$A/admin/fleet/costs?month=$MON" | py "print([ (c['hirePaise'], c['fuelPaise'], c['maintenancePaise'], c['km']) for c in d if c['regNo']=='$REG'][0])")" "(1500000, 50000, 120000, 40)"
check "fleet dashboard" "$(curl -s -H "Authorization: Bearer $AD" "$A/admin/fleet/dashboard?month=$MON" | py "print(d['counts']['vehicles']>=1 and d['month_cost']['totalPaise']>0)")" True
check "fleet export xlsx" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AD" "$A/admin/fleet/export?dataset=costs&month=$MON&format=xlsx")" 200
check "sales blocked from fleet" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SL" $A/admin/fleet/vehicles)" 403
curl "${J[@]}" -H "Authorization: Bearer $AD" -X PATCH $A/admin/fleet/vehicles/$VHID -d '{"assignedRiderId":null,"active":false}' >/dev/null
# --- Service API keys (MCP) ---
AK=$(curl "${J[@]}" -H "Authorization: Bearer $AD" -X POST $A/admin/api-keys -d '{"name":"smoke ro"}')
AKEY=$(echo "$AK" | py "print(d['key'])"); AKID=$(echo "$AK" | py "print(d['id'])")
check "api key reads" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AKEY" $A/admin/orders)" 200
check "read-only key cannot write" "$(curl "${J[@]}" -H "Authorization: Bearer $AKEY" -X POST $A/admin/coupons -d '{"code":"X"}' -o /dev/null -w '%{http_code}')" 403
check "sales cannot mint keys" "$(curl "${J[@]}" -H "Authorization: Bearer $SL" -X POST $A/admin/api-keys -d '{"name":"x"}' -o /dev/null -w '%{http_code}')" 403
curl -s -X DELETE -H "Authorization: Bearer $AD" $A/admin/api-keys/$AKID >/dev/null
check "revoked key rejected" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AKEY" $A/admin/orders)" 401
check "mcp http health" "$(curl -s http://localhost:4300/health | py "print(d['ok'])")" True
check "mcp http needs bearer" "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:4300/mcp -H 'Content-Type: application/json' -d '{}')" 401

[ $fail = 0 ] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }
