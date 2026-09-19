import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HireBasis, VehicleOwnership, VehicleStatus, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { rupees } from '../common/money';

type U = { sub: string; role: string };
const LOG_TYPES = ['FUEL', 'MAINTENANCE', 'REPAIR', 'TOLL', 'FINE', 'OTHER'];
const DOCS = ['insuranceExpiry', 'pucExpiry', 'fitnessExpiry', 'permitExpiry'] as const;
const DOC_LABEL: Record<string, string> = { insuranceExpiry: 'Insurance', pucExpiry: 'PUC', fitnessExpiry: 'Fitness', permitExpiry: 'Permit' };
const monthRange = (month: string) => { const [y, m] = month.split('-').map(Number); if (!y || !m) throw new BadRequestException('month must be YYYY-MM'); const from = new Date(Date.UTC(y, m - 1, 1) - 5.5 * 36e5); const to = new Date(Date.UTC(y, m, 1) - 5.5 * 36e5); return { from, to, days: Math.round((to.getTime() - from.getTime()) / 864e5) }; };
const dateOrNull = (v: any) => (v === undefined ? undefined : v ? new Date(v) : null);
const CHECK_ITEMS = ['brakes', 'lights', 'tyres', 'horn', 'mirrors', 'fuel', 'documents', 'cleanliness'];

@Injectable()
export class FleetService {
  private log = new Logger('Fleet');
  constructor(private db: PrismaService, private notify: NotificationsService) {}

