import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ModStatus, ModType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvoicesService } from '../invoices/invoices.service';
import { gstFor, startOfDay, rupees } from '../common/money';

type U = { sub: string; role: string; isSuperAdmin?: boolean };

/** Per-role goodwill discount self-approval limits (paise). ADMIN is always unlimited. maxPct caps any single
 *  discount as % of order value; requireIssueAbovePaise forces a linked issue ticket for big discounts. */
export type DiscountLimits = { SALES: number; MARKETING: number; OPS: number; maxPct: number; requireIssueAbovePaise: number };
export const DEFAULT_LIMITS: DiscountLimits = { SALES: 10000, MARKETING: 5000, OPS: 30000, maxPct: 30, requireIssueAbovePaise: 50000 };
const LIMITS_KEY = 'discount_limits';
/** Approval chain, low → high. A request escalates to the first role whose limit covers it. */
const CHAIN: Role[] = ['OPS', 'ADMIN'];
const EDITABLE: Record<ModType, string[]> = { ITEMS: ['PENDING_PAYMENT', 'CONFIRMED'], SLOT: ['PENDING_PAYMENT', 'CONFIRMED', 'PACKED'], ADDRESS: ['PENDING_PAYMENT', 'CONFIRMED', 'PACKED'], DISCOUNT: ['PENDING_PAYMENT', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'], NOTE: ['PENDING_PAYMENT', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'] };
const STAFF = ['ADMIN', 'OPS', 'SALES', 'MARKETING'];

@Injectable()
export class ModificationsService {
  constructor(private db: PrismaService, private catalog: CatalogService, private inv: InventoryService, private notify: NotificationsService, private invoices: InvoicesService) {}

  // ---------- settings ----------
  async limits(): Promise<DiscountLimits> {
    const s = await this.db.setting.findUnique({ where: { key: LIMITS_KEY } });
    return { ...DEFAULT_LIMITS, ...((s?.value as any) || {}) };
  }
  async setLimits(u: U, v: Partial<DiscountLimits>) {
    const cur = await this.limits(); const next: DiscountLimits = { ...cur };
    for (const k of ['SALES', 'MARKETING', 'OPS', 'maxPct', 'requireIssueAbovePaise'] as const) {
      if (v[k] === undefined) continue; const n = Number(v[k]);
      if (!Number.isInteger(n) || n < 0) throw new BadRequestException(`${k} must be a whole number ≥ 0`);
      if (k === 'maxPct' && n > 100) throw new BadRequestException('maxPct cannot exceed 100');
      next[k] = n;
    }
    await this.db.setting.upsert({ where: { key: LIMITS_KEY }, create: { key: LIMITS_KEY, value: next as any, updatedBy: u.sub }, update: { value: next as any, updatedBy: u.sub } });
    await this.db.event.create({ data: { actor: u.sub, type: 'discount_limits_changed', payload: next as any } });
    return next;
  }
  private canApprove(role: string, amount: number, l: DiscountLimits) { if (role === 'ADMIN') return true; const lim = (l as any)[role] ?? 0; return lim > 0 && amount <= lim; }

