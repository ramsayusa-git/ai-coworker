import { Controller, Get, Query, Patch, Param, Body, Post, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/auth.guard';
import { startOfDay, addDays } from '../common/money';
import { LotMilestonesService } from '../inventory/lot-milestones';

@ApiTags('admin') @ApiBearerAuth() @Roles('ADMIN', 'OPS') @Controller('admin')
export class AdminController {
  constructor(private db: PrismaService, private milestones: LotMilestonesService) {}

  /** Run the daily "rice birthday" job now (it also runs 10:00 IST via cron). */
  @Post('jobs/lot-milestones') runLotMilestones() { return this.milestones.run(); }

  /** Duplicate-scan / counterfeit watch: public /trace hits per lot in the last 24h, flagged when one lot code
   *  is being scanned from many distinct IPs (a copied QR on bags we didn't fill). */
  @Get('trace-scans') async traceScans(@Query('hours') hours = '24', @Query('minIps') minIps = '10') {
    const since = new Date(Date.now() - Number(hours) * 3600000);
    const rows = await this.db.traceScan.groupBy({ by: ['lotNo'], where: { at: { gte: since } }, _count: { _all: true } });
    const out: any[] = [];
    for (const r of rows) {
      const ips = await this.db.traceScan.findMany({ where: { lotNo: r.lotNo, at: { gte: since } }, distinct: ['ip'], select: { ip: true } });
      const lot = await this.db.lot.findUnique({ where: { lotNo: r.lotNo }, select: { onHandKg: true, receivedKg: true, variety: { select: { name: true } }, vendor: { select: { name: true } } } });
      out.push({ lotNo: r.lotNo, scans: r._count._all, distinctIps: ips.length, flagged: ips.length >= Number(minIps), variety: lot?.variety.name || null, mill: lot?.vendor.name || null, onHandKg: lot?.onHandKg ?? null, known: !!lot });
    }
    return out.sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.distinctIps - a.distinctIps);
  }

  @Get('dashboard') async dashboard() {
    const today = startOfDay(); const tomorrow = addDays(today, 1);
    const [todayOrders, tomorrowOrders, delivered, failed, revenue, customers, activeSubs, pendingPay] = await Promise.all([
      this.db.order.count({ where: { deliveryDate: today, status: { notIn: ['CANCELLED'] } } }),
      this.db.order.count({ where: { deliveryDate: tomorrow, status: { notIn: ['CANCELLED'] } } }),
      this.db.order.count({ where: { deliveryDate: today, status: 'DELIVERED' } }),
      this.db.order.count({ where: { deliveryDate: today, status: 'FAILED' } }),
      this.db.order.aggregate({ where: { createdAt: { gte: addDays(today, -30) }, status: { notIn: ['CANCELLED', 'FAILED'] } }, _sum: { totalPaise: true, totalKg: true } }),
      this.db.user.count({ where: { role: 'CUSTOMER' } }),
      this.db.subscription.count({ where: { status: 'ACTIVE' } }),
      this.db.order.count({ where: { status: 'PENDING_PAYMENT' } }),
    ]);
    const stock = await this.db.variety.findMany({ where: { isAddon: false }, include: { lots: { where: { onHandKg: { gt: 0 } } } } });
    const lowStock = stock.filter((v) => v.lots.reduce((a, l) => a + l.onHandKg, 0) < 500).map((v) => v.name);
    const atRisk = await this.db.user.count({ where: { role: 'CUSTOMER', orders: { some: {} , none: { createdAt: { gte: addDays(today, -35) } } } } });
    const b2b = await this.db.b2bLedger.findMany({ where: { reason: 'invoice', dueOn: { lt: new Date() } } });
    const nps = await this.db.event.findMany({ where: { type: 'nps' }, take: 100, orderBy: { at: 'desc' } });
    const scores = nps.map((e: any) => e.payload?.score).filter((s) => typeof s === 'number');
    const npsVal = scores.length ? Math.round(((scores.filter((s) => s >= 9).length - scores.filter((s) => s <= 6).length) / scores.length) * 100) : null;
    return { todayOrders, tomorrowOrders, delivered, failed, onTimePct: todayOrders ? Math.round((delivered / Math.max(1, delivered + failed)) * 100) : null, revenue30dPaise: revenue._sum.totalPaise || 0, kg30d: revenue._sum.totalKg || 0, customers, activeSubs, pendingPay, lowStock, atRiskCustomers: atRisk, b2bOverduePaise: b2b.reduce((a, l) => a + l.deltaPaise, 0), nps: npsVal, npsResponses: scores.length };
  }

  @Roles('ADMIN', 'OPS', 'SALES') @Get('customers') customers(@Query('q') q?: string) {
    return this.db.user.findMany({ where: { role: { in: ['CUSTOMER', 'B2B_USER'] }, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}) }, include: { _count: { select: { orders: true, subscriptions: true } }, addresses: { include: { zone: true } }, b2bAccount: true, orders: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, totalPaise: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
  @Patch('users/:id/role') setRole(@Param('id') id: string, @Body() b: { role: any }) { return this.db.user.update({ where: { id }, data: { role: b.role } }); }
  @Post('riders') async addRider(@Body() b: { phone: string; name: string }) {
    const phone = '+91' + b.phone.replace(/\D/g, '').slice(-10);
    return this.db.user.upsert({ where: { phone }, update: { role: 'RIDER', name: b.name }, create: { phone, name: b.name, role: 'RIDER', referralCode: 'RD' + phone.slice(-4) + Math.random().toString(36).slice(2, 4).toUpperCase() } });
  }
  @Get('prices') prices() { return this.db.priceList.findMany({ include: { sku: { include: { variety: true } }, zone: true }, orderBy: [{ sku: { code: 'asc' } }, { scope: 'asc' }] }); }
  @Post('prices') setPrice(@Body() b: { skuId: string; scope: any; zoneId?: string; b2bTier?: number; priceRupees: number }) {
    return this.db.priceList.create({ data: { skuId: b.skuId, scope: b.scope, zoneId: b.zoneId, b2bTier: b.b2bTier, pricePaise: Math.round(b.priceRupees * 100) } });
  }
  @Get('events') events() { return this.db.event.findMany({ orderBy: { at: 'desc' }, take: 100 }); }

  // Internal staff accounts: MARKETING, SALES, OPS, ADMIN, WAREHOUSE_STAFF.
  // The built-in super-admin (isSuperAdmin=true) is excluded here on purpose — it's not a
  // manageable staff record: nobody (including other ADMINs) can see, edit, deactivate,
  // or role-change it from this UI/API. It only exists via its own email+password login.
  private staffSelect = { id: true, phone: true, email: true, name: true, role: true, active: true, isField: true, warehouseId: true, createdAt: true, warehouse: true, _count: { select: { assignedLeads: true } } } as const;
  @Get('staff') @Roles('ADMIN') staff() {
    return this.db.user.findMany({ where: { role: { in: ['MARKETING', 'SALES', 'OPS', 'ADMIN', 'WAREHOUSE_STAFF'] }, isSuperAdmin: false }, select: this.staffSelect, orderBy: { createdAt: 'desc' } });
  }
  @Post('staff') @Roles('ADMIN') async createStaff(@Body() b: { phone: string; name: string; role: string; warehouseId?: string; isField?: boolean }) {
    const phone = '+91' + b.phone.replace(/\D/g, '').slice(-10);
    const existing = await this.db.user.findUnique({ where: { phone } });
    if (existing?.isSuperAdmin) throw new ForbiddenException('This account cannot be modified');
    return this.db.user.upsert({
      where: { phone },
      update: { role: b.role as any, name: b.name, warehouseId: b.role === 'WAREHOUSE_STAFF' ? b.warehouseId : null, active: true, isField: !!b.isField },
      create: { phone, name: b.name, role: b.role as any, warehouseId: b.role === 'WAREHOUSE_STAFF' ? b.warehouseId : null, isField: !!b.isField, referralCode: 'ST' + phone.slice(-4) + Math.random().toString(36).slice(2, 4).toUpperCase() },
      select: this.staffSelect,
    });
  }
  @Patch('staff/:id') @Roles('ADMIN') async updateStaff(@Param('id') id: string, @Body() b: { role?: string; warehouseId?: string; active?: boolean; name?: string; isField?: boolean }) {
    const target = await this.db.user.findUniqueOrThrow({ where: { id } });
    if (target.isSuperAdmin) throw new ForbiddenException('This account cannot be modified');
    return this.db.user.update({ where: { id }, data: { role: b.role as any, warehouseId: b.warehouseId, active: b.active, name: b.name, isField: b.isField }, select: this.staffSelect });
  }
}
