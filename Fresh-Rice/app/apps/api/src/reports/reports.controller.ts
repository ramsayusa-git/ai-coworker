import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/auth.guard';
import { startOfDay, addDays, ymd } from '../common/money';

function csv(rows: any[]) { if (!rows.length) return ''; const k = Object.keys(rows[0]); return [k.join(','), ...rows.map((r) => k.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n'); }

@ApiTags('reports') @ApiBearerAuth() @Roles('ADMIN', 'OPS') @Controller('admin/reports')
export class ReportsController {
  constructor(private db: PrismaService) {}
  private range(from?: string, to?: string) { const t = to ? startOfDay(new Date(to)) : startOfDay(); const f = from ? startOfDay(new Date(from)) : addDays(t, -29); return { f, t: addDays(t, 1) }; }

  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('daily') async daily(@Query('from') from?: string, @Query('to') to?: string, @Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const { f, t } = this.range(from, to);
    const orders = await this.db.order.findMany({ where: { deliveryDate: { gte: f, lt: t } }, include: { items: { include: { lot: true } } } });
    const byDay: Record<string, any> = {};
    for (const o of orders) {
      const d = ymd(o.deliveryDate); byDay[d] ??= { date: d, orders: 0, delivered: 0, cancelled: 0, revenuePaise: 0, kg: 0, cogsPaise: 0, gstPaise: 0 };
      const r = byDay[d]; r.orders++;
      if (o.status === 'DELIVERED') { r.delivered++; r.revenuePaise += o.totalPaise; r.kg += o.totalKg; r.gstPaise += o.gstPaise; r.cogsPaise += o.items.reduce((a, i) => a + (i.lot ? i.lot.costPaisePerKg * i.qty * 0 : 0), 0); }
      if (o.status === 'CANCELLED') r.cancelled++;
    }
    // COGS via lots: qty*packKg*cost
    for (const o of orders.filter((x) => x.status === 'DELIVERED')) { const d = ymd(o.deliveryDate); for (const i of o.items) { const sku = await this.db.sku.findUnique({ where: { id: i.skuId } }); if (i.lot && sku) byDay[d].cogsPaise += Math.round(i.lot.costPaisePerKg * sku.packKg * i.qty); } }
    const rows = Object.values(byDay).sort((a: any, b: any) => a.date.localeCompare(b.date)).map((r: any) => ({ ...r, grossMarginPct: r.revenuePaise ? Math.round(((r.revenuePaise - r.gstPaise - r.cogsPaise) / (r.revenuePaise - r.gstPaise)) * 100) : null }));
    if (format === 'csv') { res!.setHeader('Content-Type', 'text/csv'); res!.setHeader('Content-Disposition', `attachment; filename=daily-${ymd(f)}-${ymd(addDays(t, -1))}.csv`); return csv(rows); }
    return rows;
  }

  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('zones') async zones(@Query('from') from?: string, @Query('to') to?: string) {
    const { f, t } = this.range(from, to);
    const zones = await this.db.zone.findMany();
    const out: any[] = [];
    for (const z of zones) {
      const orders = await this.db.order.findMany({ where: { deliveryDate: { gte: f, lt: t }, address: { zoneId: z.id } }, include: { stop: true } });
      const delivered = orders.filter((o) => o.status === 'DELIVERED'); const failed = orders.filter((o) => o.status === 'FAILED');
      const routes = await this.db.route.count({ where: { zoneId: z.id, date: { gte: f, lt: t } } });
      const customers = new Set(orders.map((o) => o.userId)).size;
      out.push({ zone: z.name, orders: orders.length, delivered: delivered.length, failed: failed.length, onTimePct: delivered.length + failed.length ? Math.round((delivered.length / (delivered.length + failed.length)) * 100) : null, revenuePaise: delivered.reduce((a, o) => a + o.totalPaise, 0), kg: delivered.reduce((a, o) => a + o.totalKg, 0), customers, routes, dropsPerRoute: routes ? Math.round((delivered.length / routes) * 10) / 10 : null, deliveryCostPerDropPaise: delivered.length && routes ? Math.round((routes * 60000) / delivered.length) : null });
    }
    return out;
  }

  @Get('gst') async gst(@Query('from') from?: string, @Query('to') to?: string, @Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const { f, t } = this.range(from, to);
    const inv = await this.db.invoice.findMany({ where: { issuedAt: { gte: f, lt: t } }, include: { order: { select: { orderNo: true, channel: true, status: true } } }, orderBy: { issuedAt: 'asc' } });
    const rows = inv.map((i) => ({ invoiceNo: i.invoiceNo, date: ymd(i.issuedAt), orderNo: i.order.orderNo, channel: i.order.channel, buyer: i.buyerName, buyerGstin: i.buyerGstin || '', taxable: i.subtotalPaise / 100, cgst: i.gstPaise / 200, sgst: i.gstPaise / 200, total: i.totalPaise / 100, status: i.order.status }));
    if (format === 'csv') { res!.setHeader('Content-Type', 'text/csv'); res!.setHeader('Content-Disposition', `attachment; filename=gst-${ymd(f)}-${ymd(addDays(t, -1))}.csv`); return csv(rows); }
    const sum = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, total: a.total + r.total }), { taxable: 0, cgst: 0, sgst: 0, total: 0 });
    return { rows, summary: { ...sum, invoices: rows.length, b2b: rows.filter((r) => r.buyerGstin).length } };
  }

  @Get('payables') async payables() {
    const vendors = await this.db.vendor.findMany({ include: { ledger: true } });
    const now = new Date();
    return vendors.map((v) => { const bills = v.ledger.filter((l) => l.reason === 'bill'); const paid = -v.ledger.filter((l) => l.deltaPaise < 0).reduce((a, l) => a + l.deltaPaise, 0); const open = v.ledger.reduce((a, l) => a + l.deltaPaise, 0); return { vendor: v.name, type: v.type, billedPaise: bills.reduce((a, l) => a + l.deltaPaise, 0), paidPaise: paid, outstandingPaise: open, overduePaise: open > 0 ? bills.filter((l) => l.dueOn && l.dueOn < now).reduce((a, l) => a + l.deltaPaise, 0) : 0, nextDue: bills.filter((l) => l.dueOn && l.dueOn >= now).sort((a, b) => a.dueOn!.getTime() - b.dueOn!.getTime())[0]?.dueOn || null }; }).filter((r) => r.billedPaise > 0);
  }

  @Get('stock-valuation') async valuation() {
    const lots = await this.db.lot.findMany({ where: { onHandKg: { gt: 0 } }, include: { variety: true, warehouse: true } });
    const by: Record<string, any> = {};
    for (const l of lots) { const k = `${l.warehouse.code}|${l.variety.name}`; by[k] ??= { warehouse: l.warehouse.code, variety: l.variety.name, kg: 0, valuePaise: 0, lots: 0, oldestMilledOn: l.milledOn }; by[k].kg += l.onHandKg; by[k].valuePaise += Math.round(l.onHandKg * l.costPaisePerKg); by[k].lots++; if (l.milledOn < by[k].oldestMilledOn) by[k].oldestMilledOn = l.milledOn; }
    return Object.values(by);
  }

  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('cohorts') async cohorts() {
    const users = await this.db.user.findMany({ where: { role: 'CUSTOMER' }, include: { orders: { where: { status: 'DELIVERED' }, select: { deliveryDate: true, totalPaise: true } } } });
    const by: Record<string, any> = {};
    for (const u of users) { if (!u.orders.length) continue; const first = u.orders.map((o) => o.deliveryDate).sort((a, b) => a.getTime() - b.getTime())[0]; const k = first.toISOString().slice(0, 7); by[k] ??= { cohort: k, customers: 0, repeat: 0, orders: 0, revenuePaise: 0 }; by[k].customers++; if (u.orders.length > 1) by[k].repeat++; by[k].orders += u.orders.length; by[k].revenuePaise += u.orders.reduce((a, o) => a + o.totalPaise, 0); }
    return Object.values(by).map((r: any) => ({ ...r, repeatPct: Math.round((r.repeat / r.customers) * 100), ordersPerCustomer: Math.round((r.orders / r.customers) * 10) / 10 }));
  }
}
