import { PrismaClient, Role, PriceScope, SubFrequency } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  // Zones (pilot: Kukatpally + Madhapur + Gachibowli)
  const zones = await Promise.all([
    db.zone.upsert({ where: { id: 'zone-kphb' }, update: {}, create: { id: 'zone-kphb', name: 'Kukatpally / KPHB', pincodes: ['500072', '500085', '500090', '500050'] } }),
    db.zone.upsert({ where: { id: 'zone-madhapur' }, update: {}, create: { id: 'zone-madhapur', name: 'Madhapur / Hitec City', pincodes: ['500081', '500084', '500033'] } }),
    db.zone.upsert({ where: { id: 'zone-gachi' }, update: {}, create: { id: 'zone-gachi', name: 'Gachibowli / Kondapur', pincodes: ['500032', '500019', '500046'] } }),
  ]);
  for (const z of zones) {
    for (const s of [['07:00-10:00', 7, 10], ['17:00-20:00', 17, 20]] as const) {
      const exists = await db.slot.findFirst({ where: { zoneId: z.id, label: s[0] } });
      if (!exists) await db.slot.create({ data: { zoneId: z.id, label: s[0], startHour: s[1], endHour: s[2], capacity: 60 } });
    }
  }

  // Warehouses
  await db.warehouse.upsert({ where: { code: 'KPHB' }, update: {}, create: { id: 'wh-kphb', code: 'KPHB', name: 'Kukatpally Micro-Fulfilment Centre', address: 'Plot 12, Balanagar Industrial Area', pincode: '500037' } });
  await db.warehouse.upsert({ where: { code: 'UPPAL' }, update: {}, create: { id: 'wh-uppal', code: 'UPPAL', name: 'Uppal Hub (Phase 2)', address: 'Survey 45, Uppal Industrial Estate', pincode: '500039' } });
  await db.zone.updateMany({ where: { warehouseId: null }, data: { warehouseId: 'wh-kphb' } });

  // Vendors (mills + add-on suppliers + packaging)
  await Promise.all([
    db.vendor.upsert({ where: { id: 'mill-miryalaguda' }, update: {}, create: { id: 'mill-miryalaguda', name: 'Sri Balaji Rice Mills', type: 'MILL', district: 'Nalgonda (Miryalaguda)', contact: 'B2B desk', phone: '+919848000001', gstin: '36AABCS1234A1Z1', termsDays: 7, rating: 5 } }),
    db.vendor.upsert({ where: { id: 'mill-warangal' }, update: {}, create: { id: 'mill-warangal', name: 'Padmasri Rice Industries', type: 'MILL', district: 'Warangal', phone: '+919848000002', gstin: '36AABCP5678B1Z2', termsDays: 7, rating: 4 } }),
    db.vendor.upsert({ where: { id: 'mill-karimnagar' }, update: {}, create: { id: 'mill-karimnagar', name: 'Vajrateja Rice', type: 'MILL', district: 'Karimnagar', phone: '+919848000003', gstin: '36AABCV9012C1Z3', termsDays: 15, rating: 4 } }),
    db.vendor.upsert({ where: { id: 'vendor-addons' }, update: {}, create: { id: 'vendor-addons', name: 'Telangana Agro Traders (dal/ghee/oil)', type: 'ADDON_SUPPLIER', district: 'Hyderabad', phone: '+919848000004', termsDays: 15, rating: 4 } }),
    db.vendor.upsert({ where: { id: 'vendor-packaging' }, update: {}, create: { id: 'vendor-packaging', name: 'SafePack Polymers (bags & labels)', type: 'PACKAGING', district: 'Hyderabad', phone: '+919848000005', termsDays: 30, rating: 3 } }),
  ]);

  // Varieties + SKUs + base prices (paise per pack)
  const catalog: Array<[string, string, string, boolean, Array<[number, number]>]> = [
    ['SONA', 'Sona Masoori (Aged)', 'సోనా మసూరి', false, [[5, 30000], [10, 58000], [20, 112000], [25, 138000]]],
    ['HMT', 'HMT (Aged)', 'హెచ్‌ఎంటీ', false, [[10, 62000], [25, 150000]]],
    ['BPT', 'BPT 5204 (Aged)', 'బీపీటీ', false, [[10, 60000], [25, 145000]]],
    ['KOLAM', 'Kolam', 'కోలం', false, [[10, 56000], [25, 135000]]],
    ['BASMATI', 'Basmati 1121 Steam', 'బాస్మతి', false, [[1, 12500], [5, 59000], [25, 280000]]],
    ['BROWN', 'Brown Rice (Unpolished)', 'బ్రౌన్ రైస్', false, [[2, 19000], [5, 45000]]],
    ['TOOR', 'Toor Dal', 'కంది పప్పు', true, [[1, 16500]]],
    ['GHEE', 'Cow Ghee', 'నెయ్యి', true, [[0.5, 42000]]],
    ['GNOIL', 'Cold-pressed Groundnut Oil', 'వేరుశనగ నూనె', true, [[1, 28000]]],
  ];
  for (const [code, name, nameTe, isAddon, packs] of catalog) {
    const v = await db.variety.upsert({ where: { code }, update: {}, create: { code, name, nameTe, isAddon, agedPreferred: !isAddon && code !== 'BASMATI' && code !== 'BROWN' } });
    for (const [kg, paise] of packs) {
      const skuCode = `${code}-${kg}`;
      const sku = await db.sku.upsert({ where: { code: skuCode }, update: {}, create: { code: skuCode, varietyId: v.id, packKg: kg, gstPct: kg <= 25 ? 5 : 0 } });
      const p = await db.priceList.findFirst({ where: { skuId: sku.id, scope: PriceScope.BASE } });
      if (!p) await db.priceList.create({ data: { skuId: sku.id, scope: PriceScope.BASE, pricePaise: paise } });
      if (!isAddon && kg >= 25) {
        const t = await db.priceList.findFirst({ where: { skuId: sku.id, scope: PriceScope.B2B_TIER, b2bTier: 1 } });
        if (!t) await db.priceList.create({ data: { skuId: sku.id, scope: PriceScope.B2B_TIER, b2bTier: 1, pricePaise: Math.round(paise * 0.9) } });
      }
    }
  }

  // Lots (aged stock)
  const lotSpecs = [
    ['LOT-SONA-2508-01', 'mill-miryalaguda', 'SONA', 'Kharif 2025', '2026-01-12', 12.4, 2.1, 4400, 6000],
    ['LOT-SONA-2508-02', 'mill-miryalaguda', 'SONA', 'Kharif 2025', '2026-02-03', 12.8, 2.6, 4350, 4000],
    ['LOT-HMT-2508-01', 'mill-warangal', 'HMT', 'Rabi 2026', '2026-03-20', 12.1, 3.0, 4700, 3000],
    ['LOT-BPT-2508-01', 'mill-warangal', 'BPT', 'Kharif 2025', '2026-01-28', 12.6, 2.8, 4600, 2500],
    ['LOT-KOLAM-2508-01', 'mill-karimnagar', 'KOLAM', 'Rabi 2026', '2026-04-02', 12.9, 4.0, 4200, 2000],
    ['LOT-BASM-2509-01', 'mill-miryalaguda', 'BASMATI', 'Kharif 2025', '2026-09-05', 11.9, 1.2, 9500, 1500],
    ['LOT-BROWN-2509-01', 'mill-karimnagar', 'BROWN', 'Rabi 2026', '2026-09-08', 12.3, 3.5, 6800, 500],
    ['LOT-TOOR-2509-01', 'vendor-addons', 'TOOR', 'Kharif 2025', '2026-08-15', 10.5, 0, 12000, 400],
    ['LOT-GHEE-2509-01', 'vendor-addons', 'GHEE', 'n/a', '2026-09-01', 0, 0, 70000, 100],
    ['LOT-GNOIL-2509-01', 'vendor-addons', 'GNOIL', 'n/a', '2026-09-01', 0, 0, 22000, 200],
  ] as const;
  for (const [lotNo, vendorId, vcode, harvest, milled, moist, broken, cost, kg] of lotSpecs) {
    const v = await db.variety.findUniqueOrThrow({ where: { code: vcode } });
    const exists = await db.lot.findUnique({ where: { lotNo } });
    if (!exists) {
      const lot = await db.lot.create({ data: { lotNo, vendorId, warehouseId: 'wh-kphb', varietyId: v.id, harvestSeason: harvest, milledOn: new Date(milled), moisturePct: moist, brokenPct: broken, costPaisePerKg: cost, receivedKg: kg, onHandKg: kg } });
      await db.stockLedger.create({ data: { lotId: lot.id, kgDelta: kg, reason: 'GRN', refType: 'seed' } });
    }
  }

  // Users
  const admin = await db.user.upsert({ where: { phone: '+919000000001' }, update: {}, create: { phone: '+919000000001', name: 'Ops Admin', role: Role.ADMIN, lang: 'en', referralCode: 'ADMIN01' } });
  const rider = await db.user.upsert({ where: { phone: '+919000000002' }, update: {}, create: { phone: '+919000000002', name: 'Ravi (Rider)', role: Role.RIDER, lang: 'te', referralCode: 'RIDER01' } });
  const cust = await db.user.upsert({ where: { phone: '+919000000003' }, update: {}, create: { phone: '+919000000003', name: 'Lakshmi', role: Role.CUSTOMER, lang: 'te', referralCode: 'LAKSHMI1' } });
  const b2bAcc = await db.b2bAccount.upsert({ where: { id: 'b2b-paradise' }, update: {}, create: { id: 'b2b-paradise', name: 'Sri Sai PG, Ameerpet', gstin: '36AAAAA0000A1Z5', tier: 1, creditLimitPaise: 0, termsDays: 0 } });
  const b2bUser = await db.user.upsert({ where: { phone: '+919000000004' }, update: {}, create: { phone: '+919000000004', name: 'Suresh (PG Manager)', role: Role.B2B_USER, lang: 'en', b2bAccountId: b2bAcc.id, referralCode: 'SURESH01' } });
  const marketing = await db.user.upsert({ where: { phone: '+919000000005' }, update: {}, create: { phone: '+919000000005', name: 'Priya (Marketing)', role: Role.MARKETING, lang: 'en', referralCode: 'MKT001' } });
  const sales = await db.user.upsert({ where: { phone: '+919000000006' }, update: {}, create: { phone: '+919000000006', name: 'Arjun (Sales)', role: Role.SALES, lang: 'en', referralCode: 'SALES01' } });
  const whStaff = await db.user.upsert({ where: { phone: '+919000000007' }, update: {}, create: { phone: '+919000000007', name: 'Rakesh (Warehouse)', role: Role.WAREHOUSE_STAFF, lang: 'te', warehouseId: 'wh-kphb', referralCode: 'WH001' } });
  const vendorUser = await db.user.upsert({ where: { phone: '+919000000008' }, update: {}, create: { phone: '+919000000008', name: 'Mill Contact (Vendor Portal)', role: Role.VENDOR_USER, lang: 'en', vendorId: 'mill-miryalaguda', referralCode: 'VEND001' } });

  // Sample leads for the sales CRM
  const leadSeeds = [
    { name: 'Green Valley Apartments', phone: '+919812340001', company: 'Green Valley Apartments RWA', source: 'referral', status: 'NEW' as const, estValuePaise: 5000000, assignedToId: sales.id },
    { name: 'Hotel Sai Residency', phone: '+919812340002', company: 'Hotel Sai Residency', source: 'cold call', status: 'CONTACTED' as const, estValuePaise: 12000000, assignedToId: sales.id, nextFollowUpAt: new Date(Date.now() + 86400000) },
    { name: 'Campus Canteen Co-op', phone: '+919812340003', company: 'BITS Canteen Co-op', source: 'walk-in', status: 'QUALIFIED' as const, estValuePaise: 8000000, assignedToId: sales.id, nextFollowUpAt: new Date(Date.now() - 86400000) },
  ];
  for (const l of leadSeeds) { const exists = await db.lead.findFirst({ where: { phone: l.phone } }); if (!exists) await db.lead.create({ data: l }); }

  const addrExists = await db.address.findFirst({ where: { userId: cust.id } });
  let addr = addrExists;
  if (!addr) addr = await db.address.create({ data: { userId: cust.id, line1: 'Flat 402, Sai Enclave, Road 3', complex: 'Sai Enclave', landmark: 'Opp. Forum Mall', floor: 4, hasLift: true, pincode: '500072', zoneId: 'zone-kphb', lat: 17.4849, lng: 78.3914 } });
  const b2bAddr = await db.address.findFirst({ where: { userId: b2bUser.id } });
  if (!b2bAddr) await db.address.create({ data: { userId: b2bUser.id, label: 'PG Kitchen', line1: '8-3-222, Ameerpet Main Rd', pincode: '500016', zoneId: 'zone-madhapur', floor: 0, hasLift: false, lat: 17.4375, lng: 78.4483 } });

  const sona20 = await db.sku.findUniqueOrThrow({ where: { code: 'SONA-20' } });
  const subExists = await db.subscription.findFirst({ where: { userId: cust.id } });
  if (!subExists) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
    await db.subscription.create({ data: { userId: cust.id, skuId: sona20.id, addressId: addr.id, qty: 1, frequency: SubFrequency.TRIWEEKLY, nextRunOn: tomorrow } });
  }
  console.log('Seed complete: 3 zones, 2 warehouses, 5 vendors, 9 varieties, 10 lots, 8 users, 3 sample leads');
  console.log('Login phones: admin +919000000001 | rider +919000000002 | customer +919000000003 | b2b +919000000004 | marketing +919000000005 | sales +919000000006 | warehouse-staff +919000000007 | vendor-portal +919000000008 (OTP dev mode: 123456)');
}
main().finally(() => db.$disconnect());
