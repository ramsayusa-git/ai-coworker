import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { startOfDay, addDays } from '../common/money';

@Injectable()
export class LeadsService {
  constructor(private db: PrismaService, private notify: NotificationsService) {}

  private scopeFilter(u: any, extra: any = {}) {
    // SALES reps see their own assigned leads + the unassigned pool. ADMIN/OPS/MARKETING see everything.
    if (u.role === 'SALES') return { ...extra, OR: [{ assignedToId: u.sub }, { assignedToId: null }] };
    return extra;
  }

  list(u: any, status?: string, assignedToId?: string, zoneId?: string) {
    const where: any = this.scopeFilter(u, { ...(status ? { status } : {}), ...(assignedToId ? { assignedToId } : {}), ...(zoneId ? { zoneId } : {}) });
    return this.db.lead.findMany({ where, include: { assignedTo: { select: { id: true, name: true, phone: true } }, activities: { orderBy: { createdAt: 'desc' }, take: 3 } }, orderBy: { updatedAt: 'desc' } });
  }

  async get(u: any, id: string) {
    // findUniqueOrThrow raises a Prisma error that surfaces as a 500; a lead that was
    // deleted (or a stale bookmark) is a 404, not a server fault.
    const lead = await this.db.lead.findUnique({ where: { id }, include: { assignedTo: true, activities: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { name: true } } } } } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (u.role === 'SALES' && lead.assignedToId && lead.assignedToId !== u.sub) throw new ForbiddenException('Not your lead');
    return lead;
  }

  create(u: any, b: { name: string; phone: string; company?: string; source?: string; estValueRupees?: number; zoneId?: string; notes?: string; assignedToId?: string }) {
    return this.db.lead.create({ data: { name: b.name, phone: b.phone, company: b.company, source: b.source, estValuePaise: Math.round((b.estValueRupees || 0) * 100), zoneId: b.zoneId, notes: b.notes, assignedToId: b.assignedToId || (u.role === 'SALES' ? u.sub : undefined) } });
  }

  async update(u: any, id: string, b: { status?: string; assignedToId?: string; estValueRupees?: number; notes?: string; name?: string; company?: string }) {
    const lead = await this.db.lead.findUniqueOrThrow({ where: { id } });
    if (u.role === 'SALES' && lead.assignedToId && lead.assignedToId !== u.sub) throw new ForbiddenException('Not your lead');
    return this.db.lead.update({ where: { id }, data: { status: b.status as any, assignedToId: b.assignedToId, estValuePaise: b.estValueRupees != null ? Math.round(b.estValueRupees * 100) : undefined, notes: b.notes, name: b.name, company: b.company } });
  }

  /** Delete a lead and its activity history.
   *  - SALES may only delete a lead assigned to them (same rule as update).
   *  - A converted lead is refused: it is tied to a real B2B account, and losing the
   *    trail of where that customer came from is worse than a stale row. Mark it LOST
   *    instead if it is dead.
   *  LeadActivity has no onDelete: Cascade, so the children go first, in one transaction. */
  async remove(u: any, id: string) {
    const lead = await this.db.lead.findUniqueOrThrow({ where: { id }, include: { _count: { select: { activities: true } } } });
    if (u.role === 'SALES' && lead.assignedToId && lead.assignedToId !== u.sub) throw new ForbiddenException('Not your lead');
    if (lead.b2bAccountId) throw new BadRequestException('This lead was converted to a B2B account — mark it LOST instead of deleting it');

    await this.db.$transaction([
      this.db.leadActivity.deleteMany({ where: { leadId: id } }),
      this.db.lead.delete({ where: { id } }),
      // Snapshot the row so a deletion can still be explained months later.
      this.db.event.create({ data: { actor: u.sub, type: 'lead_deleted', payload: {
        id, name: lead.name, phone: lead.phone, company: lead.company,
        status: lead.status, estValuePaise: lead.estValuePaise, activities: lead._count.activities,
      } } }),
    ]);
    return { ok: true, deleted: lead.name, activitiesRemoved: lead._count.activities };
  }

  async addActivity(u: any, leadId: string, b: { type: string; note?: string; nextFollowUpAt?: string }) {
    const lead = await this.db.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (u.role === 'SALES' && lead.assignedToId && lead.assignedToId !== u.sub) throw new ForbiddenException('Not your lead');
    const activity = await this.db.leadActivity.create({ data: { leadId, type: b.type as any, note: b.note, nextFollowUpAt: b.nextFollowUpAt ? new Date(b.nextFollowUpAt) : null, createdById: u.sub } });
    await this.db.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: b.nextFollowUpAt ? new Date(b.nextFollowUpAt) : lead.nextFollowUpAt, status: lead.status === 'NEW' ? 'CONTACTED' : lead.status } });
    return activity;
  }

  async convert(u: any, leadId: string, b: { creditLimitRupees?: number; tier?: number; contactPhone?: string }) {
    const lead = await this.db.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (u.role === 'SALES' && lead.assignedToId && lead.assignedToId !== u.sub) throw new ForbiddenException('Not your lead');
    if (lead.b2bAccountId) throw new BadRequestException('Lead already converted');
    const phone = '+91' + (b.contactPhone || lead.phone).replace(/\D/g, '').slice(-10);
    const acc = await this.db.b2bAccount.create({ data: { name: lead.company || lead.name, creditLimitPaise: 0, termsDays: 0, tier: b.tier ?? 1 } });
    await this.db.user.upsert({ where: { phone }, update: { role: 'B2B_USER', b2bAccountId: acc.id }, create: { phone, name: lead.name, role: 'B2B_USER', b2bAccountId: acc.id, lang: 'en', referralCode: 'B2B' + phone.slice(-4) + Math.random().toString(36).slice(2, 4).toUpperCase() } });
    await this.db.lead.update({ where: { id: leadId }, data: { status: 'WON', b2bAccountId: acc.id } });
    return acc;
  }

  async followups(u: any, when: 'today' | 'overdue') {
    const today = startOfDay(); const tomorrow = addDays(today, 1);
    const where: any = when === 'today' ? { nextFollowUpAt: { gte: today, lt: tomorrow } } : { nextFollowUpAt: { lt: today } };
    return this.db.lead.findMany({ where: this.scopeFilter(u, { ...where, status: { notIn: ['WON', 'LOST'] } }), include: { assignedTo: { select: { name: true, phone: true } } }, orderBy: { nextFollowUpAt: 'asc' } });
  }

  // Runs daily: nudges each sales rep with a WhatsApp summary of leads due today/overdue.
  async remindDueFollowups() {
    const today = startOfDay(); const tomorrow = addDays(today, 1);
    const due = await this.db.lead.findMany({ where: { nextFollowUpAt: { lt: tomorrow }, status: { notIn: ['WON', 'LOST'] }, assignedToId: { not: null } }, include: { assignedTo: true } });
    const byRep: Record<string, { rep: any; leads: any[] }> = {};
    for (const l of due) { if (!l.assignedTo) continue; byRep[l.assignedToId!] ??= { rep: l.assignedTo, leads: [] }; byRep[l.assignedToId!].leads.push(l); }
    let sent = 0;
    for (const { rep, leads } of Object.values(byRep)) {
      await this.notify.send(rep.phone, 'lead_followup', `You have ${leads.length} lead follow-up(s) due: ${leads.map((l) => l.name).slice(0, 5).join(', ')}`);
      sent++;
    }
    return { repsNotified: sent, leadsDue: due.length };
  }
}
