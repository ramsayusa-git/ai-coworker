import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/auth.guard';
import { CatalogService } from '../catalog/catalog.service';

/** Typical Indian household consumption; used until the customer has 2+ deliveries of history. */
const KG_PER_PERSON_PER_DAY = 0.15;

@ApiTags('orders') @ApiBearerAuth() @Controller('orders')
export class RiceMeterController {
  constructor(private db: PrismaService, private catalog: CatalogService) {}

  /** Household rice meter: predicts when the last bag runs out and what to reorder. */
  @Get('rice-meter') async meter(@CurrentUser() u: any) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: u.sub }, select: { householdSize: true } });
    const delivered = await this.db.order.findMany({ where: { userId: u.sub, status: 'DELIVERED', channel: 'B2C' }, orderBy: { updatedAt: 'desc' }, take: 6, include: { address: { select: { zoneId: true } }, items: { include: { sku: { include: { variety: true } } } } } });
    if (!delivered.length) return { hasHistory: false, householdSize: user.householdSize };
    const last = delivered[0];
    const lastKg = last.totalKg;
    // Daily rate: measured from delivery gaps when we have 2+ deliveries, else household-size default.
    let dailyKg: number; let basis: 'measured' | 'household' | 'default';
    const first = delivered[delivered.length - 1];
    const spanDays = (last.updatedAt.getTime() - first.updatedAt.getTime()) / 86400000;
    // Measured rate only once there's a real span of history (3+ weeks) — two bags bought in one week for a
    // function would otherwise look like a 10 kg/day household. Capped at a sane ceiling either way.
    if (delivered.length >= 2 && spanDays >= 21) {
      const kgConsumed = delivered.slice(1).reduce((a, o) => a + o.totalKg, 0); // everything before the latest bag has been eaten
      dailyKg = Math.min(kgConsumed / spanDays, (user.householdSize || 8) * 0.3); basis = 'measured';
    } else if (user.householdSize) { dailyKg = user.householdSize * KG_PER_PERSON_PER_DAY; basis = 'household'; }
    else { dailyKg = 4 * KG_PER_PERSON_PER_DAY; basis = 'default'; }
    dailyKg = Math.max(0.1, Math.round(dailyKg * 100) / 100);
    const daysTotal = lastKg / dailyKg;
    const elapsed = (Date.now() - last.updatedAt.getTime()) / 86400000;
    const daysLeft = Math.max(0, Math.round(daysTotal - elapsed));
    const runsOutOn = new Date(last.updatedAt.getTime() + daysTotal * 86400000);
    const kgLeft = Math.max(0, Math.round((lastKg - elapsed * dailyKg) * 10) / 10);
    const item = last.items[0];
    const pricePaise = item ? await this.catalog.priceFor(item.skuId, { zoneId: last.address?.zoneId }).catch(() => item.unitPaise) : 0;
    return {
      hasHistory: true, householdSize: user.householdSize, basis, dailyKg,
      lastDeliveredOn: last.updatedAt, lastKg, kgLeft, pctLeft: Math.round((kgLeft / lastKg) * 100), daysLeft, runsOutOn,
      reorderSoon: daysLeft <= 5,
      suggested: item ? { skuId: item.skuId, code: item.sku.code, name: item.sku.variety.name, packKg: item.sku.packKg, qty: item.qty, pricePaise, gstPct: item.sku.gstPct } : null,
    };
  }
}
