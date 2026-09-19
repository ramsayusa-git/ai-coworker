import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

/** Cook-mode: rice:water ratio and soak time for THIS lot. Aged rice has lost moisture and absorbs more
 *  water; higher lot moisture needs a touch less. Numbers are for an open pot / cooker with the lid on;
 *  the page tells users to adjust ±¼ cup to taste. */
export function cookGuide(agedPreferred: boolean, agedMonths: number, moisturePct: number) {
  let ratio = agedPreferred ? 1.8 : 1.5;
  if (agedPreferred) ratio += Math.min(Math.max(agedMonths - 6, 0), 6) * 0.05; // +0.05 per month past 6, up to 12
  if (moisturePct > 13) ratio -= 0.1; else if (moisturePct < 11.5) ratio += 0.1;
  ratio = Math.round(ratio * 10) / 10;
  const soakMin = agedPreferred ? (agedMonths >= 9 ? 30 : 20) : 10;
  const cookerWhistles = agedPreferred ? 3 : 2;
  return { ratio: `1 : ${ratio.toFixed(1)}`, waterPerCup: ratio, soakMin, cookerWhistles, potMin: agedPreferred ? 18 : 14,
    note: agedPreferred ? 'Aged rice drinks more water than the bag you\'re used to — start here, then adjust ¼ cup either way to taste.' : 'Fresh-milled rice needs less water and less soaking or it goes mushy.' };
}
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../common/auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { Roles, ScopeWarehouse, CurrentUser } from '../common/auth.guard';
// WAREHOUSE_STAFF may use the warehouse-scoped endpoints below (their own warehouseId only,
// enforced by @ScopeWarehouse); transfers between warehouses stay ADMIN/OPS only.
// Same pattern as invoices/issues: customer-facing links must come from PUBLIC_WEB_URL, never a hardcoded host.
// This one ends up printed on physical bags, so a wrong host here is permanent once the bags ship.
const PUBLIC_BASE = process.env.PUBLIC_WEB_URL || 'https://freshrice.in';

