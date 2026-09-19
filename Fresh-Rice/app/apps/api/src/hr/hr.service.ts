import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeaveStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
const istDayStart = (d: Date) => { const ist = new Date(d.getTime() + 5.5 * 36e5); ist.setUTCHours(0, 0, 0, 0); return new Date(ist.getTime() - 5.5 * 36e5); };

type U = { sub: string; role: string };
export const STAFF_ROLES = ['ADMIN', 'OPS', 'SALES', 'MARKETING', 'RIDER', 'WAREHOUSE_STAFF'];
const HR_ADMIN = ['ADMIN', 'OPS'];

export type LeaveType = { code: string; name: string; daysPerYear: number; paid: boolean; carryForward?: boolean };
export type HrPolicy = {
  leaveTypes: LeaveType[];
  fullDayHours: number; halfDayHours: number; workdayHours: number; overtimeAfterHours: number;
  graceMin: number; lateAfterMin: number; maxLateBeforeHalfDay: number;
  geofenceRequired: boolean; payOvertime: boolean; workingDaysPerMonth: number;
};
export const DEFAULT_POLICY: HrPolicy = {
  leaveTypes: [{ code: 'CL', name: 'Casual leave', daysPerYear: 12, paid: true }, { code: 'SL', name: 'Sick leave', daysPerYear: 8, paid: true }, { code: 'EL', name: 'Earned leave', daysPerYear: 15, paid: true, carryForward: true }, { code: 'LWP', name: 'Leave without pay', daysPerYear: 0, paid: false }],
  fullDayHours: 8, halfDayHours: 4, workdayHours: 9, overtimeAfterHours: 9, graceMin: 15, lateAfterMin: 15, maxLateBeforeHalfDay: 3, geofenceRequired: false, payOvertime: false, workingDaysPerMonth: 26,
};
const POLICY_KEY = 'hr_policy';
export const ymd = (d: Date) => new Date(d.getTime() + 5.5 * 36e5).toISOString().slice(0, 10);
const istDow = (d: Date) => new Date(d.getTime() + 5.5 * 36e5).getUTCDay();
const hm = (d: Date) => { const x = new Date(d.getTime() + 5.5 * 36e5); return x.getUTCHours() * 60 + x.getUTCMinutes(); };
const parseHm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
const monthRange = (month: string) => { const [y, m] = month.split('-').map(Number); if (!y || !m) throw new BadRequestException('month must be YYYY-MM'); const from = new Date(Date.UTC(y, m - 1, 1) - 5.5 * 36e5); const to = new Date(Date.UTC(y, m, 1) - 5.5 * 36e5); return { from, to, days: Math.round((to.getTime() - from.getTime()) / 864e5) }; };
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 105);
const yearRange = (y: number) => ({ gte: new Date(Date.UTC(y, 0, 1) - 5.5 * 36e5), lt: new Date(Date.UTC(y + 1, 0, 1) - 5.5 * 36e5) });

export type DayCode = 'P' | 'H' | 'A' | 'L' | 'UL' | 'HO' | 'WO' | 'WFH' | '';

@Injectable()
export class HrService {
  constructor(private db: PrismaService, private notify: NotificationsService) {}

  // ---------- policy ----------
  async policy(): Promise<HrPolicy> { const s = await this.db.setting.findUnique({ where: { key: POLICY_KEY } }); return { ...DEFAULT_POLICY, ...((s?.value as any) || {}) }; }
  async setPolicy(u: U, v: Partial<HrPolicy>) {
    const cur = await this.policy(); const next = { ...cur, ...v };
    if (!Array.isArray(next.leaveTypes) || !next.leaveTypes.every((t) => t.code && t.name && Number.isFinite(t.daysPerYear))) throw new BadRequestException('leaveTypes must be [{code,name,daysPerYear,paid}]');
    for (const k of ['fullDayHours', 'halfDayHours', 'workdayHours', 'overtimeAfterHours', 'graceMin', 'lateAfterMin', 'maxLateBeforeHalfDay', 'workingDaysPerMonth'] as const) { next[k] = Number(next[k]); if (!Number.isFinite(next[k]) || next[k] < 0) throw new BadRequestException(`${k} must be ≥ 0`); }
    await this.db.setting.upsert({ where: { key: POLICY_KEY }, create: { key: POLICY_KEY, value: next as any, updatedBy: u.sub }, update: { value: next as any, updatedBy: u.sub } });
    return next;
  }

