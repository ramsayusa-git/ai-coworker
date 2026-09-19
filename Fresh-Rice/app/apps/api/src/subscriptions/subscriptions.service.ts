import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubFrequency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { addDays, startOfDay } from '../common/money';

const DAYS: Record<SubFrequency, number> = { WEEKLY: 7, BIWEEKLY: 14, TRIWEEKLY: 21, MONTHLY: 30 };

@Injectable()
export class SubscriptionsService {
  private log = new Logger('Subscriptions');
  constructor(private db: PrismaService, private orders: OrdersService, private notify: NotificationsService) {}

  mine(userId: string) { return this.db.subscription.findMany({ where: { userId, status: { not: 'CANCELLED' } }, include: { sku: { include: { variety: true } }, address: true, orders: { orderBy: { createdAt: 'desc' }, take: 3 } } }); }

  async create(userId: string, d: { skuId: string; addressId: string; qty: number; frequency: SubFrequency; firstDeliveryOn: string }) {
    const first = startOfDay(new Date(d.firstDeliveryOn));
    if (first < startOfDay(addDays(new Date(), 1))) throw new BadRequestException('First delivery must be tomorrow or later');
    const sub = await this.db.subscription.create({ data: { userId, skuId: d.skuId, addressId: d.addressId, qty: d.qty || 1, frequency: d.frequency, nextRunOn: first, mandateRef: 'mock_mandate_' + Math.random().toString(36).slice(2, 8) }, include: { sku: { include: { variety: true } } } });
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    await this.notify.send(u.phone, 'sub_created', `Subscription set: ${sub.qty} × ${sub.sku.variety.name} ${sub.sku.packKg}kg every ${DAYS[sub.frequency]} days. First delivery ${first.toLocaleDateString('en-IN')}. Reply SKIP anytime to skip.`);
    return sub;
  }

  async update(userId: string, id: string, d: { action: 'pause' | 'resume' | 'skip' | 'cancel' | 'qty' | 'date'; qty?: number; nextRunOn?: string }) {
    const s = await this.db.subscription.findFirst({ where: { id, userId } });
    if (!s) throw new NotFoundException();
    const data: any = {};
    if (d.action === 'pause') data.status = 'PAUSED';
    if (d.action === 'resume') data.status = 'ACTIVE';
    if (d.action === 'cancel') data.status = 'CANCELLED';
    if (d.action === 'skip') data.skipNext = true;
    if (d.action === 'qty') data.qty = d.qty;
    if (d.action === 'date') data.nextRunOn = startOfDay(new Date(d.nextRunOn!));
    return this.db.subscription.update({ where: { id }, data });
  }

  /** Nightly 22:00 IST: generate tomorrow's subscription orders, charge mandate, WhatsApp T-24h notice */
  @Cron('0 22 * * *', { timeZone: 'Asia/Kolkata' })
  async nightlyRun() { return this.runFor(startOfDay(addDays(new Date(), 1))); }

  async runFor(date: Date) {
    const due = await this.db.subscription.findMany({ where: { status: 'ACTIVE', nextRunOn: { lte: date } }, include: { user: true, sku: { include: { variety: true } } } });
    const result = { date, processed: 0, created: 0, skipped: 0, failed: 0, errors: [] as string[] };
    for (const s of due) {
      result.processed++;
      const next = addDays(s.nextRunOn, DAYS[s.frequency]);
      if (s.skipNext) { await this.db.subscription.update({ where: { id: s.id }, data: { skipNext: false, nextRunOn: next } }); result.skipped++; continue; }
      try {
        await this.orders.create(s.userId, { addressId: s.addressId, items: [{ skuId: s.skuId, qty: s.qty }], paymentMethod: 'MANDATE', channel: 'SUBSCRIPTION', subscriptionId: s.id, deliveryDate: date.toISOString(), idempotencyKey: `sub:${s.id}:${date.toISOString().slice(0, 10)}` });
        await this.db.subscription.update({ where: { id: s.id }, data: { nextRunOn: next } });
        result.created++;
      } catch (e: any) {
        result.failed++; result.errors.push(`${s.id}: ${e.message}`);
        this.log.warn(`Subscription ${s.id} failed: ${e.message}`);
        await this.notify.send(s.user.phone, 'sub_failed', `We couldn't place your ${s.sku.variety.name} delivery (${e.message}). Tap to pay & confirm: https://freshrice.in/pay/${s.id}`);
      }
    }
    this.log.log(`Run ${date.toDateString()}: ${JSON.stringify({ ...result, errors: undefined })}`);
    return result;
  }
  all() { return this.db.subscription.findMany({ include: { user: { select: { name: true, phone: true } }, sku: { include: { variety: true } }, address: { include: { zone: true } } }, orderBy: { nextRunOn: 'asc' } }); }
}