  // ---------- vendors ----------
  async vendors() {
    const rows = await this.db.vehicleVendor.findMany({ include: { vehicles: { select: { id: true, regNo: true, status: true, hireRatePaise: true, hireBasis: true } }, ledger: { select: { deltaPaise: true, reason: true, dueDate: true } } }, orderBy: { name: 'asc' } });
    return rows.map((v) => { const balance = v.ledger.reduce((a, l) => a + l.deltaPaise, 0); const overdueBills = v.ledger.filter((l) => l.reason === 'BILL' && l.dueDate && l.dueDate < new Date()).reduce((a, l) => a + l.deltaPaise, 0); return { ...v, balancePaise: balance, overduePaise: Math.max(0, Math.min(balance, overdueBills)), ledger: undefined }; });
  }
  async saveVendor(id: string | null, b: any) {
    if (!b.name?.trim() || !b.phone?.trim()) throw new BadRequestException('Name and phone are required');
    const data = { name: b.name.trim(), contactName: b.contactName?.trim() || null, phone: b.phone.trim(), gstin: b.gstin?.trim().toUpperCase() || null, address: b.address?.trim() || null, paymentTerms: b.paymentTerms?.trim() || null, bankNote: b.bankNote?.trim() || null, active: b.active ?? true };
    return id ? this.db.vehicleVendor.update({ where: { id }, data }) : this.db.vehicleVendor.create({ data });
  }
  async vendorLedger(id: string) {
    const v = await this.db.vehicleVendor.findUnique({ where: { id }, include: { vehicles: true } }); if (!v) throw new NotFoundException();
    const rows = await this.db.vehicleVendorLedger.findMany({ where: { vendorId: id }, orderBy: { date: 'desc' }, take: 300 });
    let bal = 0; const asc = [...rows].reverse().map((r) => { bal += r.deltaPaise; return { ...r, runningPaise: bal }; }).reverse();
    return { vendor: v, rows: asc, balancePaise: bal, billed: rows.filter((r) => r.reason === 'BILL').reduce((a, r) => a + r.deltaPaise, 0), paid: -rows.filter((r) => r.reason === 'PAYMENT').reduce((a, r) => a + r.deltaPaise, 0) };
  }
  async addLedger(id: string, u: U, b: { reason: 'BILL' | 'PAYMENT' | 'ADJUST'; amountPaise: number; date?: string; vehicleId?: string; periodFrom?: string; periodTo?: string; dueDate?: string; method?: string; ref?: string; note?: string }) {
    if (!['BILL', 'PAYMENT', 'ADJUST'].includes(b.reason)) throw new BadRequestException('reason must be BILL, PAYMENT or ADJUST');
    const amt = Math.round(Number(b.amountPaise)); if (!Number.isFinite(amt) || amt === 0) throw new BadRequestException('Amount required');
    if (b.reason === 'PAYMENT' && u.role !== 'ADMIN') throw new ForbiddenException('Only Admin records vendor payments');
    const delta = b.reason === 'BILL' ? Math.abs(amt) : b.reason === 'PAYMENT' ? -Math.abs(amt) : amt;
    if (b.reason === 'PAYMENT' && !b.ref?.trim()) throw new BadRequestException('Payment reference (UTR / receipt no) is required');
    const row = await this.db.vehicleVendorLedger.create({ data: { vendorId: id, reason: b.reason, deltaPaise: delta, date: b.date ? new Date(b.date) : new Date(), vehicleId: b.vehicleId || null, periodFrom: dateOrNull(b.periodFrom) ?? null, periodTo: dateOrNull(b.periodTo) ?? null, dueDate: dateOrNull(b.dueDate) ?? null, method: b.method || null, ref: b.ref?.trim() || null, note: b.note?.trim() || null, byUserId: u.sub } });
    if (b.reason === 'PAYMENT') { const v = await this.db.vehicleVendor.findUnique({ where: { id } }); if (v) await this.notify.send(v.phone, 'vendor_payment', `FreshRice paid ₹${rupees(Math.abs(amt))} to ${v.name} (${b.method || 'bank'} ref ${b.ref}). Thank you.`); }
    return row;
  }
  /** Raise the month's hire bill for every HIRED vehicle of a vendor (PER_MONTH: rate; PER_DAY: rate × days; PER_TRIP: rate × routes completed; PER_KM: rate × km driven from checks). Idempotent per vehicle+month. */
  async billHire(vendorId: string, u: U, month: string) {
    const { from, to, days } = monthRange(month);
    const vehicles = await this.db.vehicle.findMany({ where: { vendorId, ownership: 'HIRED', active: true } });
    const out: any[] = [];
    for (const v of vehicles) {
      const dup = await this.db.vehicleVendorLedger.findFirst({ where: { vendorId, vehicleId: v.id, reason: 'BILL', periodFrom: from } });
      if (dup) { out.push({ regNo: v.regNo, skipped: 'already billed' }); continue; }
      let amount = 0; let basisNote = '';
      if (v.hireBasis === 'PER_MONTH') { amount = v.hireRatePaise; basisNote = 'monthly'; }
      else if (v.hireBasis === 'PER_DAY') { amount = v.hireRatePaise * days; basisNote = `${days} days`; }
      else if (v.hireBasis === 'PER_TRIP') { const trips = await this.db.route.count({ where: { vehicleId: v.id, date: { gte: from, lt: to }, status: 'COMPLETED' } }); amount = v.hireRatePaise * trips; basisNote = `${trips} trips`; }
      else { const ch = await this.db.tripCheck.findMany({ where: { vehicleId: v.id, date: { gte: from, lt: to }, odometerEnd: { not: null } } }); const km = ch.reduce((a, c) => a + Math.max(0, (c.odometerEnd || 0) - (c.odometerStart || 0)), 0); amount = v.hireRatePaise * km; basisNote = `${km} km`; }
      if (amount <= 0) { out.push({ regNo: v.regNo, skipped: 'nothing to bill' }); continue; }
      await this.db.vehicleVendorLedger.create({ data: { vendorId, reason: 'BILL', deltaPaise: amount, vehicleId: v.id, periodFrom: from, periodTo: new Date(to.getTime() - 1), dueDate: new Date(to.getTime() + 7 * 864e5), note: `Hire ${month} · ${v.regNo} · ${basisNote}`, byUserId: u.sub } });
      out.push({ regNo: v.regNo, billedPaise: amount, basis: basisNote });
    }
    return { month, results: out };
  }

