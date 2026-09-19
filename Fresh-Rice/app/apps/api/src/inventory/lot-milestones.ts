import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * "Your rice's birthday": when a lot a customer recently bought crosses 6 months aged, tell them it just
 * hit the sweet spot; past 12 months, nudge them to a fresher lot. One message per (customer, lot, milestone),
 * only for bags delivered in the last 60 days, aged-preferred varieties only.
 */
@Injectable()
export class LotMilestonesService {
  private log = new Logger('LotMilestones');
  constructor(private db: PrismaService, private notify: NotificationsService) {}

  @Cron('0 10 * * *', { timeZone: 'Asia/Kolkata' })
  async cron() { const r = await this.run(); this.log.log(`Lot milestones: ${JSON.stringify(r)}`); }

  async run() {
    const since = new Date(Date.now() - 60 * 86400000);
    const items = await this.db.orderItem.findMany({
      where: { lotId: { not: null }, order: { status: 'DELIVERED', channel: 'B2C', updatedAt: { gte: since } }, lot: { variety: { agedPreferred: true } } },
      include: { lot: { include: { variety: true } }, order: { include: { user: { select: { id: true, phone: true, name: true } } } } },
    });
    let sent = 0, skipped = 0;
    const seen = new Set<string>();
    for (const it of items) {
      const lot = it.lot!; const user = it.order.user;
      const agedDays = Math.floor((Date.now() - lot.milledOn.getTime()) / 86400000);
      const milestone = agedDays >= 365 ? '12m' : agedDays >= 180 ? '6m' : null;
      if (!milestone) { skipped++; continue; }
      const key = `${user.id}|${lot.lotNo}|${milestone}`;
      if (seen.has(key)) continue; seen.add(key);
      const already = await this.db.event.findFirst({ where: { type: 'lot_milestone', actor: user.id, payload: { path: ['lotNo'], equals: lot.lotNo } , AND: { payload: { path: ['milestone'], equals: milestone } } } });
      if (already) { skipped++; continue; }
      const first = (user.name || '').split(' ')[0] || 'there';
      const body = milestone === '6m'
        ? `Hi ${first}, the ${lot.variety.name} you bought (lot ${lot.lotNo}) just crossed 6 months since milling — it's in its sweet spot now. Cook it with a little more water than usual. Details: https://freshrice.in/trace/${lot.lotNo}`
        : `Hi ${first}, your ${lot.variety.name} (lot ${lot.lotNo}) is now over 12 months old. Still fine to eat, but a fresher lot will cook up better — reply RESUME or order at https://freshrice.in/shop`;
      await this.notify.send(user.phone, 'lot_milestone', body);
      await this.db.event.create({ data: { actor: user.id, type: 'lot_milestone', payload: { lotNo: lot.lotNo, milestone, orderId: it.orderId } } });
      sent++;
    }
    return { candidates: items.length, sent, skipped };
  }
}
