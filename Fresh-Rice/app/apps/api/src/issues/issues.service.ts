import { Injectable, ForbiddenException, BadRequestException, NotFoundException, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export const CATEGORIES = ['WRONG_BAG', 'LATE', 'DAMAGED', 'MISSING', 'PAYMENT', 'RIDER', 'APP', 'OTHER'] as const;
const STAFF = ['ADMIN', 'OPS', 'SALES'];
/** SLA hours by priority (resolution target). */
const SLA_H: Record<string, number> = { URGENT: 1, HIGH: 4, NORMAL: 24, LOW: 72 };
const AUTO_PRIORITY: Record<string, string> = { WRONG_BAG: 'HIGH', DAMAGED: 'HIGH', MISSING: 'HIGH', PAYMENT: 'HIGH', LATE: 'NORMAL', RIDER: 'NORMAL', APP: 'LOW', OTHER: 'NORMAL' };
const PUBLIC_BASE = process.env.PUBLIC_WEB_URL || 'https://freshrice.in';

@Injectable()
export class IssuesService {
  private log = new Logger('Issues');
  constructor(private db: PrismaService, @Inject(forwardRef(() => NotificationsService)) private notify: NotificationsService) {}

  private isStaff(u: any) { return STAFF.includes(u.role); }
  private include = { raisedBy: { select: { id: true, name: true, phone: true, role: true } }, assignee: { select: { id: true, name: true } }, order: { select: { id: true, orderNo: true, status: true, deliveryDate: true } }, messages: { orderBy: { createdAt: 'asc' as const }, include: { author: { select: { id: true, name: true, role: true } } } } };

  async create(u: any, b: { category: string; title: string; description?: string; orderId?: string; photo?: string; priority?: string; channel?: string; onBehalfOfPhone?: string }) {
    if (!CATEGORIES.includes(b.category as any)) throw new BadRequestException(`category must be one of ${CATEGORIES.join(', ')}`);
    if (!b.title?.trim()) throw new BadRequestException('title required');
    if (b.photo && b.photo.length > 400 * 1024 * 1.37) throw new BadRequestException('Photo must be under 400 KB');
    let raisedById = u.sub;
    if (b.onBehalfOfPhone && this.isStaff(u)) { const cust = await this.db.user.findUnique({ where: { phone: '+91' + b.onBehalfOfPhone.replace(/\D/g, '').slice(-10) } }); if (!cust) throw new NotFoundException('No customer with that phone'); raisedById = cust.id; }
    if (b.orderId) { const o = await this.db.order.findUnique({ where: { id: b.orderId } }); if (!o) throw new NotFoundException('Order not found'); if (!this.isStaff(u) && o.userId !== u.sub) throw new ForbiddenException('Not your order'); }
    const priority = (this.isStaff(u) && b.priority) || AUTO_PRIORITY[b.category] || 'NORMAL';
    const issue = await this.db.issue.create({ data: { raisedById, orderId: b.orderId || null, category: b.category, priority: priority as any, title: b.title.trim().slice(0, 140), description: b.description?.trim() || null, photo: b.photo || null, channel: b.channel || (this.isStaff(u) ? 'staff' : 'app'), slaDueAt: new Date(Date.now() + SLA_H[priority] * 36e5) }, include: this.include });
    await this.notify.send(issue.raisedBy.phone, 'issue_opened', `FreshRice: we've logged your issue #${issue.ticketNo} (${issue.title}). We'll get back within ${SLA_H[priority]}h. Reply here to add details.`);
    await this.db.event.create({ data: { actor: u.sub, type: 'issue_opened', payload: { ticketNo: issue.ticketNo, category: b.category, priority } } });
    return issue;
  }

  /** WhatsApp inbound: "ISSUE <text>" → ticket on the caller's latest order, or appends to their open ticket. */
  async fromWhatsapp(phone: string, text: string) {
    const user = await this.db.user.findUnique({ where: { phone } }); if (!user) return null;
    const open = await this.db.issue.findFirst({ where: { raisedById: user.id, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] } }, orderBy: { createdAt: 'desc' } });
    if (open) { await this.db.issueMessage.create({ data: { issueId: open.id, authorId: user.id, body: text, viaWhatsapp: true } }); if (open.status === 'WAITING_CUSTOMER') await this.db.issue.update({ where: { id: open.id }, data: { status: 'IN_PROGRESS' } }); return { issue: open, appended: true }; }
    const last = await this.db.order.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    const cat = /wrong|different|bag|lot/i.test(text) ? 'WRONG_BAG' : /late|delay|not (yet )?deliver|where/i.test(text) ? 'LATE' : /damag|torn|wet|broken/i.test(text) ? 'DAMAGED' : /pay|refund|money|charged/i.test(text) ? 'PAYMENT' : /rider|rude|behav/i.test(text) ? 'RIDER' : 'OTHER';
    const issue = await this.create({ sub: user.id, role: user.role }, { category: cat, title: text.slice(0, 120), description: text, orderId: last?.id, channel: 'whatsapp' });
    return { issue, appended: false };
  }

  list(u: any, q: { status?: string; mine?: string; assigneeId?: string; category?: string }) {
    const where: any = {};
    if (!this.isStaff(u)) where.raisedById = u.sub;
    else { if (q.mine === '1') where.assigneeId = u.sub; if (q.assigneeId) where.assigneeId = q.assigneeId; }
    if (q.status) where.status = { in: q.status.split(',') }; else if (this.isStaff(u)) where.status = { notIn: ['CLOSED'] };
    if (q.category) where.category = q.category;
    return this.db.issue.findMany({ where, include: { ...this.include, messages: { where: this.isStaff(u) ? {} : { internal: false }, orderBy: { createdAt: 'desc' as const }, take: 1, include: { author: { select: { id: true, name: true, role: true } } } } }, orderBy: [{ status: 'asc' }, { priority: 'desc' }, { slaDueAt: 'asc' }] });
  }

  async get(u: any, id: string) {
    const i = await this.db.issue.findUnique({ where: { id }, include: this.include }); if (!i) throw new NotFoundException();
    if (!this.isStaff(u) && i.raisedById !== u.sub) throw new ForbiddenException();
    if (!this.isStaff(u)) i.messages = i.messages.filter((m) => !m.internal);
    return i;
  }

  async reply(u: any, id: string, b: { body: string; photo?: string; internal?: boolean; whatsapp?: boolean }) {
    const i = await this.get(u, id); if (!b.body?.trim()) throw new BadRequestException('Message required');
    const staff = this.isStaff(u);
    const m = await this.db.issueMessage.create({ data: { issueId: id, authorId: u.sub, fromStaff: staff, body: b.body.trim(), photo: b.photo || null, internal: staff && !!b.internal, viaWhatsapp: staff && !!b.whatsapp } });
    const data: any = {};
    if (staff && !b.internal) { if (!i.firstResponseAt) data.firstResponseAt = new Date(); if (i.status === 'OPEN') data.status = 'IN_PROGRESS'; if (!i.assigneeId) data.assigneeId = u.sub; }
    if (!staff && i.status === 'WAITING_CUSTOMER') data.status = 'IN_PROGRESS';
    if (Object.keys(data).length) await this.db.issue.update({ where: { id }, data });
    if (staff && !b.internal) await this.notify.send(i.raisedBy.phone, 'issue_reply', `FreshRice (#${i.ticketNo}): ${b.body.trim().slice(0, 900)} — reply here or open ${PUBLIC_BASE}/shop/issues/${id}`);
    return m;
  }

  async update(u: any, id: string, b: { status?: string; assigneeId?: string | null; priority?: string; resolution?: string; category?: string }) {
    if (!this.isStaff(u)) throw new ForbiddenException();
    const i = await this.get(u, id); const data: any = {};
    if (b.assigneeId !== undefined) data.assigneeId = b.assigneeId;
    if (b.priority) { data.priority = b.priority; if (i.status === 'OPEN') data.slaDueAt = new Date(i.createdAt.getTime() + SLA_H[b.priority] * 36e5); }
    if (b.category) data.category = b.category;
    if (b.status) {
      data.status = b.status;
      if (['RESOLVED', 'CLOSED'].includes(b.status)) { if (!b.resolution?.trim() && !i.resolution) throw new BadRequestException('Add a resolution note when resolving'); data.resolvedAt = i.resolvedAt || new Date(); if (b.resolution) data.resolution = b.resolution.trim(); }
      if (b.status === 'OPEN') data.resolvedAt = null;
    }
    const out = await this.db.issue.update({ where: { id }, data, include: this.include });
    if (b.status && b.status !== i.status) {
      const msg = b.status === 'RESOLVED' ? `FreshRice: issue #${i.ticketNo} is resolved — ${data.resolution || i.resolution}. Reply RATE 1-5 to tell us how we did.` : b.status === 'WAITING_CUSTOMER' ? `FreshRice: we need a little more info on issue #${i.ticketNo} — please reply here.` : b.status === 'IN_PROGRESS' ? `FreshRice: we're working on issue #${i.ticketNo}.` : null;
      if (msg) await this.notify.send(i.raisedBy.phone, 'issue_status', msg);
      await this.db.event.create({ data: { actor: u.sub, type: 'issue_status', payload: { ticketNo: i.ticketNo, from: i.status, to: b.status } } });
    }
    return out;
  }

  async rate(u: any, id: string, rating: number) {
    const i = await this.get(u, id); if (i.raisedById !== u.sub) throw new ForbiddenException(); if (!(rating >= 1 && rating <= 5)) throw new BadRequestException('Rating must be 1-5');
    return this.db.issue.update({ where: { id }, data: { rating, status: i.status === 'RESOLVED' ? 'CLOSED' : i.status } });
  }

  async stats() {
    const now = new Date();
    const [open, breached, dueSoon, byCat, resolved7d] = await Promise.all([
      this.db.issue.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] } } }),
      this.db.issue.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, slaDueAt: { lt: now } } }),
      this.db.issue.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, slaDueAt: { gte: now, lt: new Date(now.getTime() + 2 * 36e5) } } }),
      this.db.issue.groupBy({ by: ['category'], where: { createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } }, _count: { _all: true } }),
      this.db.issue.findMany({ where: { resolvedAt: { gte: new Date(now.getTime() - 7 * 86400000) } }, select: { createdAt: true, resolvedAt: true, rating: true } }),
    ]);
    const avgH = resolved7d.length ? Math.round((resolved7d.reduce((a, r) => a + (r.resolvedAt!.getTime() - r.createdAt.getTime()), 0) / resolved7d.length / 36e5) * 10) / 10 : null;
    const rated = resolved7d.filter((r) => r.rating); const csat = rated.length ? Math.round((rated.reduce((a, r) => a + r.rating!, 0) / rated.length) * 10) / 10 : null;
    return { open, breached, dueSoon, avgResolutionHours: avgH, csat, byCategory30d: Object.fromEntries(byCat.map((c) => [c.category, c._count._all])) };
  }

  /** Every 15 min: nudge OPS/ADMIN on WhatsApp about tickets that just breached SLA (once per ticket). */
  @Cron('*/15 * * * *')
  async slaWatch() {
    const breached = await this.db.issue.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, slaDueAt: { lt: new Date() } }, include: { raisedBy: { select: { name: true, phone: true } } } });
    if (!breached.length) return { flagged: 0 };
    const flagged = await this.db.event.findMany({ where: { type: 'issue_sla_breach', at: { gte: new Date(Date.now() - 7 * 86400000) } }, select: { payload: true } });
    const done = new Set(flagged.map((e: any) => e.payload?.id));
    const fresh = breached.filter((b) => !done.has(b.id)); if (!fresh.length) return { flagged: 0 };
    const ops = await this.db.user.findMany({ where: { role: { in: ['OPS', 'ADMIN'] }, active: true, isSuperAdmin: false }, select: { phone: true }, take: 5 });
    const lines = fresh.map((b) => `#${b.ticketNo} ${b.priority} · ${b.title} · ${b.raisedBy.name || b.raisedBy.phone}`).join('\n');
    for (const o of ops) await this.notify.send(o.phone, 'issue_sla', `⚠️ ${fresh.length} issue(s) past SLA:\n${lines}\n${PUBLIC_BASE}/admin/issues`);
    for (const b of fresh) await this.db.event.create({ data: { type: 'issue_sla_breach', payload: { id: b.id, ticketNo: b.ticketNo } } });
    this.log.warn(`SLA breached: ${fresh.map((b) => '#' + b.ticketNo).join(', ')}`);
    return { flagged: fresh.length };
  }
}