  // ---------- profiles ----------
  async staff() {
    const users = await this.db.user.findMany({ where: { role: { in: STAFF_ROLES as any }, isSuperAdmin: false }, select: { id: true, name: true, phone: true, role: true, isField: true, active: true, warehouseId: true, createdAt: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    const profiles = await this.db.staffProfile.findMany({ where: { userId: { in: users.map((u) => u.id) } } }); const pb = new Map(profiles.map((p) => [p.userId, p]));
    return users.map((u) => ({ ...u, profile: pb.get(u.id) || null, manager: pb.get(u.id)?.managerId ? users.find((x) => x.id === pb.get(u.id)!.managerId)?.name || null : null }));
  }
  async setProfile(userId: string, b: Partial<{ employeeCode: string; designation: string; joinedOn: string; monthlySalaryPaise: number; weeklyOffs: number[]; shiftStart: string; shiftEnd: string; managerId: string | null; notes: string }>) {
    const user = await this.db.user.findFirst({ where: { id: userId, role: { in: STAFF_ROLES as any } } });
    if (!user) throw new NotFoundException('Staff member not found');
    if (user.isSuperAdmin) throw new ForbiddenException('This account cannot be modified');
    const data: any = {};
    if (b.employeeCode !== undefined) data.employeeCode = b.employeeCode?.trim() || null;
    if (b.designation !== undefined) data.designation = b.designation?.trim() || null;
    if (b.joinedOn !== undefined) data.joinedOn = b.joinedOn ? new Date(b.joinedOn) : null;
    if (b.monthlySalaryPaise !== undefined) { if (!Number.isInteger(b.monthlySalaryPaise) || b.monthlySalaryPaise < 0) throw new BadRequestException('Salary must be ≥ 0'); data.monthlySalaryPaise = b.monthlySalaryPaise; }
    if (b.weeklyOffs !== undefined) { if (!Array.isArray(b.weeklyOffs) || b.weeklyOffs.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new BadRequestException('weeklyOffs are 0..6'); data.weeklyOffs = b.weeklyOffs; }
    for (const k of ['shiftStart', 'shiftEnd'] as const) if (b[k] !== undefined) { if (!/^\d{2}:\d{2}$/.test(b[k]!)) throw new BadRequestException(`${k} must be HH:MM`); data[k] = b[k]; }
    if (b.managerId !== undefined) { if (b.managerId) { const m = await this.db.user.findFirst({ where: { id: b.managerId, role: { in: ['ADMIN', 'OPS', 'SALES', 'MARKETING'] } } }); if (!m) throw new BadRequestException('Manager must be Admin/Ops/Sales/Marketing'); if (m.id === userId) throw new BadRequestException('Cannot report to self'); } data.managerId = b.managerId || null; }
    if (b.notes !== undefined) data.notes = b.notes?.trim() || null;
    return this.db.staffProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }

  // ---------- holidays / roster ----------
  holidays(year?: number) { const y = year || new Date().getFullYear(); return this.db.holiday.findMany({ where: { date: yearRange(y) }, orderBy: { date: 'asc' } }); }
  async addHoliday(b: { date: string; name: string; optional?: boolean }) { if (!b.date || !b.name?.trim()) throw new BadRequestException('date and name required'); const date = istDayStart(new Date(b.date)); return this.db.holiday.upsert({ where: { date }, create: { date, name: b.name.trim(), optional: !!b.optional }, update: { name: b.name.trim(), optional: !!b.optional } }); }
  async removeHoliday(id: string) { await this.db.holiday.delete({ where: { id } }); return { ok: true }; }
  async roster(from: string, to: string, userId?: string) { const f = istDayStart(new Date(from)); const t = new Date(istDayStart(new Date(to)).getTime() + 864e5); return this.db.roster.findMany({ where: { date: { gte: f, lt: t }, ...(userId ? { userId } : {}) }, orderBy: [{ date: 'asc' }] }); }
  async setRoster(rows: { userId: string; date: string; start?: string; end?: string; label?: string; off?: boolean }[]) {
    let n = 0;
    for (const r of rows || []) {
      const date = istDayStart(new Date(r.date));
      if (r.off) { await this.db.roster.deleteMany({ where: { userId: r.userId, date } }); continue; }
      if (!/^\d{2}:\d{2}$/.test(r.start || '') || !/^\d{2}:\d{2}$/.test(r.end || '')) throw new BadRequestException('start/end must be HH:MM');
      await this.db.roster.upsert({ where: { userId_date: { userId: r.userId, date } }, create: { userId: r.userId, date, start: r.start!, end: r.end!, label: r.label }, update: { start: r.start!, end: r.end!, label: r.label } }); n++;
    }
    return { ok: true, upserted: n };
  }

  // ---------- clock in / out (all staff roles) ----------
  async clockIn(u: U, lat?: number, lng?: number) {
    if (!STAFF_ROLES.includes(u.role)) throw new ForbiddenException('Attendance is for staff accounts');
    const open = await this.db.shift.findFirst({ where: { userId: u.sub, endedAt: null } });
    if (open) return { ...open, alreadyOn: true };
    const [pol, prof, user] = await Promise.all([this.policy(), this.db.staffProfile.findUnique({ where: { userId: u.sub } }), this.db.user.findUnique({ where: { id: u.sub }, include: { warehouse: true } })]);
    const now = new Date(); const today = istDayStart(now);
    const ros = await this.db.roster.findUnique({ where: { userId_date: { userId: u.sub, date: today } } });
    const startStr = ros?.start || prof?.shiftStart || '09:00';
    const lateMin = Math.max(0, hm(now) - parseHm(startStr) - pol.graceMin);
    let geoOk: boolean | null = null; const wh = user?.warehouse;
    if (wh?.lat && wh?.lng && lat && lng) geoOk = km({ lat, lng }, { lat: wh.lat, lng: wh.lng }) * 1000 <= wh.geofenceM;
    if (pol.geofenceRequired && wh?.lat && wh?.lng && (geoOk === false || !lat)) throw new BadRequestException(geoOk === false ? `You are outside the ${wh.name} geofence — clock in at the warehouse` : 'Location is required to clock in');
    const s = await this.db.shift.create({ data: { userId: u.sub, startLat: lat, startLng: lng, geoOk, lateMin } });
    return { ...s, late: lateMin > pol.lateAfterMin, rosterStart: startStr };
  }
  async clockOut(u: U, lat?: number, lng?: number) {
    const open = await this.db.shift.findFirst({ where: { userId: u.sub, endedAt: null } });
    if (!open) throw new BadRequestException('Not clocked in');
    return this.db.shift.update({ where: { id: open.id }, data: { endedAt: new Date(), endLat: lat, endLng: lng } });
  }

  // ---------- attendance engine ----------
  /** Day-by-day attendance for a set of users in a month. Computed from shifts/leave/holidays/rosters, not stored. */
  async attendance(month: string, userIds?: string[]) {
    const { from, to, days } = monthRange(month); const pol = await this.policy(); const now = new Date();
    const users = await this.db.user.findMany({ where: { role: { in: STAFF_ROLES as any }, isSuperAdmin: false, ...(userIds ? { id: { in: userIds } } : {}) }, select: { id: true, name: true, role: true, phone: true, isField: true, active: true, createdAt: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    const ids = users.map((u) => u.id);
    const [profiles, shifts, leaves, holidays, rosters] = await Promise.all([
      this.db.staffProfile.findMany({ where: { userId: { in: ids } } }),
      this.db.shift.findMany({ where: { userId: { in: ids }, startedAt: { gte: from, lt: to } }, orderBy: { startedAt: 'asc' } }),
      this.db.leaveRequest.findMany({ where: { userId: { in: ids }, status: 'APPROVED', type: { not: 'REG' }, from: { lt: to }, to: { gte: from } } }),
      this.db.holiday.findMany({ where: { date: { gte: from, lt: to } } }),
      this.db.roster.findMany({ where: { userId: { in: ids }, date: { gte: from, lt: to } } }),
    ]);
    const pb = new Map(profiles.map((p) => [p.userId, p])); const hol = new Map(holidays.map((h) => [ymd(h.date), h]));
    const lt = new Map(pol.leaveTypes.map((t) => [t.code, t]));
    const rows = users.map((u) => {
      const prof = pb.get(u.id); const offs = prof?.weeklyOffs || [0];
      const mine = shifts.filter((s) => s.userId === u.id); const myLeaves = leaves.filter((l) => l.userId === u.id); const myRos = rosters.filter((r) => r.userId === u.id);
      const daysOut: { date: string; code: DayCode; hours: number; firstIn: Date | null; lastOut: Date | null; lateMin: number; ot: number; leaveType?: string; note?: string; geoFlag?: boolean }[] = [];
      const sum = { present: 0, half: 0, absent: 0, paidLeave: 0, unpaidLeave: 0, holidays: 0, weekOffs: 0, wfh: 0, hours: 0, ot: 0, late: 0, geoFlags: 0 };
      const joined = prof?.joinedOn ? istDayStart(prof.joinedOn) : istDayStart(u.createdAt);
      for (let i = 0; i < days; i++) {
        const d0 = new Date(from.getTime() + i * 864e5); const d1 = new Date(d0.getTime() + 864e5); const key = ymd(d0); const future = d0 > now;
        const ss = mine.filter((s) => s.startedAt >= d0 && s.startedAt < d1);
        const hours = Math.round(ss.reduce((a, s) => a + ((s.endedAt || now).getTime() - s.startedAt.getTime()) / 36e5, 0) * 100) / 100;
        const firstIn = ss[0]?.startedAt || null; const lastOut = ss.length ? ss[ss.length - 1].endedAt : null; const lateMin = ss[0]?.lateMin || 0; const geoFlag = ss.some((s) => s.geoOk === false);
        const leave = myLeaves.find((l) => l.from < d1 && l.to >= d0); const h = hol.get(key); const ros = myRos.find((r) => ymd(r.date) === key);
        let code: DayCode = ''; let leaveType: string | undefined; let note: string | undefined;
        if (d0 < joined) code = '';
        else if (leave && leave.type === 'WFH') { code = 'WFH'; sum.wfh++; }
        else if (leave) { const t = lt.get(leave.type); leaveType = leave.type; if (leave.halfDay && hours >= pol.halfDayHours) { code = 'H'; sum.half++; } else { code = t?.paid === false ? 'UL' : 'L'; t?.paid === false ? sum.unpaidLeave++ : sum.paidLeave++; } }
        else if (h && !h.optional) { code = 'HO'; sum.holidays++; note = h.name; if (hours >= pol.halfDayHours) sum.ot += hours; }
        else if (!ros && offs.includes(istDow(d0))) { code = 'WO'; sum.weekOffs++; if (hours >= pol.halfDayHours) sum.ot += hours; }
        else if (hours >= pol.fullDayHours) { code = 'P'; sum.present++; }
        else if (hours >= pol.halfDayHours) { code = 'H'; sum.half++; }
        else if (!future && !ss.length) { code = 'A'; sum.absent++; }
        else if (!future) { code = 'A'; sum.absent++; note = `only ${hours}h`; }
        const ot = code === 'P' && hours > pol.overtimeAfterHours ? Math.round((hours - pol.overtimeAfterHours) * 100) / 100 : 0;
        if (code === 'P' || code === 'H') { sum.hours += hours; sum.ot += ot; if (lateMin > pol.lateAfterMin) sum.late++; if (geoFlag) sum.geoFlags++; }
        daysOut.push({ date: key, code, hours, firstIn, lastOut, lateMin, ot, leaveType, note, geoFlag: geoFlag || undefined });
      }
      // late-marks beyond the threshold cost half a day each (standard Indian payroll rule)
      const latePenaltyHalfDays = pol.maxLateBeforeHalfDay > 0 ? Math.floor(sum.late / pol.maxLateBeforeHalfDay) : 0;
      const payableDays = Math.max(0, sum.present + sum.half * 0.5 + sum.paidLeave + sum.holidays + sum.weekOffs + sum.wfh - latePenaltyHalfDays * 0.5);
      return { user: u, profile: prof ? { employeeCode: prof.employeeCode, designation: prof.designation, monthlySalaryPaise: prof.monthlySalaryPaise, joinedOn: prof.joinedOn, managerId: prof.managerId } : null, days: daysOut, summary: { ...sum, hours: Math.round(sum.hours * 100) / 100, ot: Math.round(sum.ot * 100) / 100, latePenaltyHalfDays, payableDays, lopDays: Math.round((sum.absent + sum.unpaidLeave + sum.half * 0.5 + latePenaltyHalfDays * 0.5) * 100) / 100 } };
    });
    return { month, days, policy: pol, rows };
  }

  async payroll(month: string) {
    const a = await this.attendance(month); const pol = a.policy;
    return a.rows.filter((r) => r.user.active || r.summary.hours > 0).map((r) => {
      const salary = r.profile?.monthlySalaryPaise || 0; const perDay = salary / a.days; const perHour = salary / (pol.workingDaysPerMonth * pol.workdayHours);
      const lop = Math.round(perDay * r.summary.lopDays); const otPay = pol.payOvertime ? Math.round(perHour * r.summary.ot) : 0;
      return { employeeCode: r.profile?.employeeCode || '', name: r.user.name, role: r.user.role, designation: r.profile?.designation || '', phone: r.user.phone, daysInMonth: a.days, present: r.summary.present, halfDays: r.summary.half, paidLeave: r.summary.paidLeave, unpaidLeave: r.summary.unpaidLeave, absent: r.summary.absent, holidays: r.summary.holidays, weekOffs: r.summary.weekOffs, wfh: r.summary.wfh, lateMarks: r.summary.late, latePenaltyHalfDays: r.summary.latePenaltyHalfDays, payableDays: r.summary.payableDays, lopDays: r.summary.lopDays, hoursWorked: r.summary.hours, overtimeHours: r.summary.ot, monthlySalaryRupees: salary / 100, lopDeductionRupees: lop / 100, overtimeRupees: otPay / 100, netPayableRupees: Math.round(salary - lop + otPay) / 100 };
    });
  }

  /** Today at a glance: who is in, late, absent, on leave, on week-off. */
  async today() {
    const now = new Date(); const key = ymd(now); const month = key.slice(0, 7);
    const a = await this.attendance(month);
    const open = await this.db.shift.findMany({ where: { endedAt: null }, select: { userId: true, startedAt: true } }); const openBy = new Map(open.map((o) => [o.userId, o.startedAt]));
    const rows = a.rows.filter((r) => r.user.active).map((r) => { const d = r.days.find((x) => x.date === key)!; return { user: r.user, code: d.code, hours: d.hours, firstIn: d.firstIn, lastOut: d.lastOut, lateMin: d.lateMin, onDutyNow: openBy.has(r.user.id), since: openBy.get(r.user.id) || null, leaveType: d.leaveType, geoFlag: d.geoFlag, late: d.lateMin > a.policy.lateAfterMin && d.hours > 0 }; });
    const c = (f: (x: any) => boolean) => rows.filter(f).length;
    return { date: key, rows, counts: { in: c((x) => x.onDutyNow), worked: c((x) => x.hours > 0), late: c((x) => x.late), notIn: c((x) => !x.onDutyNow && x.hours === 0 && !['L', 'UL', 'WFH', 'WO', 'HO'].includes(x.code)), onLeave: c((x) => ['L', 'UL', 'WFH'].includes(x.code)), off: c((x) => ['WO', 'HO'].includes(x.code)), pendingRequests: await this.db.leaveRequest.count({ where: { status: 'PENDING' } }) } };
  }

  // ---------- leave ----------
  async balances(userId: string, year?: number) {
    const pol = await this.policy(); const y = year || new Date().getFullYear(); const yr = yearRange(y);
    const [taken, pending] = await Promise.all([
      this.db.leaveRequest.groupBy({ by: ['type'], where: { userId, status: 'APPROVED', from: yr }, _sum: { days: true } }),
      this.db.leaveRequest.groupBy({ by: ['type'], where: { userId, status: 'PENDING', from: yr }, _sum: { days: true } }),
    ]);
    return pol.leaveTypes.map((t) => { const used = taken.find((x) => x.type === t.code)?._sum.days || 0; const pend = pending.find((x) => x.type === t.code)?._sum.days || 0; return { ...t, used, pending: pend, balance: t.daysPerYear ? Math.max(0, t.daysPerYear - used - pend) : null }; });
  }
  private countDays(from: Date, to: Date, offs: number[], hol: Set<string>) { let n = 0; for (let d = from; d <= to; d = new Date(d.getTime() + 864e5)) if (!offs.includes(istDow(d)) && !hol.has(ymd(d))) n++; return n; }
  async requestLeave(u: U, b: { type: string; from: string; to?: string; halfDay?: boolean; reason: string; claimedIn?: string; claimedOut?: string }) {
    if (!STAFF_ROLES.includes(u.role)) throw new ForbiddenException();
    if (!b.reason?.trim()) throw new BadRequestException('Reason is required');
    const pol = await this.policy(); const from = istDayStart(new Date(b.from)); const to = istDayStart(new Date(b.to || b.from));
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) throw new BadRequestException('Bad dates');
    let days = 0; let claimedIn: Date | undefined, claimedOut: Date | undefined;
    if (b.type === 'REG') {
      if (!b.claimedIn || !b.claimedOut) throw new BadRequestException('Regularisation needs the in and out times');
      claimedIn = new Date(b.claimedIn); claimedOut = new Date(b.claimedOut);
      if (isNaN(claimedIn.getTime()) || isNaN(claimedOut.getTime()) || claimedOut <= claimedIn || (claimedOut.getTime() - claimedIn.getTime()) / 36e5 > 16) throw new BadRequestException('Bad in/out times');
      if (from > istDayStart(new Date())) throw new BadRequestException('Can only regularise past days');
      const dup = await this.db.leaveRequest.findFirst({ where: { userId: u.sub, type: 'REG', from, status: { in: ['PENDING', 'APPROVED'] } } });
      if (dup) throw new BadRequestException('Already requested for that day');
    } else {
      if (b.type !== 'WFH' && !pol.leaveTypes.some((t) => t.code === b.type)) throw new BadRequestException('Unknown leave type');
      const prof = await this.db.staffProfile.findUnique({ where: { userId: u.sub } }); const hol = new Set((await this.db.holiday.findMany({ where: { date: { gte: from, lte: to }, optional: false } })).map((h) => ymd(h.date)));
      days = this.countDays(from, to, prof?.weeklyOffs || [0], hol);
      if (b.halfDay) { if (from.getTime() !== to.getTime()) throw new BadRequestException('Half day is a single date'); days = 0.5; }
      if (days <= 0) throw new BadRequestException('No working days in that range');
      const overlap = await this.db.leaveRequest.findFirst({ where: { userId: u.sub, status: { in: ['PENDING', 'APPROVED'] }, type: { not: 'REG' }, from: { lte: to }, to: { gte: from } } });
      if (overlap) throw new BadRequestException('Overlaps an existing request');
      const t = pol.leaveTypes.find((x) => x.code === b.type);
      if (t && t.daysPerYear > 0) { const bal = (await this.balances(u.sub, new Date(from.getTime() + 5.5 * 36e5).getUTCFullYear())).find((x) => x.code === b.type)!; if (days > (bal.balance ?? 0)) throw new BadRequestException(`Only ${bal.balance} ${t.name} day(s) left — apply the rest as LWP`); }
    }
    const r = await this.db.leaveRequest.create({ data: { userId: u.sub, type: b.type, from, to, days, halfDay: !!b.halfDay, reason: b.reason.trim(), claimedIn, claimedOut } });
    const prof = await this.db.staffProfile.findUnique({ where: { userId: u.sub } }); const me = await this.db.user.findUnique({ where: { id: u.sub } });
    const approvers = prof?.managerId ? [await this.db.user.findUnique({ where: { id: prof.managerId } })] : await this.db.user.findMany({ where: { role: 'ADMIN', active: true }, take: 3 });
    for (const a of approvers) if (a) await this.notify.send(a.phone, 'leave_request', `${me?.name || 'Staff'} requests ${b.type === 'REG' ? 'attendance regularisation' : `${days} day(s) ${b.type}`} ${ymd(from)}${to > from ? ' → ' + ymd(to) : ''}: ${b.reason.trim()}. Approve in Admin → HR.`);
    return r;
  }
  myLeave(userId: string) { return this.db.leaveRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }); }
  async cancelLeave(u: U, id: string) {
    const r = await this.db.leaveRequest.findFirst({ where: { id, userId: u.sub } }); if (!r) throw new NotFoundException();
    if (r.status === 'REJECTED' || r.status === 'CANCELLED') throw new BadRequestException('Already closed');
    if (r.status === 'APPROVED' && r.from < istDayStart(new Date())) throw new BadRequestException('Leave already started — ask your manager');
    return this.db.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
  private async reportsOf(userId: string) { return (await this.db.staffProfile.findMany({ where: { managerId: userId }, select: { userId: true } })).map((p) => p.userId); }
  async leaveQueue(u: U, status: LeaveStatus = 'PENDING') {
    const isHr = HR_ADMIN.includes(u.role);
    const reports = isHr ? null : await this.reportsOf(u.sub);
    if (!isHr && !reports?.length) throw new ForbiddenException('No reports');
    const rows = await this.db.leaveRequest.findMany({ where: { status, ...(reports ? { userId: { in: reports } } : {}) }, orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' }, take: 200 });
    const ids = [...new Set(rows.flatMap((r) => [r.userId, r.approverId].filter(Boolean) as string[]))];
    const users = await this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true, phone: true } }); const by = new Map(users.map((x) => [x.id, x]));
    return rows.map((r) => ({ ...r, user: by.get(r.userId) || null, approver: r.approverId ? by.get(r.approverId) || null : null }));
  }
  async decideLeave(u: U, id: string, approve: boolean, note?: string) {
    const r = await this.db.leaveRequest.findUniqueOrThrow({ where: { id } });
    if (r.status !== 'PENDING') throw new BadRequestException('Already decided');
    if (r.userId === u.sub) throw new ForbiddenException('Cannot approve your own request');
    const prof = await this.db.staffProfile.findUnique({ where: { userId: r.userId } });
    if (!HR_ADMIN.includes(u.role) && prof?.managerId !== u.sub) throw new ForbiddenException('Only the manager, Ops or Admin can decide this');
    if (!approve && !note?.trim()) throw new BadRequestException('A note is required to reject');
    const upd = await this.db.leaveRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', approverId: u.sub, decidedAt: new Date(), decisionNote: note?.trim() || null } });
    if (approve && r.type === 'REG' && r.claimedIn && r.claimedOut) await this.db.shift.create({ data: { userId: r.userId, startedAt: r.claimedIn, endedAt: r.claimedOut, source: 'regularised', lateMin: 0, note: `Regularised: ${r.reason}` } });
    const who = await this.db.user.findUnique({ where: { id: r.userId } });
    if (who) await this.notify.send(who.phone, 'leave_decided', `${approve ? 'Approved' : 'Rejected'}: ${r.type === 'REG' ? 'attendance regularisation' : `${r.days} day(s) ${r.type}`} from ${ymd(r.from)}${note ? ` — ${note.trim()}` : ''}.`);
    return upd;
  }

  /** Everything the mobile HR tab needs in one call. */
  async me(u: U) {
    if (!STAFF_ROLES.includes(u.role)) throw new ForbiddenException('Attendance is for staff accounts');
    const now = new Date(); const month = ymd(now).slice(0, 7);
    const [a, bal, reqs, open, pol, hol, prof, user] = await Promise.all([this.attendance(month, [u.sub]), this.balances(u.sub), this.myLeave(u.sub), this.db.shift.findFirst({ where: { userId: u.sub, endedAt: null } }), this.policy(), this.db.holiday.findMany({ where: { date: { gte: istDayStart(now) } }, orderBy: { date: 'asc' }, take: 5 }), this.db.staffProfile.findUnique({ where: { userId: u.sub } }), this.db.user.findUnique({ where: { id: u.sub }, select: { isField: true } })]);
    const row = a.rows[0]; const today = row?.days.find((d) => d.date === ymd(now)) || null;
    const wk = await this.roster(ymd(now), ymd(new Date(now.getTime() + 6 * 864e5)), u.sub);
    const isHr = HR_ADMIN.includes(u.role); const reports = isHr ? null : await this.reportsOf(u.sub);
    const reportsPending = isHr || reports?.length ? await this.db.leaveRequest.count({ where: { status: 'PENDING', ...(reports ? { userId: { in: reports } } : {}) } }) : 0;
    return { onDuty: !!open, since: open?.startedAt || null, today, month: row?.summary || null, balances: bal, requests: reqs.slice(0, 10), roster: wk, holidays: hol, leaveTypes: pol.leaveTypes, shiftStart: prof?.shiftStart || '09:00', shiftEnd: prof?.shiftEnd || '18:00', canApprove: isHr || !!reports?.length, reportsPending, canTrackLocation: u.role === 'RIDER' || !!user?.isField };
  }
}