  // ---------- queries ----------
  async forOrder(orderId: string, u: U) {
    const o = await this.db.order.findUnique({ where: { id: orderId }, select: { userId: true } });
    if (!o) throw new NotFoundException('Order not found');
    const staff = STAFF.includes(u.role);
    if (!staff && o.userId !== u.sub) throw new ForbiddenException();
    const rows = await this.db.orderModification.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
    if (staff) {
      const ids = [...new Set(rows.flatMap((r) => [r.requestedBy, r.approvedBy].filter(Boolean) as string[]))];
      const users = await this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } }); const by = new Map(users.map((x) => [x.id, x]));
      return rows.map((r) => ({ ...r, requester: by.get(r.requestedBy) || null, approver: r.approvedBy ? by.get(r.approvedBy) || null : null }));
    }
    return rows.filter((m) => m.status !== 'REJECTED' && m.status !== 'PENDING_APPROVAL').map((m) => ({ id: m.id, type: m.type, status: m.status, before: m.before, after: m.after, amountPaise: m.amountPaise, reason: m.reason, createdAt: m.createdAt, byYou: m.requestedBy === u.sub }));
  }
  async approvals(u: U, status: ModStatus = 'PENDING_APPROVAL') {
    if (!['ADMIN', 'OPS'].includes(u.role)) throw new ForbiddenException();
    const rows = await this.db.orderModification.findMany({ where: { status }, orderBy: { createdAt: status === 'PENDING_APPROVAL' ? 'asc' : 'desc' }, take: 200, include: { order: { select: { orderNo: true, totalPaise: true, subtotalPaise: true, gstPaise: true, discountPaise: true, status: true, user: { select: { name: true, phone: true } } } } } });
    const ids = [...new Set(rows.flatMap((r) => [r.requestedBy, r.approvedBy].filter(Boolean) as string[]))];
    const users = await this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } });
    const by = new Map(users.map((x) => [x.id, x])); const l = await this.limits();
    return rows.map((r) => ({ ...r, requester: by.get(r.requestedBy) || null, approver: r.approvedBy ? by.get(r.approvedBy) || null : null, canApprove: r.status === 'PENDING_APPROVAL' && r.requestedBy !== u.sub && this.canApprove(u.role, r.amountPaise, l) }));
  }
  async options(orderId: string) {
    const o = await this.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { address: true } });
    const [slots, addresses, issues, skus] = await Promise.all([
      o.address.zoneId ? this.db.slot.findMany({ where: { zoneId: o.address.zoneId }, orderBy: { startHour: 'asc' } }) : [],
      this.db.address.findMany({ where: { userId: o.userId }, include: { zone: { select: { name: true } } } }),
      this.db.issue.findMany({ where: { orderId }, select: { id: true, ticketNo: true, title: true, status: true }, orderBy: { createdAt: 'desc' } }),
      this.db.sku.findMany({ where: { active: true }, include: { variety: { select: { name: true } } }, orderBy: { code: 'asc' } }),
    ]);
    return { slots, addresses, issues, skus: skus.map((s) => ({ id: s.id, code: s.code, name: `${s.variety.name} ${s.packKg}kg`, packKg: s.packKg })), limits: await this.limits() };
  }
  async stats() {
    const [pending, today] = await Promise.all([
      this.db.orderModification.count({ where: { status: 'PENDING_APPROVAL' } }),
      this.db.orderModification.aggregate({ where: { type: 'DISCOUNT', status: { in: ['APPLIED', 'APPROVED'] }, createdAt: { gte: startOfDay(new Date()) } }, _sum: { amountPaise: true }, _count: { _all: true } }),
    ]);
    return { pendingApprovals: pending, discountsToday: today._count._all, discountPaiseToday: today._sum.amountPaise || 0 };
  }

  // ---------- goodwill discount ----------
  async requestDiscount(orderId: string, u: U, b: { amountPaise?: number; pct?: number; reason: string; issueId?: string }) {
    if (!STAFF.includes(u.role)) throw new ForbiddenException();
    if (!b.reason?.trim()) throw new BadRequestException('A reason is required for a discount');
    const o = await this.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, user: true } });
    if (!EDITABLE.DISCOUNT.includes(o.status)) throw new BadRequestException(`Cannot discount a ${o.status} order`);
    const base = o.subtotalPaise + o.gstPaise;
    const amount = b.pct ? Math.round((base * Number(b.pct)) / 100) : Math.round(Number(b.amountPaise || 0));
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Discount amount must be positive');
    const l = await this.limits(); const cap = Math.round((base * l.maxPct) / 100);
    if (amount > cap) throw new BadRequestException(`Discount exceeds the ${l.maxPct}% cap (max ₹${rupees(cap)} on this order)`);
    if (amount > o.totalPaise) throw new BadRequestException('Discount cannot exceed the amount payable');
    if (l.requireIssueAbovePaise > 0 && amount > l.requireIssueAbovePaise && !b.issueId) throw new BadRequestException(`Discounts above ₹${rupees(l.requireIssueAbovePaise)} must be linked to an issue ticket`);
    if (b.issueId) { const iss = await this.db.issue.findFirst({ where: { id: b.issueId, orderId } }); if (!iss) throw new BadRequestException('Issue ticket does not belong to this order'); }
    const self = this.canApprove(u.role, amount, l);
    const mod = await this.db.orderModification.create({ data: { orderId, type: 'DISCOUNT', status: self ? 'APPLIED' : 'PENDING_APPROVAL', amountPaise: amount, reason: b.reason.trim(), issueId: b.issueId, requestedBy: u.sub, requestedRole: u.role, before: { discountPaise: o.discountPaise, totalPaise: o.totalPaise }, ...(self ? { approvedBy: u.sub, approvedAt: new Date() } : {}) } });
    if (self) { await this.applyDiscount(mod.id); return { ...mod, applied: true, approvers: [] as string[] }; }
    const approver = CHAIN.find((r) => this.canApprove(r, amount, l)) || 'ADMIN';
    await this.db.event.create({ data: { actor: u.sub, type: 'discount_pending', payload: { orderId, modId: mod.id, amount, approver } } });
    const heads = await this.db.user.findMany({ where: { role: approver, active: true }, select: { phone: true }, take: 5 });
    for (const h of heads) await this.notify.send(h.phone, 'approval_needed', `Approval needed: ₹${rupees(amount)} discount on order #${o.orderNo} requested by ${u.role} — "${b.reason.trim()}". Open Admin → Approvals.`);
    return { ...mod, applied: false, approvers: [approver] };
  }
  async decide(modId: string, u: U, approve: boolean, note?: string) {
    const mod = await this.db.orderModification.findUniqueOrThrow({ where: { id: modId }, include: { order: { select: { orderNo: true } } } });
    if (mod.status !== 'PENDING_APPROVAL') throw new BadRequestException('Already decided');
    if (mod.requestedBy === u.sub && !u.isSuperAdmin) throw new ForbiddenException('You cannot approve your own request');
    const l = await this.limits();
    if (!this.canApprove(u.role, mod.amountPaise, l)) throw new ForbiddenException(`₹${rupees(mod.amountPaise)} is above your approval limit`);
    if (!approve && !note?.trim()) throw new BadRequestException('A note is required to reject');
    await this.db.orderModification.update({ where: { id: modId }, data: { status: approve ? 'APPROVED' : 'REJECTED', approvedBy: u.sub, approvedAt: new Date(), decisionNote: note?.trim() || null } });
    if (approve) await this.applyDiscount(modId);
    const req = await this.db.user.findUnique({ where: { id: mod.requestedBy } });
    if (req) await this.notify.send(req.phone, 'approval_decided', `${approve ? 'Approved' : 'Rejected'}: ₹${rupees(mod.amountPaise)} discount on order #${mod.order.orderNo}${note ? ` — ${note.trim()}` : ''}.`);
    return this.db.orderModification.findUniqueOrThrow({ where: { id: modId } });
  }
  /** Applies an APPLIED/APPROVED discount: totals, payment amount or wallet refund, invoice reissue, customer notice. */
  private async applyDiscount(modId: string) {
    const mod = await this.db.orderModification.findUniqueOrThrow({ where: { id: modId } });
    const o = await this.db.order.findUniqueOrThrow({ where: { id: mod.orderId }, include: { payment: true, user: true } });
    const amount = Math.min(mod.amountPaise, o.totalPaise); const paid = o.payment?.status === 'PAID';
    await this.db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: o.id }, data: { discountPaise: { increment: amount }, totalPaise: { decrement: amount }, revision: { increment: 1 } } });
      if (paid) {
        await tx.user.update({ where: { id: o.userId }, data: { walletBalance: { increment: amount } } });
        await tx.walletLedger.create({ data: { userId: o.userId, deltaPaise: amount, reason: 'goodwill', refId: o.id } });
      } else if (o.payment) await tx.payment.update({ where: { orderId: o.id }, data: { amountPaise: { decrement: amount } } });
      await tx.orderModification.update({ where: { id: modId }, data: { after: { discountPaise: o.discountPaise + amount, totalPaise: o.totalPaise - amount, refundedToWallet: paid } } });
      await tx.orderEvent.create({ data: { orderId: o.id, type: 'DISCOUNT', payload: { modId, amount, reason: mod.reason, by: mod.approvedBy } } });
    });
    await this.reissueIfInvoiced(o.id, mod.approvedBy || mod.requestedBy, `Goodwill discount ₹${rupees(amount)}: ${mod.reason}`);
    await this.notify.send(o.user.phone, 'goodwill_discount', `Good news — ₹${rupees(amount)} off order #${o.orderNo} (${mod.reason}). ${paid ? 'Credited to your FreshRice wallet.' : `New amount payable ₹${rupees(o.totalPaise - amount)}.`}`, o.user.email);
  }

  // ---------- items / slot / address / note ----------
  async modify(orderId: string, u: U, b: { type: ModType; reason: string; items?: { skuId: string; qty: number }[]; slotId?: string | null; deliveryDate?: string; addressId?: string; note?: string; collectOnDelivery?: boolean }) {
    const staff = ['ADMIN', 'OPS', 'SALES'].includes(u.role);
    const o = await this.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { sku: true } }, payment: true, address: true, slot: true, user: true, stop: true } });
    if (!staff) { if (o.userId !== u.sub) throw new ForbiddenException(); if (!['SLOT', 'ADDRESS', 'NOTE'].includes(b.type)) throw new ForbiddenException('Contact support to change items'); }
    if (b.type === 'DISCOUNT') throw new BadRequestException('Use the discount endpoint');
    if (!b.reason?.trim()) throw new BadRequestException('A reason is required');
    if (!EDITABLE[b.type]?.includes(o.status)) throw new BadRequestException(`Cannot change ${String(b.type).toLowerCase()} on a ${o.status} order`);
    if (o.stop && b.type !== 'NOTE') throw new BadRequestException('Order is already on a route — remove it from the route first');
    let before: any = {}, after: any = {}, amountPaise = 0;

    if (b.type === 'NOTE') {
      if (!b.note?.trim()) throw new BadRequestException('Note is empty');
      before = { notes: o.notes }; after = { notes: [o.notes, b.note.trim()].filter(Boolean).join(' · ') };
      await this.db.order.update({ where: { id: orderId }, data: { notes: after.notes, revision: { increment: 1 } } });
    } else if (b.type === 'SLOT') {
      const deliveryDate = b.deliveryDate ? startOfDay(new Date(b.deliveryDate)) : o.deliveryDate;
      if (isNaN(deliveryDate.getTime())) throw new BadRequestException('Bad date');
      if (deliveryDate < startOfDay(new Date())) throw new BadRequestException('Delivery date is in the past');
      const slotId = b.slotId === undefined ? o.slotId : b.slotId;
      if (slotId) { const slot = await this.db.slot.findUniqueOrThrow({ where: { id: slotId } }); const booked = await this.db.order.count({ where: { slotId, deliveryDate, status: { notIn: ['CANCELLED', 'FAILED'] }, id: { not: orderId } } }); if (booked >= slot.capacity) throw new BadRequestException(`Slot ${slot.label} is full on that date`); }
      if (deliveryDate.getTime() === o.deliveryDate.getTime() && slotId === o.slotId) throw new BadRequestException('Nothing changed');
      before = { deliveryDate: o.deliveryDate, slotId: o.slotId, slot: o.slot?.label }; after = { deliveryDate, slotId };
      await this.db.order.update({ where: { id: orderId }, data: { deliveryDate, slotId, revision: { increment: 1 } } });
    } else if (b.type === 'ADDRESS') {
      const addr = await this.db.address.findFirst({ where: { id: b.addressId, userId: o.userId } });
      if (!addr) throw new BadRequestException('Address not found for this customer');
      if (addr.id === o.addressId) throw new BadRequestException('Nothing changed');
      if ((addr.zoneId || null) !== (o.address.zoneId || null)) throw new BadRequestException('New address is in a different zone — cancel and reorder so stock comes from the right warehouse');
      before = { addressId: o.addressId, line1: o.address.line1 }; after = { addressId: addr.id, line1: addr.line1 };
      await this.db.order.update({ where: { id: orderId }, data: { addressId: addr.id, revision: { increment: 1 } } });
    } else if (b.type === 'ITEMS') {
      const want = (b.items || []).filter((i) => Number(i.qty) > 0);
      if (!want.length) throw new BadRequestException('An order needs at least one item — cancel it instead');
      const user = await this.db.user.findUniqueOrThrow({ where: { id: o.userId }, include: { b2bAccount: true } });
      const zone = o.address.zoneId ? await this.db.zone.findUnique({ where: { id: o.address.zoneId } }) : null;
      let subtotal = 0, gst = 0, totalKg = 0; const lines: { skuId: string; varietyId: string; qty: number; unitPaise: number; kg: number }[] = [];
      for (const it of want) {
        const sku = await this.db.sku.findUniqueOrThrow({ where: { id: it.skuId } }); const qty = Math.floor(Number(it.qty));
        if (!Number.isInteger(qty) || qty < 1) throw new BadRequestException('Bad quantity');
        const existing = o.items.find((x) => x.skuId === sku.id);
        const unit = existing ? existing.unitPaise : await this.catalog.priceFor(sku.id, { zoneId: zone?.id, b2bTier: user.b2bAccount?.tier ?? null }); // keep the price the customer already saw
        subtotal += unit * qty; gst += gstFor(unit * qty, sku.gstPct); totalKg += sku.packKg * qty;
        lines.push({ skuId: sku.id, varietyId: sku.varietyId, qty, unitPaise: unit, kg: sku.packKg * qty });
      }
      const discount = Math.min(o.discountPaise, subtotal + gst);
      const total = subtotal + gst + o.deliveryFeePaise - discount; const delta = total - o.totalPaise; amountPaise = delta;
      const paid = o.payment?.status === 'PAID';
      if (paid && delta > 0 && !b.collectOnDelivery) throw new BadRequestException(`Customer has already paid; the new total is ₹${rupees(delta)} higher. Tick "collect balance on delivery" or reduce the change.`);
      before = { items: o.items.map((i) => ({ skuId: i.skuId, code: i.sku.code, qty: i.qty, unitPaise: i.unitPaise })), totalPaise: o.totalPaise, totalKg: o.totalKg };
      after = { items: lines.map((l) => ({ skuId: l.skuId, qty: l.qty, unitPaise: l.unitPaise })), totalPaise: total, totalKg, delta };
      await this.db.$transaction(async (tx) => {
        await this.inv.release(tx, orderId);
        await tx.orderItem.deleteMany({ where: { orderId } });
        for (const l of lines) { const lotId = await this.inv.allocateFifo(tx, l.varietyId, l.skuId, l.kg, orderId, zone?.warehouseId); await tx.orderItem.create({ data: { orderId, skuId: l.skuId, lotId, qty: l.qty, unitPaise: l.unitPaise } }); }
        const notes = paid && delta > 0 ? [o.notes, `Balance ₹${rupees(delta)} to collect on delivery`].filter(Boolean).join(' · ') : o.notes;
        await tx.order.update({ where: { id: orderId }, data: { subtotalPaise: subtotal, gstPaise: gst, discountPaise: discount, totalPaise: total, totalKg, notes, revision: { increment: 1 } } });
        if (paid) {
          if (delta < 0) { await tx.user.update({ where: { id: o.userId }, data: { walletBalance: { increment: -delta } } }); await tx.walletLedger.create({ data: { userId: o.userId, deltaPaise: -delta, reason: 'order_change', refId: orderId } }); }
          else if (delta > 0) await tx.orderEvent.create({ data: { orderId, type: 'BALANCE_DUE', payload: { delta } } });
        } else if (o.payment) await tx.payment.update({ where: { orderId }, data: { amountPaise: Math.max(0, o.payment.amountPaise + delta) } });
      });
    }
    const mod = await this.db.orderModification.create({ data: { orderId, type: b.type, status: 'APPLIED', before, after, amountPaise, reason: b.reason.trim(), requestedBy: u.sub, requestedRole: u.role, approvedBy: u.sub, approvedAt: new Date() } });
    await this.db.orderEvent.create({ data: { orderId, type: 'MODIFIED', payload: { modId: mod.id, type: b.type, by: u.role, reason: b.reason.trim() } } });
    if (b.type === 'ITEMS') await this.reissueIfInvoiced(orderId, u.sub, `Items changed: ${b.reason.trim()}`);
    if (staff && b.type !== 'NOTE') await this.notify.send(o.user.phone, 'order_modified', `Order #${o.orderNo} updated (${String(b.type).toLowerCase()}): ${b.reason.trim()}.${b.type === 'ITEMS' ? ` New total ₹${rupees(after.totalPaise)}.` : ''} Open the app to review.`, o.user.email);
    return mod;
  }

  private async reissueIfInvoiced(orderId: string, actor: string, reason: string) {
    const active = await this.db.invoice.findFirst({ where: { orderId, status: 'ISSUED' } });
    if (!active) return;
    try { await this.invoices.reissue(orderId, { sub: actor, role: 'ADMIN' }, { reason }); } catch (e: any) { await this.db.event.create({ data: { actor, type: 'invoice_reissue_failed', payload: { orderId, error: e.message } } }); }
  }
}