  // ---------- vehicles ----------
  async vehicles(q: { status?: string; vendorId?: string } = {}) {
    const rows = await this.db.vehicle.findMany({ where: { ...(q.status ? { status: q.status as VehicleStatus } : {}), ...(q.vendorId ? { vendorId: q.vendorId } : {}) }, include: { vendor: { select: { id: true, name: true } }, checks: { orderBy: { date: 'desc' }, take: 1 } }, orderBy: [{ status: 'asc' }, { regNo: 'asc' }] });
    const riders = await this.db.user.findMany({ where: { id: { in: rows.map((r) => r.assignedRiderId).filter(Boolean) as string[] } }, select: { id: true, name: true, phone: true } }); const rb = new Map(riders.map((r) => [r.id, r]));
    const now = Date.now();
    return rows.map((v) => ({ ...v, rider: v.assignedRiderId ? rb.get(v.assignedRiderId) || null : null, lastCheck: v.checks[0] || null, checks: undefined, docAlerts: DOCS.filter((d) => v[d] && (v[d]!.getTime() - now) / 864e5 < 30).map((d) => ({ doc: DOC_LABEL[d], expiresOn: v[d], expired: v[d]! < new Date() })) }));
  }
  async vehicle(id: string) {
    const v = await this.db.vehicle.findUnique({ where: { id }, include: { vendor: true, logs: { orderBy: { date: 'desc' }, take: 100 }, checks: { orderBy: { date: 'desc' }, take: 30 } } }); if (!v) throw new NotFoundException();
    const rider = v.assignedRiderId ? await this.db.user.findUnique({ where: { id: v.assignedRiderId }, select: { id: true, name: true, phone: true } }) : null;
    const month = new Date().toISOString().slice(0, 7); const cost = await this.costs(month, [id]);
    const ids = [...new Set([...v.logs.map((l) => l.byUserId), ...v.checks.map((c) => c.riderId)].filter(Boolean) as string[])];
    const users = await this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }); const ub = new Map(users.map((x) => [x.id, x.name]));
    const lastService = v.logs.find((l) => (l.type === 'MAINTENANCE' || l.type === 'REPAIR') && (l.nextDueKm || l.nextDueOn));
    return { ...v, rider, thisMonth: cost[0] || null, logs: v.logs.map((l) => ({ ...l, by: l.byUserId ? ub.get(l.byUserId) : null })), checks: v.checks.map((c) => ({ ...c, rider: ub.get(c.riderId) || null })), serviceDue: lastService ? { km: lastService.nextDueKm, on: lastService.nextDueOn, kmLeft: lastService.nextDueKm ? lastService.nextDueKm - v.odometerKm : null } : null };
  }
  async saveVehicle(id: string | null, b: any) {
    if (!id && !b.regNo?.trim()) throw new BadRequestException('Registration number required');
    if (b.type && !Object.values(VehicleType).includes(b.type)) throw new BadRequestException('Bad vehicle type');
    if (b.ownership && !Object.values(VehicleOwnership).includes(b.ownership)) throw new BadRequestException('ownership OWNED|HIRED');
    if (b.hireBasis && !Object.values(HireBasis).includes(b.hireBasis)) throw new BadRequestException('Bad hire basis');
    if (b.status && !Object.values(VehicleStatus).includes(b.status)) throw new BadRequestException('Bad status');
    if (b.ownership === 'HIRED' && !b.vendorId && !id) throw new BadRequestException('Hired vehicles need a vendor');
    if (b.assignedRiderId) { const r = await this.db.user.findFirst({ where: { id: b.assignedRiderId, role: 'RIDER' } }); if (!r) throw new BadRequestException('Rider not found'); const taken = await this.db.vehicle.findFirst({ where: { assignedRiderId: b.assignedRiderId, id: { not: id || '' } } }); if (taken) throw new BadRequestException(`${r.name} already has ${taken.regNo} — unassign it first`); }
    const data: any = {};
    for (const k of ['type', 'ownership', 'vendorId', 'make', 'model', 'fuelType', 'hireBasis', 'status', 'notes', 'assignedRiderId', 'active'] as const) if (b[k] !== undefined) data[k] = typeof b[k] === 'string' && !b[k] ? null : b[k];
    if (b.regNo !== undefined) data.regNo = b.regNo.trim().toUpperCase().replace(/\s+/g, '');
    if (b.capacityKg !== undefined) data.capacityKg = Number(b.capacityKg);
    if (b.hireRatePaise !== undefined) data.hireRatePaise = Math.round(Number(b.hireRatePaise) || 0);
    if (b.odometerKm !== undefined) data.odometerKm = Math.round(Number(b.odometerKm) || 0);
    for (const d of DOCS) if (b[d] !== undefined) data[d] = dateOrNull(b[d]);
    if (data.active === false) data.status = 'INACTIVE';
    return id ? this.db.vehicle.update({ where: { id }, data }) : this.db.vehicle.create({ data });
  }
  async addLog(vehicleId: string, u: U, b: { type: string; amountPaise?: number; date?: string; odometerKm?: number; litres?: number; vendorName?: string; description?: string; photo?: string; nextDueKm?: number; nextDueOn?: string }) {
    if (!LOG_TYPES.includes(b.type)) throw new BadRequestException(`type must be one of ${LOG_TYPES.join(', ')}`);
    if (u.role === 'RIDER') { const v = await this.db.vehicle.findFirst({ where: { id: vehicleId, assignedRiderId: u.sub } }); if (!v) throw new ForbiddenException('Not your vehicle'); if (!['FUEL', 'TOLL'].includes(b.type)) throw new ForbiddenException('Riders log fuel and tolls; Ops logs maintenance'); }
    if (b.photo && b.photo.length > 560_000) throw new BadRequestException('Receipt photo too large (max ~400 KB)');
    const amt = Math.round(Number(b.amountPaise) || 0); if (amt < 0) throw new BadRequestException('Bad amount');
    const v = await this.db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    const odo = b.odometerKm !== undefined && b.odometerKm !== null ? Math.round(Number(b.odometerKm)) : undefined;
    if (odo !== undefined && odo < v.odometerKm - 50) throw new BadRequestException(`Odometer ${odo} km is below the last reading (${v.odometerKm} km)`);
    const row = await this.db.vehicleLog.create({ data: { vehicleId, type: b.type, amountPaise: amt, date: b.date ? new Date(b.date) : new Date(), odometerKm: odo ?? null, litres: b.litres ? Number(b.litres) : null, vendorName: b.vendorName?.trim() || null, description: b.description?.trim() || null, photo: b.photo || null, byUserId: u.sub, nextDueKm: b.nextDueKm ? Math.round(Number(b.nextDueKm)) : null, nextDueOn: dateOrNull(b.nextDueOn) ?? null } });
    const upd: any = {}; if (odo !== undefined && odo > v.odometerKm) upd.odometerKm = odo;
    if (b.type === 'MAINTENANCE' || b.type === 'REPAIR') { if (v.status === 'MAINTENANCE') upd.status = 'ACTIVE'; }
    if (Object.keys(upd).length) await this.db.vehicle.update({ where: { id: vehicleId }, data: upd });
    return row;
  }
  async removeLog(id: string) { await this.db.vehicleLog.delete({ where: { id } }); return { ok: true }; }
  async logs(q: { month?: string; type?: string; vehicleId?: string }) {
    const r = q.month ? monthRange(q.month) : null;
    const rows = await this.db.vehicleLog.findMany({ where: { ...(r ? { date: { gte: r.from, lt: r.to } } : {}), ...(q.type ? { type: q.type } : {}), ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}) }, include: { vehicle: { select: { regNo: true, type: true, ownership: true } } }, orderBy: { date: 'desc' }, take: 500 });
    return rows.map((l) => ({ ...l, photo: l.photo ? true : false }));
  }

  // ---------- rider: pre-trip check ----------
  async myVehicle(riderId: string) {
    const v = await this.db.vehicle.findFirst({ where: { assignedRiderId: riderId }, include: { vendor: { select: { name: true, phone: true } } } });
    if (!v) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const check = await this.db.tripCheck.findFirst({ where: { vehicleId: v.id, riderId, date: { gte: today } }, orderBy: { date: 'desc' } });
    const now = Date.now();
    return { ...v, checkedToday: !!check, todayCheck: check, checklistItems: CHECK_ITEMS, docAlerts: DOCS.filter((d) => v[d] && (v[d]!.getTime() - now) / 864e5 < 30).map((d) => ({ doc: DOC_LABEL[d], expiresOn: v[d], expired: v[d]! < new Date() })) };
  }
  async tripCheck(u: U, b: { vehicleId?: string; odometerStart?: number; checklist: Record<string, boolean>; issues?: string; routeId?: string }) {
    const v = b.vehicleId ? await this.db.vehicle.findFirst({ where: { id: b.vehicleId, assignedRiderId: u.sub } }) : await this.db.vehicle.findFirst({ where: { assignedRiderId: u.sub } });
    if (!v) throw new BadRequestException('No vehicle assigned to you — ask Ops');
    const checklist: Record<string, boolean> = {}; for (const k of CHECK_ITEMS) checklist[k] = b.checklist?.[k] !== false;
    const failed = CHECK_ITEMS.filter((k) => !checklist[k]); const ok = failed.length === 0 && !b.issues?.trim();
    const odo = b.odometerStart !== undefined ? Math.round(Number(b.odometerStart)) : null;
    const c = await this.db.tripCheck.create({ data: { vehicleId: v.id, riderId: u.sub, routeId: b.routeId || null, odometerStart: odo, checklist, ok, issues: b.issues?.trim() || null } });
    if (odo && odo > v.odometerKm) await this.db.vehicle.update({ where: { id: v.id }, data: { odometerKm: odo } });
    if (!ok) {
      const rider = await this.db.user.findUnique({ where: { id: u.sub } });
      const ops = await this.db.user.findMany({ where: { role: { in: ['OPS', 'ADMIN'] }, active: true }, select: { phone: true }, take: 5 });
      for (const o of ops) await this.notify.send(o.phone, 'vehicle_issue', `⚠️ ${v.regNo} pre-trip check by ${rider?.name}: ${failed.length ? failed.join(', ') + ' failed' : ''}${b.issues ? ` — ${b.issues.trim()}` : ''}. Check Admin → Fleet.`);
      if (failed.some((f) => ['brakes', 'tyres', 'lights'].includes(f))) await this.db.vehicle.update({ where: { id: v.id }, data: { status: 'MAINTENANCE' } });
    }
    return { ...c, failed, vehicleStatus: (await this.db.vehicle.findUnique({ where: { id: v.id } }))?.status };
  }
  async endTrip(u: U, b: { odometerEnd: number }) {
    const v = await this.db.vehicle.findFirst({ where: { assignedRiderId: u.sub } }); if (!v) throw new BadRequestException('No vehicle assigned');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const c = await this.db.tripCheck.findFirst({ where: { vehicleId: v.id, riderId: u.sub, date: { gte: today } }, orderBy: { date: 'desc' } });
    if (!c) throw new BadRequestException('No pre-trip check today');
    const end = Math.round(Number(b.odometerEnd)); if (!Number.isFinite(end) || (c.odometerStart && end < c.odometerStart)) throw new BadRequestException('End odometer must be ≥ start');
    await this.db.vehicle.update({ where: { id: v.id }, data: { odometerKm: Math.max(v.odometerKm, end) } });
    return this.db.tripCheck.update({ where: { id: c.id }, data: { odometerEnd: end } });
  }

  // ---------- costs / dashboard ----------
  /** Per-vehicle monthly cost: hire + logs, drops delivered on its routes, km from checks → cost per drop / per km. */
  async costs(month: string, vehicleIds?: string[]) {
    const { from, to, days } = monthRange(month);
    const vehicles = await this.db.vehicle.findMany({ where: vehicleIds ? { id: { in: vehicleIds } } : {}, include: { vendor: { select: { name: true } } }, orderBy: { regNo: 'asc' } });
    const ids = vehicles.map((v) => v.id);
    const [logs, drops, routes, checks, bills] = await Promise.all([
      this.db.vehicleLog.groupBy({ by: ['vehicleId', 'type'], where: { vehicleId: { in: ids }, date: { gte: from, lt: to } }, _sum: { amountPaise: true, litres: true } }),
      this.db.routeStop.groupBy({ by: ['routeId'], where: { status: 'DELIVERED', route: { vehicleId: { in: ids }, date: { gte: from, lt: to } } }, _count: { _all: true } }),
      this.db.route.findMany({ where: { vehicleId: { in: ids }, date: { gte: from, lt: to } }, select: { id: true, vehicleId: true, status: true } }),
      this.db.tripCheck.findMany({ where: { vehicleId: { in: ids }, date: { gte: from, lt: to } }, select: { vehicleId: true, odometerStart: true, odometerEnd: true } }),
      this.db.vehicleVendorLedger.groupBy({ by: ['vehicleId'], where: { vehicleId: { in: ids }, reason: 'BILL', periodFrom: from }, _sum: { deltaPaise: true } }),
    ]);
    const dropsByRoute = new Map(drops.map((d) => [d.routeId, d._count._all]));
    return vehicles.map((v) => {
      const mine = logs.filter((l) => l.vehicleId === v.id); const byType: Record<string, number> = {}; let litres = 0;
      for (const l of mine) { byType[l.type] = l._sum.amountPaise || 0; litres += l._sum.litres || 0; }
      const running = mine.reduce((a, l) => a + (l._sum.amountPaise || 0), 0);
      const billed = bills.find((b) => b.vehicleId === v.id)?._sum.deltaPaise;
      const hire = v.ownership === 'HIRED' ? (billed ?? (v.hireBasis === 'PER_MONTH' ? v.hireRatePaise : v.hireBasis === 'PER_DAY' ? v.hireRatePaise * days : 0)) : 0;
      const myRoutes = routes.filter((r) => r.vehicleId === v.id); const dropsN = myRoutes.reduce((a, r) => a + (dropsByRoute.get(r.id) || 0), 0);
      const km = checks.filter((c) => c.vehicleId === v.id && c.odometerEnd && c.odometerStart).reduce((a, c) => a + Math.max(0, c.odometerEnd! - c.odometerStart!), 0);
      const total = running + hire;
      return { vehicleId: v.id, regNo: v.regNo, type: v.type, ownership: v.ownership, vendor: v.vendor?.name || null, status: v.status, hirePaise: hire, hireEstimated: v.ownership === 'HIRED' && billed == null, fuelPaise: byType.FUEL || 0, maintenancePaise: (byType.MAINTENANCE || 0) + (byType.REPAIR || 0), otherPaise: (byType.TOLL || 0) + (byType.FINE || 0) + (byType.OTHER || 0), totalPaise: total, litres: Math.round(litres * 10) / 10, trips: myRoutes.filter((r) => r.status === 'COMPLETED').length, drops: dropsN, km, costPerDropPaise: dropsN ? Math.round(total / dropsN) : null, costPerKmPaise: km ? Math.round(total / km) : null, kmPerLitre: litres && km ? Math.round((km / litres) * 10) / 10 : null };
    });
  }
  async dashboard(month?: string) {
    const m = month || new Date().toISOString().slice(0, 7);
    const [vehicles, costs, vendors, alerts, pendingChecks] = await Promise.all([this.vehicles(), this.costs(m), this.vendors(), this.alerts(), this.db.tripCheck.count({ where: { ok: false, date: { gte: new Date(Date.now() - 7 * 864e5) } } })]);
    const total = costs.reduce((a, c) => a + c.totalPaise, 0); const drops = costs.reduce((a, c) => a + c.drops, 0);
    return { month: m, counts: { vehicles: vehicles.length, active: vehicles.filter((v) => v.status === 'ACTIVE').length, maintenance: vehicles.filter((v) => v.status === 'MAINTENANCE').length, hired: vehicles.filter((v) => v.ownership === 'HIRED').length, unassigned: vehicles.filter((v) => v.status === 'ACTIVE' && !v.assignedRiderId).length, docAlerts: alerts.length, failedChecks7d: pendingChecks, vendorsOwedPaise: vendors.reduce((a, v) => a + Math.max(0, v.balancePaise), 0) }, month_cost: { totalPaise: total, drops, costPerDropPaise: drops ? Math.round(total / drops) : null, fuelPaise: costs.reduce((a, c) => a + c.fuelPaise, 0), hirePaise: costs.reduce((a, c) => a + c.hirePaise, 0), maintenancePaise: costs.reduce((a, c) => a + c.maintenancePaise, 0) }, costs, alerts };
  }
  async alerts() {
    const vs = await this.db.vehicle.findMany({ where: { active: true }, include: { logs: { where: { type: { in: ['MAINTENANCE', 'REPAIR'] }, OR: [{ nextDueKm: { not: null } }, { nextDueOn: { not: null } }] }, orderBy: { date: 'desc' }, take: 1 } } });
    const out: { vehicleId: string; regNo: string; kind: string; detail: string; severity: 'warn' | 'due' }[] = []; const now = Date.now();
    for (const v of vs) {
      for (const d of DOCS) if (v[d]) { const days = Math.floor((v[d]!.getTime() - now) / 864e5); if (days < 30) out.push({ vehicleId: v.id, regNo: v.regNo, kind: DOC_LABEL[d], detail: days < 0 ? `expired ${-days} d ago` : `expires in ${days} d`, severity: days < 7 ? 'due' : 'warn' }); }
      const ls = v.logs[0];
      if (ls?.nextDueKm && v.odometerKm >= ls.nextDueKm - 300) out.push({ vehicleId: v.id, regNo: v.regNo, kind: 'Service', detail: v.odometerKm >= ls.nextDueKm ? `overdue by ${v.odometerKm - ls.nextDueKm} km` : `due in ${ls.nextDueKm - v.odometerKm} km`, severity: v.odometerKm >= ls.nextDueKm ? 'due' : 'warn' });
      if (ls?.nextDueOn && (ls.nextDueOn.getTime() - now) / 864e5 < 14) out.push({ vehicleId: v.id, regNo: v.regNo, kind: 'Service', detail: `due ${ls.nextDueOn.toISOString().slice(0, 10)}`, severity: ls.nextDueOn.getTime() < now ? 'due' : 'warn' });
    }
    return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'due' ? -1 : 1));
  }
  /** 08:00 IST daily: nudge Ops about documents / services falling due. */
  @Cron('30 2 * * *')
  async dailyAlerts() {
    const due = (await this.alerts()).filter((a) => a.severity === 'due'); if (!due.length) return;
    const ops = await this.db.user.findMany({ where: { role: { in: ['OPS', 'ADMIN'] }, active: true }, select: { phone: true }, take: 5 });
    const msg = `Fleet: ${due.slice(0, 6).map((a) => `${a.regNo} ${a.kind} ${a.detail}`).join('; ')}${due.length > 6 ? ` +${due.length - 6} more` : ''}`;
    for (const o of ops) await this.notify.send(o.phone, 'fleet_alert', msg);
    this.log.log(`Fleet alerts sent: ${due.length}`);
  }
}
