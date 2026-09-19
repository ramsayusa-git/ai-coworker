import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma, PaymentMethod } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Razorpay adapter. Live when RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set; otherwise mock mode auto-captures.
 * Live flow: createForOrder → PENDING + providerRef (razorpay order id) → app opens Razorpay Checkout with that id →
 * webhook payment.captured (or POST /payments/razorpay/verify from the app) → PAID → order CONFIRMED.
 */
@Injectable()
export class PaymentsService {
  private log = new Logger('Payments');
  private rzp: any;
  constructor(private db: PrismaService) {
    if (process.env.RAZORPAY_KEY_ID) { const Razorpay = require('razorpay'); this.rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }); }
  }
  get mock() { return !this.rzp; }
  get publicKey() { return process.env.RAZORPAY_KEY_ID || null; }

  async createForOrder(tx: Prisma.TransactionClient, orderId: string, amountPaise: number, method: PaymentMethod, orderNo?: number) {
    const online = method === 'UPI' || method === 'CARD' || method === 'MANDATE';
    if (method === 'WALLET' || method === 'COD' || method === 'CREDIT') return tx.payment.create({ data: { orderId, amountPaise, method, status: method === 'WALLET' ? 'PAID' : 'PENDING', provider: 'internal' } });
    if (this.mock || !online) return tx.payment.create({ data: { orderId, amountPaise, method, status: 'PAID', provider: 'mock', providerRef: 'mock_pay_' + Math.random().toString(36).slice(2, 10) } });
    const rzpOrder = await this.rzp.orders.create({ amount: amountPaise, currency: 'INR', receipt: `FR-${orderNo || orderId.slice(0, 8)}`, notes: { orderId } });
    return tx.payment.create({ data: { orderId, amountPaise, method, status: 'PENDING', provider: 'razorpay', providerRef: rzpOrder.id } });
  }

  /** Called by the app after Razorpay Checkout succeeds (signature = HMAC(order_id|payment_id, key_secret)) */
  async verifyCheckout(orderId: string, razorpayOrderId: string, razorpayPaymentId: string, signature: string) {
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    if (expected !== signature) throw new BadRequestException('Invalid payment signature');
    return this.markPaid(orderId, razorpayPaymentId);
  }

  async markPaid(orderId: string, providerRef?: string) {
    const p = await this.db.payment.update({ where: { orderId }, data: { status: 'PAID', providerRef } });
    const o = await this.db.order.findUnique({ where: { id: orderId } });
    if (o?.status === 'PENDING_PAYMENT') { await this.db.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } }); await this.db.orderEvent.create({ data: { orderId, type: 'CONFIRMED', payload: { via: 'payment' } } }); }
    return p;
  }

  /** Razorpay webhook. Verifies X-Razorpay-Signature over the raw body when RAZORPAY_WEBHOOK_SECRET is set. */
  async webhook(rawBody: Buffer | undefined, signature: string | undefined, body: any) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (secret) {
      const expected = crypto.createHmac('sha256', secret).update(rawBody || Buffer.from(JSON.stringify(body))).digest('hex');
      if (expected !== signature) { this.log.warn('Webhook signature mismatch'); throw new BadRequestException('Bad signature'); }
    }
    const ev = body?.event; const pay = body?.payload?.payment?.entity;
    const orderId = pay?.notes?.orderId;
    if ((ev === 'payment.captured' || ev === 'order.paid') && orderId) await this.markPaid(orderId, pay.id);
    if (ev === 'payment.failed' && orderId) { await this.db.payment.update({ where: { orderId }, data: { status: 'FAILED' } }); await this.db.orderEvent.create({ data: { orderId, type: 'PAYMENT_FAILED', payload: { reason: pay?.error_description } } }); }
    return { ok: true, event: ev };
  }
}