@ApiTags('inventory') @ApiBearerAuth() @Roles('ADMIN', 'OPS', 'WAREHOUSE_STAFF') @Controller('inventory')
export class InventoryController {
  constructor(private svc: InventoryService, private db: PrismaService, private jwt: JwtService) {}
  /** Public lot-traceability lookup for the bag-label QR: /v1/inventory/trace/:lotNo — no auth, safe fields only.
   *  @Roles() with no args overrides the class-level ADMIN/OPS/WAREHOUSE_STAFF restriction — @Public() alone
   *  only skips the "token required" check, it doesn't clear an inherited @Roles() list. */
  @Public() @Roles() @Get('trace/:lotNo') async trace(@Param('lotNo') lotNo: string, @Req() req: Request) {
    const lot = await this.db.lot.findUnique({ where: { lotNo }, include: { vendor: true, variety: { include: { skus: { where: { active: true }, include: { prices: { where: { scope: 'BASE', validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] }, orderBy: { validFrom: 'desc' }, take: 1 } } } } } } });
    // Log the scan (fire-and-forget) for the duplicate-scan flag — BEFORE the not-found return, so a QR carrying a
    // lot code we never issued is also recorded and shows up as "unknown lot" on Stock & Lots.
    // Behind nginx the real IP is in X-Forwarded-For.
    const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    this.db.traceScan.create({ data: { lotNo: lotNo.slice(0, 64), ip, ua: (req.headers['user-agent'] || '').toString().slice(0, 200) } }).catch(() => {});
    if (!lot) return { found: false };
    const agedDays = Math.max(0, Math.floor((Date.now() - lot.milledOn.getTime()) / 86400000));
    const agedMonths = Math.floor(agedDays / 30);
    // Cheapest per-kg base price for this variety, so the page can compare against a supermarket bag.
    const perKg = lot.variety.skus.filter((s) => s.prices[0]).map((s) => Math.round(s.prices[0].pricePaise / s.packKg));
    return {
      found: true,
      lotNo: lot.lotNo,
      variety: lot.variety.name,
      agedPreferred: lot.variety.agedPreferred,
      mill: lot.vendor.name,
      district: lot.vendor.district || null,
      harvestSeason: lot.harvestSeason,
      milledOn: lot.milledOn,
      agedDays,
      agedMonths,
      moisturePct: lot.moisturePct,
      brokenPct: lot.brokenPct,
      ourPricePerKgPaise: perKg.length ? Math.min(...perKg) : null,
      cook: cookGuide(lot.variety.agedPreferred, agedMonths, lot.moisturePct),
      millStory: lot.vendor.story ? { title: lot.vendor.storyTitle || lot.vendor.name, text: lot.vendor.story, photo: lot.vendor.storyPhoto || null } : null,
    };
  }
  /** Printable bag labels for a lot: /v1/inventory/lots/:id/labels.html?packKg=20&count=10&t=<jwt>
   *  Opened as a plain <a target=_blank> link (browser navigation, no Authorization header), so it must
   *  be @Public() AND override the class-level @Roles() (see the same note on trace() above) — the
   *  manual jwt.verifyAsync(t) below is what actually enforces admin/ops/warehouse-staff access. */
  @Public() @Roles() @Get('lots/:id/labels.html') async labels(@Param('id') id: string, @Query('packKg') packKg = '20', @Query('count') count = '12', @Query('t') t: string, @Res() res: Response) {
    try { const u: any = await this.jwt.verifyAsync(t || '', { secret: process.env.JWT_SECRET || 'dev' }); if (!['ADMIN', 'OPS', 'WAREHOUSE_STAFF'].includes(u.role)) throw new Error(); } catch { return res.status(401).send('Login required'); }
    const lot = await this.db.lot.findUniqueOrThrow({ where: { id }, include: { vendor: true, variety: true, warehouse: true } });
    const aged = Math.floor((Date.now() - lot.milledOn.getTime()) / 2592000000);
    const qr = await QRCode.toDataURL(`${PUBLIC_BASE}/trace/${lot.lotNo}`, { margin: 0, width: 160 });
    const label = `<div class=l><div class=h><b>FreshRice</b><span>${lot.variety.name}</span></div><div class=big>${packKg} kg</div><div class=g><img src="${qr}"><div class=s>Lot <b>${lot.lotNo}</b><br>Mill: ${lot.vendor.name}, ${lot.vendor.district || ''}<br>Harvest ${lot.harvestSeason} · Milled ${lot.milledOn.toLocaleDateString('en-IN')}<br>${lot.variety.agedPreferred ? 'Aged ' + aged + ' months' : 'Milled ' + aged + ' months ago'} · Moisture ${lot.moisturePct}% · Brokens ${lot.brokenPct}%<br><small>FSSAI 13626000000000 · Net Qty ${packKg} kg · Packed at ${lot.warehouse.code} · MRP incl. GST · Store cool & dry</small></div></div></div>`;
    res.type('html').send(`<!doctype html><meta charset=utf-8><title>Labels ${lot.lotNo}</title><style>body{font-family:Arial;margin:8mm}.l{width:100mm;height:60mm;border:1px dashed #999;padding:4mm;box-sizing:border-box;display:inline-block;margin:2mm;vertical-align:top;page-break-inside:avoid}.h{display:flex;justify-content:space-between;font-size:14px}.big{font-size:32px;font-weight:bold}.g{display:flex;gap:4mm}.g img{width:34mm;height:34mm}.s{font-size:10px;line-height:1.35}small{font-size:8px;color:#555}@media print{button{display:none}}</style><button onclick="print()">Print</button><br>${label.repeat(Number(count))}`);
  }
  @Get('summary') summary(@CurrentUser() u: any, @Query('warehouseId') w?: string) { return this.svc.stockSummary(u.role === 'WAREHOUSE_STAFF' ? u.warehouseId : w); }
  @Get('lots') lots(@CurrentUser() u: any, @Query('varietyId') varietyId?: string, @Query('warehouseId') warehouseId?: string) { return this.svc.lots({ varietyId, warehouseId: u.role === 'WAREHOUSE_STAFF' ? u.warehouseId : warehouseId }); }
  @Get('lots/:id/ledger') ledger(@Param('id') id: string) { return this.svc.ledger(id); }
  @Post('grn') @ScopeWarehouse('warehouseId') receive(@Body() b: any) { return this.svc.receive(b); }
  @Post('lots/:id/adjust') adjust(@Param('id') id: string, @Body() b: { kgDelta: number; reason: 'DAMAGE' | 'ADJUST'; note?: string }) { return this.svc.adjust(id, b.kgDelta, b.reason, b.note); }
  @Post('transfer') @Roles('ADMIN', 'OPS') transfer(@Body() b: { lotId: string; toWarehouseId: string; kg: number; note?: string }) { return this.svc.transfer(b); }
  @Get('transfers') @Roles('ADMIN', 'OPS') transfers() { return this.svc.transfers(); }
}
