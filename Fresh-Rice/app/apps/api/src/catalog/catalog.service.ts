import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { agedMonths } from '../common/money';

@Injectable()
export class CatalogService {
  constructor(private db: PrismaService) {}

  /** Price precedence: B2B tier > zone > base */
  async priceFor(skuId: string, opts: { zoneId?: string | null; b2bTier?: number | null }) {
    const now = new Date();
    const valid = { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] };
    if (opts.b2bTier) {
      const p = await this.db.priceList.findFirst({ where: { skuId, scope: 'B2B_TIER', b2bTier: opts.b2bTier, ...valid }, orderBy: { validFrom: 'desc' } });
      if (p) return p.pricePaise;
    }
    if (opts.zoneId) {
      const p = await this.db.priceList.findFirst({ where: { skuId, scope: 'ZONE', zoneId: opts.zoneId, ...valid }, orderBy: { validFrom: 'desc' } });
      if (p) return p.pricePaise;
    }
    const p = await this.db.priceList.findFirst({ where: { skuId, scope: 'BASE', ...valid }, orderBy: { validFrom: 'desc' } });
    if (!p) throw new NotFoundException(`No price for sku ${skuId}`);
    return p.pricePaise;
  }

  /** Lot badge = the FIFO lot that would be shipped now (oldest milled with stock) */
  async lotBadge(varietyId: string) {
    const lot = await this.db.lot.findFirst({ where: { varietyId, onHandKg: { gt: 0 } }, orderBy: { milledOn: 'asc' }, include: { vendor: true } });
    if (!lot) return null;
    return { lotNo: lot.lotNo, mill: lot.vendor.name, district: lot.vendor.district, harvestSeason: lot.harvestSeason, milledOn: lot.milledOn, agedMonths: agedMonths(lot.milledOn), moisturePct: lot.moisturePct, brokenPct: lot.brokenPct };
  }

  async storefront(opts: { zoneId?: string | null; b2bTier?: number | null }) {
    const varieties = await this.db.variety.findMany({ include: { skus: { where: { active: true }, orderBy: { packKg: 'asc' } } }, orderBy: { isAddon: 'asc' } });
    const out: any[] = [];
    for (const v of varieties) {
      const stockKg = await this.db.lot.aggregate({ where: { varietyId: v.id }, _sum: { onHandKg: true } });
      const skus: any[] = [];
      for (const s of v.skus) {
        if (opts.b2bTier && !v.isAddon && s.packKg < 25) continue; // B2B sees bulk packs only
        skus.push({ id: s.id, code: s.code, packKg: s.packKg, gstPct: s.gstPct, pricePaise: await this.priceFor(s.id, opts), inStock: (stockKg._sum.onHandKg || 0) >= s.packKg });
      }
      if (!skus.length) continue;
      out.push({ id: v.id, code: v.code, name: v.name, nameTe: v.nameTe, description: v.description, isAddon: v.isAddon, agedPreferred: v.agedPreferred, stockKg: stockKg._sum.onHandKg || 0, lot: await this.lotBadge(v.id), skus });
    }
    return out;
  }
}
