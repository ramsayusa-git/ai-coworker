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
SID=$(curl -s -H "Authorization: Bearer $AD" $A/admin/staff | py "print([s['id'] for s in d if s['role']=='SALES'][0])")
curl "${J[@]}" -H "Authorization: Bearer $AD" -X PATCH $A/admin/staff/$SID -d '{"isField":true}' >/dev/null
SL=$(tok 9000000006)  # re-login so the JWT carries isField
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

[ $fail = 0 ] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }
