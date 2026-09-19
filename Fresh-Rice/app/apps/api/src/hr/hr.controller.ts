import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { LeaveStatus } from '@prisma/client';
import { Roles, CurrentUser } from '../common/auth.guard';
import { sendExport } from '../common/export';
import { HrService, HrPolicy } from './hr.service';

const HR = ['ADMIN', 'OPS'];
const STAFF = ['ADMIN', 'OPS', 'SALES', 'MARKETING', 'RIDER', 'WAREHOUSE_STAFF'];

@Controller()
export class HrController {
  constructor(private svc: HrService) {}

  // ---- self service (mobile + web) ----
  @Roles(...STAFF) @Get('me/hr') me(@CurrentUser() u: any) { return this.svc.me(u); }
  @Roles(...STAFF) @Post('me/hr/clock-in') clockIn(@CurrentUser() u: any, @Body() b: { lat?: number; lng?: number }) { return this.svc.clockIn(u, b?.lat, b?.lng); }
  @Roles(...STAFF) @Post('me/hr/clock-out') clockOut(@CurrentUser() u: any, @Body() b: { lat?: number; lng?: number }) { return this.svc.clockOut(u, b?.lat, b?.lng); }
  @Roles(...STAFF) @Get('me/hr/attendance') async myAttendance(@CurrentUser() u: any, @Query('month') month?: string) { const a = await this.svc.attendance(month || new Date().toISOString().slice(0, 7), [u.sub]); return { month: a.month, days: a.days, row: a.rows[0] || null }; }
  @Roles(...STAFF) @Get('me/hr/leave') myLeave(@CurrentUser() u: any) { return this.svc.myLeave(u.sub); }
  @Roles(...STAFF) @Get('me/hr/balances') balances(@CurrentUser() u: any, @Query('year') year?: string) { return this.svc.balances(u.sub, year ? Number(year) : undefined); }
  @Roles(...STAFF) @Post('me/hr/leave') requestLeave(@CurrentUser() u: any, @Body() b: any) { return this.svc.requestLeave(u, b); }
  @Roles(...STAFF) @Post('me/hr/leave/:id/cancel') cancel(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.cancelLeave(u, id); }
  // managers see their reports' requests; HR sees all
  @Roles(...STAFF) @Get('hr/leave-queue') queue(@CurrentUser() u: any, @Query('status') status?: LeaveStatus) { return this.svc.leaveQueue(u, status || 'PENDING'); }
  @Roles(...STAFF) @Post('hr/leave/:id/approve') approve(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { note?: string }) { return this.svc.decideLeave(u, id, true, b?.note); }
  @Roles(...STAFF) @Post('hr/leave/:id/reject') reject(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { note?: string }) { return this.svc.decideLeave(u, id, false, b?.note); }
  @Roles(...STAFF) @Get('hr/holidays') holidays(@Query('year') year?: string) { return this.svc.holidays(year ? Number(year) : undefined); }

  // ---- HR admin ----
  @Roles(...HR) @Get('admin/hr/today') today() { return this.svc.today(); }
  @Roles(...HR) @Get('admin/hr/attendance') attendance(@Query('month') month?: string, @Query('userId') userId?: string) { return this.svc.attendance(month || new Date().toISOString().slice(0, 7), userId ? [userId] : undefined); }
  @Roles(...HR) @Get('admin/hr/staff') staff() { return this.svc.staff(); }
  @Roles('ADMIN') @Patch('admin/hr/staff/:id/profile') setProfile(@Param('id') id: string, @Body() b: any) { return this.svc.setProfile(id, b); }
  @Roles(...HR) @Post('admin/hr/holidays') addHoliday(@Body() b: { date: string; name: string; optional?: boolean }) { return this.svc.addHoliday(b); }
  @Roles(...HR) @Delete('admin/hr/holidays/:id') delHoliday(@Param('id') id: string) { return this.svc.removeHoliday(id); }
  @Roles(...HR) @Get('admin/hr/roster') roster(@Query('from') from: string, @Query('to') to: string, @Query('userId') userId?: string) { const t = new Date().toISOString().slice(0, 10); return this.svc.roster(from || t, to || t, userId); }
  @Roles(...HR) @Put('admin/hr/roster') setRoster(@Body() b: { rows: any[] }) { return this.svc.setRoster(b?.rows || []); }
  @Roles(...HR) @Get('admin/hr/policy') policy() { return this.svc.policy(); }
  @Roles('ADMIN') @Put('admin/hr/policy') setPolicy(@CurrentUser() u: any, @Body() b: Partial<HrPolicy>) { return this.svc.setPolicy(u, b); }
  @Roles('ADMIN') @Get('admin/hr/payroll') async payroll(@Query('month') month: string, @Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const m = month || new Date().toISOString().slice(0, 7); const rows = await this.svc.payroll(m);
    if (!format || format === 'json') return rows;
    return sendExport(res!, rows, format, { name: `payroll-${m}`, title: `FreshRice payroll ${m}`, totals: ['payableDays', 'lopDays', 'overtimeHours', 'monthlySalaryRupees', 'lopDeductionRupees', 'overtimeRupees', 'netPayableRupees'] });
  }
  @Roles(...HR) @Get('admin/hr/attendance.export') async attendanceExport(@Query('month') month: string, @Query('format') format: string, @Res({ passthrough: true }) res: Response) {
    const a = await this.svc.attendance(month || new Date().toISOString().slice(0, 7));
    const rows = a.rows.map((r) => { const o: any = { employeeCode: r.profile?.employeeCode || '', name: r.user.name, role: r.user.role }; for (const d of r.days) o['D' + d.date.slice(8)] = d.code || ''; Object.assign(o, { present: r.summary.present, half: r.summary.half, absent: r.summary.absent, leave: r.summary.paidLeave + r.summary.unpaidLeave, late: r.summary.late, hours: r.summary.hours, ot: r.summary.ot, payableDays: r.summary.payableDays }); return o; });
    return sendExport(res, rows, (format as any) || 'csv', { name: `attendance-${a.month}`, title: `Attendance ${a.month}` });
  }
}
