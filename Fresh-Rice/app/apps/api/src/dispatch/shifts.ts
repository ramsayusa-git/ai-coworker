import { Injectable, Logger, BadRequestException, ForbiddenException, Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/auth.guard';

const MAX_SHIFT_H = 16;

@Injectable()
export class ShiftsService {
  private log = new Logger('Shifts');
  constructor(private db: PrismaService) {}

  current(userId: string) { return this.db.shift.findFirst({ where: { userId, endedAt: null }, orderBy: { startedAt: 'desc' } }); }

  async start(userId: string, lat?: number, lng?: number) {
    const open = await this.current(userId);
    if (open) return { ...open, alreadyOn: true };
    return this.db.shift.create({ data: { userId, startLat: lat, startLng: lng } });
  }

  async end(userId: string, lat?: number, lng?: number) {
    const open = await this.current(userId);
    if (!open) throw new BadRequestException('Not on duty');
    return this.db.shift.update({ where: { id: open.id }, data: { endedAt: new Date(), endLat: lat, endLng: lng } });
  }

  /** Hours today (IST day) for one user, including an open shift up to now. */
  async hoursToday(userId: string) {
    const start = istDayStart(new Date());
    const rows = await this.db.shift.findMany({ where: { userId, OR: [{ startedAt: { gte: start } }, { endedAt: null }] } });
    return Math.round(rows.reduce((a, s) => a + ((s.endedAt || new Date()).getTime() - Math.max(s.startedAt.getTime(), start.getTime())) / 36e5, 0) * 100) / 100;
  }

  /** Per-person hours report between two dates (inclusive, IST days). */
  async report(from: string, to: string, userId?: string) {
    const f = istDayStart(new Date(from)); const t = new Date(istDayStart(new Date(to)).getTime() + 86400000);
    const rows = await this.db.shift.findMany({ where: { startedAt: { gte: f, lt: t }, ...(userId ? { userId } : {}) }, orderBy: { startedAt: 'asc' } });
    const users = await this.db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true, phone: true, role: true, isField: true } });
    const by = new Map<string, any>();
    for (const r of rows) {
      const end = r.endedAt || new Date(); const h = (end.getTime() - r.startedAt.getTime()) / 36e5;
      const u = users.find((x) => x.id === r.userId)!;
      const day = istDayStart(r.startedAt).toISOString().slice(0, 10);
      const k = r.userId; const cur = by.get(k) || { userId: k, name: u?.name, phone: u?.phone, role: u?.role, isField: u?.isField, shifts: 0, hours: 0, days: new Set<string>(), firstIn: r.startedAt, lastOut: r.endedAt, openNow: false, autoClosed: 0, byDay: {} as Record<string, number> };
      cur.shifts++; cur.hours += h; cur.days.add(day); cur.byDay[day] = Math.round(((cur.byDay[day] || 0) + h) * 100) / 100;
      if (r.startedAt < cur.firstIn) cur.firstIn = r.startedAt; if (!r.endedAt) cur.openNow = true; else if (!cur.lastOut || r.endedAt > cur.lastOut) cur.lastOut = r.endedAt;
      if (r.autoClosed) cur.autoClosed++;
      by.set(k, cur);
    }
    return [...by.values()].map((x) => ({ ...x, hours: Math.round(x.hours * 100) / 100, days: x.days.size, avgHoursPerDay: Math.round((x.hours / Math.max(1, x.days.size)) * 100) / 100 })).sort((a, b) => b.hours - a.hours);
  }

  /** Safety net: nobody is "on duty" for more than 16h because they forgot to clock out. */
  @Cron('*/30 * * * *')
  async autoClose() {
    const r = await this.db.shift.updateMany({ where: { endedAt: null, startedAt: { lt: new Date(Date.now() - MAX_SHIFT_H * 36e5) } }, data: { endedAt: new Date(), autoClosed: true } });
    if (r.count) this.log.warn(`Auto-closed ${r.count} shift(s) open > ${MAX_SHIFT_H}h`);
  }
}

export function istDayStart(d: Date) { const ist = new Date(d.getTime() + 5.5 * 36e5); ist.setUTCHours(0, 0, 0, 0); return new Date(ist.getTime() - 5.5 * 36e5); }

@ApiTags('shifts') @ApiBearerAuth() @Controller()
export class ShiftsController {
  constructor(private svc: ShiftsService) {}
  private guard(u: any) { if (u.role !== 'RIDER' && !u.isField) throw new ForbiddenException('Duty tracking is for riders and field staff'); }
  @Get('me/shift') async mine(@CurrentUser() u: any) { const cur = await this.svc.current(u.sub); return { onDuty: !!cur, since: cur?.startedAt || null, hoursToday: await this.svc.hoursToday(u.sub), canTrack: u.role === 'RIDER' || !!u.isField }; }
  @Post('me/shift/start') start(@CurrentUser() u: any, @Body() b: { lat?: number; lng?: number }) { this.guard(u); return this.svc.start(u.sub, b?.lat, b?.lng); }
  @Post('me/shift/end') end(@CurrentUser() u: any, @Body() b: { lat?: number; lng?: number }) { this.guard(u); return this.svc.end(u.sub, b?.lat, b?.lng); }
  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('admin/shifts') report(@Query('from') from: string, @Query('to') to: string, @Query('userId') userId?: string) {
    const today = new Date().toISOString().slice(0, 10);
    return this.svc.report(from || today, to || today, userId);
  }
}
