import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { IssuesService } from '../issues/issues.service';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

/**
 * Outbound messaging. Channels:
 *  - WhatsApp Cloud API (Meta Graph) when WHATSAPP_TOKEN + WHATSAPP_PHONE_ID are set
 *  - MSG91 SMS for OTP when MSG91_AUTHKEY (+ MSG91_TEMPLATE_ID, MSG91_SENDER) are set
 *  - SMTP email (e.g. OTP fallback / receipts) when SMTP_HOST + SMTP_USER + SMTP_PASS are set
 *  - otherwise logs + stores (dev/pilot mode)
 */
@Injectable()
export class NotificationsService {
  private log = new Logger('Notify');
  private mailer: nodemailer.Transporter | null = null;
  constructor(private db: PrismaService, @Optional() @Inject(forwardRef(() => IssuesService)) private issues?: IssuesService) {}

  private getMailer() {
    if (this.mailer) return this.mailer;
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
    this.mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return this.mailer;
  }

  /** OTP + transactional email. Send alongside SMS/WhatsApp, or on its own via sendEmail(). */
  async sendEmail(to: string, subject: string, body: string, opts: { html?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] } = {}) {
    const mailer = this.getMailer();
    if (!mailer) throw new Error('SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS)');
    await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text: body, html: opts.html, attachments: opts.attachments });
  }
  get emailConfigured() { return !!this.getMailer(); }
  get whatsappConfigured() { return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID); }

  async send(phone: string, template: string, body: string, email?: string | null) {
    let status = 'logged'; let channel = 'log';
    try {
      if (template === 'otp' && process.env.MSG91_AUTHKEY) { await this.sms(phone, body); status = 'sent'; channel = 'sms'; }
      else if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) { await this.whatsapp(phone, body); status = 'sent'; channel = 'whatsapp'; }
      if (template === 'otp' && email && this.getMailer()) {
        try { await this.sendEmail(email, 'Your FreshRice OTP', body); if (channel === 'log') { status = 'sent'; channel = 'email'; } else channel += '+email'; }
        catch (e: any) { this.log.error(`otp email → ${email}: ${(e.message || e).toString().slice(0, 120)}`); }
      }
    } catch (e: any) { status = 'failed:' + (e.message || e).toString().slice(0, 120); this.log.error(`${template} → ${phone}: ${status}`); }
    if (channel === 'log') this.log.log(`[${template}] → ${phone}: ${body}`);
    return this.db.notification.create({ data: { phone, template, body, status, channel } });
  }

  /** Meta WhatsApp Cloud API. Free-form text only works inside a 24h customer-service window; for outbound-first messages register templates and switch to type:'template'. */
  private async whatsapp(phone: string, text: string) {
    const r = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.replace('+', ''), type: 'text', text: { body: text } }) });
    if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  private async sms(phone: string, text: string) {
    const otp = text.match(/\d{4,6}/)?.[0];
    const r = await fetch('https://control.msg91.com/api/v5/flow/', { method: 'POST', headers: { authkey: process.env.MSG91_AUTHKEY!, 'Content-Type': 'application/json' }, body: JSON.stringify({ template_id: process.env.MSG91_TEMPLATE_ID, short_url: '0', recipients: [{ mobiles: phone.replace('+', ''), otp }] }) });
    if (!r.ok) throw new Error(`MSG91 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  /** Inbound WhatsApp webhook: SKIP / PAUSE / RESUME / YES on subscriptions, RATE n on last order. Returns list of actions taken. */
  async handleInbound(phoneRaw: string, text: string) {
    const phone = '+' + phoneRaw.replace(/\D/g, '');
    const user = await this.db.user.findUnique({ where: { phone } });
    if (!user) return { handled: false };
    const t = text.trim().toUpperCase();
    // Issues desk: "ISSUE <text>" opens/updates a ticket; a resolved ticket takes "RATE n" before the order NPS does.
    if (t.startsWith('ISSUE') && this.issues) { const r = await this.issues.fromWhatsapp(phone, text.trim().replace(/^issue[:\s-]*/i, '') || text.trim()); if (r) { await this.send(phone, 'issue_ack', r.appended ? `Added to your open issue #${r.issue.ticketNo}. Our team will reply here.` : `Got it — issue #${r.issue.ticketNo} logged. We'll get back to you shortly.`); return { handled: true, action: r.appended ? 'issue_append' : 'issue_open' }; } }
    const rm = t.match(/^RATE\s*([1-5])$/);
    if (rm && this.issues) { const resolved = await this.db.issue.findFirst({ where: { raisedById: user.id, status: 'RESOLVED', rating: null }, orderBy: { resolvedAt: 'desc' } }); if (resolved) { await this.issues.rate({ sub: user.id, role: user.role }, resolved.id, Number(rm[1])); await this.send(phone, 'rate_ack', 'Thanks for rating how we handled it!'); return { handled: true, action: 'issue_rate' }; } }
    const sub = await this.db.subscription.findFirst({ where: { userId: user.id, status: { not: 'CANCELLED' } }, orderBy: { nextRunOn: 'asc' } });
    if (t === 'SKIP' && sub) { await this.db.subscription.update({ where: { id: sub.id }, data: { skipNext: true } }); await this.send(phone, 'sub_skip_ack', 'Got it — your next delivery is skipped. Reply RESUME anytime.'); return { handled: true, action: 'skip' }; }
    if (t === 'PAUSE' && sub) { await this.db.subscription.update({ where: { id: sub.id }, data: { status: 'PAUSED' } }); await this.send(phone, 'sub_pause_ack', 'Subscription paused. Reply RESUME to restart.'); return { handled: true, action: 'pause' }; }
    if (t === 'RESUME' && sub) { await this.db.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', skipNext: false } }); await this.send(phone, 'sub_resume_ack', 'Subscription resumed.'); return { handled: true, action: 'resume' }; }
    const m = t.match(/^RATE\s*(\d{1,2})$/);
    if (m) { const o = await this.db.order.findFirst({ where: { userId: user.id, status: 'DELIVERED' }, orderBy: { updatedAt: 'desc' } }); if (o) { await this.db.event.create({ data: { actor: user.id, type: 'nps', payload: { orderId: o.id, score: Number(m[1]) } } }); await this.send(phone, 'rate_ack', 'Thanks for rating us!'); return { handled: true, action: 'rate' }; } }
    await this.send(phone, 'help', 'Reply SKIP to skip your next delivery, PAUSE / RESUME for your subscription, or RATE 0-10 for your last order. For anything else our team will reply shortly.');
    return { handled: true, action: 'help' };
  }

  list(limit = 100) { return this.db.notification.findMany({ orderBy: { at: 'desc' }, take: limit }); }
}
