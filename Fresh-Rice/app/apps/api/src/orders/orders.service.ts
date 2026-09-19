import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { OrderStatus, PaymentMethod, OrderChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { InventoryService } from '../inventory/inventory.service';
import { ZonesService } from '../zones/zones.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CouponsService } from '../coupons/coupons.service';
import { gstFor, startOfDay, addDays, rupees } from '../common/money';

export interface CreateOrderInput {
  addressId: string; slotId?: string; deliveryDate?: string;
  items: { skuId: string; qty: number }[];
  paymentMethod: PaymentMethod; idempotencyKey?: string; notes?: string; couponCode?: string;
  channel?: OrderChannel; subscriptionId?: string;
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'FAILED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  DELIVERED: [], CANCELLED: [], FAILED: ['CONFIRMED'],
};
const DELIVERY_FEE_PAISE = 0;
const REFERRAL_PAISE = 10000; // ₹100 to referrer on referee's first delivery, ₹100 off referee's first order // free delivery in pilot; ₹50 cost absorbed in model

@Injectable()
export class OrdersService {
  constructor(private db: PrismaService, private catalog: CatalogService, private inv: InventoryService, private zones: ZonesService, private pay: PaymentsService, private notify: NotificationsService, private coupons: CouponsService) {}

  async create(userId: string, input: CreateOrderInput) {
    if (input.idempotencyKey) {
      const dup = await this.db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true, payment: true } });
      if (dup) return dup;
    }
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, include: { b2bAccount: true } });
    const address = await this.db.address.findFirst({ where: { id: input.addressId, userId } });
    if (!address) throw new NotFoundException('Address not found');
    const zone = address.zoneId ? await this.db.zone.findUnique({ where: { id: address.zoneId } }) : await this.zones.byPincode(address.pincode);
    if (!zone) throw new BadRequestException('We do not deliver to this pincode yet');
    if (!input.items?.length) throw new BadRequestException('Cart is empty');

    const isB2b = !!user.b2bAccount;
    if (input.paymentMethod === 'CREDIT') throw new BadRequestException('Credit terms are not offered — please pay by UPI, card or cash on delivery');
    const b2bTier = user.b2bAccount?.tier ?? null;
    const deliveryDate = input.deliveryDate ? startOfDay(new Date(input.deliveryDate)) : startOfDay(addDays(new Date(), 1));

    // Price + totals
    let subtotal = 0, gst = 0, totalKg = 0;
    const lines: { skuId: string; varietyId: string; qty: number; unitPaise: number; kg: number }[] = [];
    for (const it of input.items) {
      const sku = await this.db.sku.findUniqueOrThrow({ where: { id: it.skuId } });
      const unit = await this.catalog.priceFor(sku.id, { zoneId: zone.id, b2bTier });
      subtotal += unit * it.qty; gst += gstFor(unit * it.qty, sku.gstPct); totalKg += sku.packKg * it.qty;
      lines.push({ skuId: sku.id, varietyId: sku.varietyId, qty: it.qty, unitPaise: unit, kg: sku.packKg * it.qty });
    }
    if (input.slotId) {
      const slot = await this.db.slot.findUniqueOrThrow({ where: { id: input.slotId } });
      const booked = await this.db.order.count({ where: { slotId: slot.id, deliveryDate, status: { notIn: ['CANCELLED', 'FAILED'] } } });
      if (booked >= slot.capacity) throw new BadRequestException(`Slot ${slot.label} is full for that date — pick another slot`);
    }
    let couponDiscount = 0; let couponCode: string | undefined;
    if (input.couponCode) { const c = await this.coupons.evaluate(input.couponCode, userId, subtotal); couponDiscount = c.discountPaise; couponCode = c.code; }
    // Referral welcome: ₹100 off the referee's first order (min ₹500)
    let referralDiscount = 0;
    if (user.referredById && subtotal >= 50000) { const prior = await this.db.order.count({ where: { userId, status: { notIn: ['CANCELLED', 'FAILED'] } } }); if (prior === 0) referralDiscount = REFERRAL_PAISE; }
    let walletUsed = 0;
    if (input.paymentMethod === 'WALLET') { walletUsed = Math.min(user.walletBalance, subtotal + gst - couponDiscount - referralDiscount); if (walletUsed < subtotal + gst - couponDiscount - referralDiscount) throw new BadRequestException(`Wallet balance ₹${rupees(user.walletBalance)} is not enough; choose UPI or COD`); }
    const discount = couponDiscount + referralDiscount + walletUsed;
    const total = subtotal + gst + DELIVERY_FEE_PAISE - discount;


    const order = await this.db.$transaction(async (tx) => {
      const o = await tx.order.create({ data: {
        userId, b2bAccountId: user.b2bAccountId, addressId: address.id, slotId: input.slotId, deliveryDate,
        channel: input.channel || (isB2b ? 'B2B' : 'B2C'), subscriptionId: input.subscriptionId,
        subtotalPaise: subtotal, gstPaise: gst, deliveryFeePaise: DELIVERY_FEE_PAISE, discountPaise: discount, totalPaise: total, totalKg, couponCode,
        idempotencyKey: input.idempotencyKey, notes: referralDiscount ? `Referral welcome −₹${REFERRAL_PAISE / 100}${input.notes ? ' · ' + input.notes : ''}` : input.notes, status: 'PENDING_PAYMENT',
      } });
      for (const l of lines) {
        const lotId = await this.inv.allocateFifo(tx, l.varietyId, l.skuId, l.kg, o.id, zone.warehouseId);
        await tx.orderItem.create({ data: { orderId: o.id, skuId: l.skuId, lotId, qty: l.qty, unitPaise: l.unitPaise } });
      }
      const payment = await this.pay.createForOrder(tx, o.id, input.paymentMethod === 'WALLET' ? 0 : total, input.paymentMethod, o.orderNo);
      if (couponCode) await this.coupons.consume(couponCode);
      if (walletUsed > 0) {
        await tx.user.update({ where: { id: userId }, data: { walletBalance: { decrement: walletUsed } } });
        await tx.walletLedger.create({ data: { userId, deltaPaise: -walletUsed, reason: 'order', refId: o.id } });
      }
      const confirmed = payment.status === 'PAID' || input.paymentMethod === 'COD' || input.paymentMethod === 'WALLET';
      if (confirmed) await tx.order.update({ where: { id: o.id }, data: { status: 'CONFIRMED' } });
      await tx.orderEvent.create({ data: { orderId: o.id, type: confirmed ? 'CONFIRMED' : 'CREATED', payload: { method: input.paymentMethod } } });
      return tx.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: { include: { sku: { include: { variety: true } }, lot: true } }, payment: true, address: true, slot: true } });
    });

    if (order.status === 'CONFIRMED') {
      const dd = order.deliveryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      await this.notify.send(user.phone, 'order_confirmed', `Order #${order.orderNo} confirmed: ${order.totalKg} kg, ₹${rupees(order.totalPaise)}. Delivery ${dd} ${order.slot?.label || ''}. Track in app.`);
      // referral reward on first delivered order is granted in transition() → DELIVERED
    }
    return order;
  }

  async transition(orderId: string, to: OrderStatus, actor = 'system', payload?: any) {
    const o = await this.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { user: true } });
    if (!TRANSITIONS[o.status].includes(to)) throw new BadRequestException(`Cannot move ${o.status} → ${to}`);
    let referralPayout: string | null = null;
    await this.db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: to } });
      await tx.orderEvent.create({ data: { orderId, type: to, payload: { actor, ...payload } } });
      if (to === 'CANCELLED') {
        await this.inv.release(tx, orderId);
        const p = await tx.payment.findUnique({ where: { orderId } });
        if (p?.status === 'PAID') {
          await tx.payment.update({ where: { orderId }, data: { status: 'REFUNDED' } });
          await tx.user.update({ where: { id: o.userId }, data: { walletBalance: { increment: o.totalPaise } } });
          await tx.walletLedger.create({ data: { userId: o.userId, deltaPaise: o.totalPaise, reason: 'refund', refId: orderId } });
        }
        if (o.b2bAccountId) {
          const inv = await tx.b2bLedger.findFirst({ where: { orderId, reason: 'invoice' } });
          if (inv) await tx.b2bLedger.create({ data: { accountId: o.b2bAccountId, deltaPaise: -inv.deltaPaise, reason: 'credit_note', orderId } });
        }
      }
      if (to === 'DELIVERED') {
        const p = await tx.payment.findUnique({ where: { orderId } });
        if (p && p.method === 'COD') await tx.payment.update({ where: { orderId }, data: { status: 'PAID', providerRef: 'cash' } });
        // Referral reward: referrer gets ₹100 on referee's first delivered order
        if (o.user.referredById) {
          const prior = await tx.order.count({ where: { userId: o.userId, status: 'DELIVERED', id: { not: orderId } } });
          if (prior === 0) {
            await tx.user.update({ where: { id: o.user.referredById }, data: { walletBalance: { increment: REFERRAL_PAISE } } });
            await tx.walletLedger.create({ data: { userId: o.user.referredById, deltaPaise: REFERRAL_PAISE, reason: 'referral', refId: o.userId } });
            referralPayout = o.user.referredById;
          }
        }
      }
    });
    const msgs: Partial<Record<OrderStatus, string>> = {
      OUT_FOR_DELIVERY: `Order #${o.orderNo} is out for delivery. Your rider will call before arriving.`,
      DELIVERED: `Order #${o.orderNo} delivered. Enjoy! Reply RATE to rate your delivery.`,
      CANCELLED: `Order #${o.orderNo} cancelled. Any payment is credited to your wallet.`,
    };
    if (msgs[to]) await this.notify.send(o.user.phone, 'order_' + to.toLowerCase(), msgs[to]!);
    if (referralPayout) {
      const ref = await this.db.user.findUnique({ where: { id: referralPayout } });
      if (ref) await this.notify.send(ref.phone, 'referral_reward', `₹${REFERRAL_PAISE / 100} added to your FreshRice wallet — ${o.user.name || 'your neighbour'} just got their first bag delivered. Wallet: ₹${rupees(ref.walletBalance)}. Keep sharing code ${ref.referralCode}!`);
    }
    return this.get(orderId);
  }

  get(id: string) {
    return this.db.order.findUniqueOrThrow({ where: { id }, include: { items: { include: { sku: { include: { variety: true } }, lot: { include: { vendor: true } } } }, payment: true, address: true, slot: true, events: { orderBy: { at: 'asc' } }, stop: { include: { route: { include: { rider: true } } } }, user: { select: { name: true, phone: true } } } });
  }
  mine(userId: string) { return this.db.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { items: { include: { sku: { include: { variety: true } } } }, payment: true, slot: true, stop: true } }); }
  list(q: { status?: OrderStatus; date?: string; zoneId?: string }) {
    return this.db.order.findMany({ where: { status: q.status, deliveryDate: q.date ? startOfDay(new Date(q.date)) : undefined, address: q.zoneId ? { zoneId: q.zoneId } : undefined }, orderBy: [{ deliveryDate: 'asc' }, { orderNo: 'desc' }], include: { user: { select: { name: true, phone: true } }, address: { include: { zone: true } }, items: { include: { sku: true } }, payment: true, slot: true, stop: true }, take: 200 });
  }
  async rate(orderId: string, userId: string, score: number, comment?: string) {
    const o = await this.db.order.findFirst({ where: { id: orderId, userId } });
    if (!o) throw new NotFoundException();
    await this.db.orderEvent.create({ data: { orderId, type: 'RATED', payload: { score, comment } } });
    await this.db.event.create({ data: { actor: userId, type: 'nps', payload: { orderId, score, comment } } });
    return { ok: true };
  }
}
