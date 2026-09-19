import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/auth.guard';
import { startOfDay, addDays, ymd } from '../common/money';
import { sendExport } from '../common/export';

// Every report takes ?format=json|csv|xlsx|pdf (json when omitted).
@ApiTags('reports') @ApiBearerAuth() @Roles('ADMIN', 'OPS') @Controller('admin/reports')
export class ReportsController {
  constructor(private db: PrismaService) {}
  private range(from?: string, to?: string) { const t = to ? startOfDay(new Date(to)) : startOfDay(); const f = from ? startOfDay(new Date(from)) : addDays(t, -29); return { f, t: addDays(t, 1) }; }
  private sub(f: Date, t: Date) { return `${ymd(f)} to ${ymd(addDays(t, -1))}`; }

  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('daily') async daily(@Query('from') from?: string, @Query('to') to?: string, @Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const { f, t } = this.range(from, to);
    const orders = await this.db.order.findMany({ where: { deliveryDate: { gte: f, lt: t } }, include: { items: { include: { lot: true, sku: true } } } });
    const byDay: Record<string, any> = {};
    for (const o of orders) {
      const d = ymd(o.deliveryDate); byDay[d] ??= { date: d, orders: 0, delivered: 0, cancelled: 0, revenuePaise: 0, kg: 0, cogsPaise: 0, gstPaise: 0 };
      const r = byDay[d]; r.orders++;
      if (o.status === 'DELIVERED') { r.delivered++; r.revenuePaise += o.totalPaise; r.kg += o.totalKg; r.gstPaise += o.gstPaise; r.cogsPaise += o.items.reduce((a, i) => a + (i.lot ? Math.round(i.lot.costPaisePerKg * i.sku.packKg * i.qty) : 0), 0); }
      if (o.status === 'CANCELLED') r.cancelled++;
    }
    const rows = Object.values(byDay).sort((a: any, b: any) => a.date.localeCompare(b.date)).map((r: any) => ({ ...r, grossMarginPct: r.revenuePaise ? Math.round(((r.revenuePaise - r.gstPaise - r.cogsPaise) / (r.revenuePaise - r.gstPaise)) * 100) : null }));
    return sendExport(res!, rows, format, { name: 'daily-sales', title: 'Daily sales', subtitle: this.sub(f, t), totals: ['orders', 'delivered', 'cancelled', 'revenuePaise', 'kg', 'cogsPaise', 'gstPaise'] });
  }

  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('zones') async zones(@Query('from') from?: string, @Query('to') to?: string, @Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
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
    return sendExport(res!, out, format, { name: 'zone-economics', title: 'Zone economics', subtitle: this.sub(f, t), totals: ['orders', 'delivered', 'failed', 'revenuePaise', 'kg', 'customers', 'routes'] });
  }

  @Get('gst') async gst(@Query('from') from?: string, @Query('to') to?: string, @Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const { f, t } = this.range(from, to);
    const inv = await this.db.invoice.findMany({ where: { issuedAt: { gte: f, lt: t } }, include: { order: { select: { orderNo: true, channel: true, status: true } } }, orderBy: { issuedAt: 'asc' } });
    const rows = inv.map((i) => ({ invoiceNo: i.invoiceNo, date: ymd(i.issuedAt), orderNo: i.order.orderNo, channel: i.order.channel, buyer: i.buyerName, buyerGstin: i.buyerGstin || '', taxable: i.subtotalPaise / 100, cgst: i.gstPaise / 200, sgst: i.gstPaise / 200, total: i.totalPaise / 100, status: i.order.status }));
    if (format && format !== 'json') return sendExport(res!, rows, format, { name: 'gst-register', title: 'GST register', subtitle: this.sub(f, t), totals: ['taxable', 'cgst', 'sgst', 'total'] });
    const sum = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, total: a.total + r.total }), { taxable: 0, cgst: 0, sgst: 0, total: 0 });
    return { rows, summary: { ...sum, invoices: rows.length, b2b: rows.filter((r) => r.buyerGstin).length } };
  }

  @Get('payables') async payables(@Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const vendors = await this.db.vendor.findMany({ include: { ledger: true } });
    const now = new Date();
    const rows = vendors.map((v) => { const bills = v.ledger.filter((l) => l.reason === 'bill'); const paid = -v.ledger.filter((l) => l.deltaPaise < 0).reduce((a, l) => a + l.deltaPaise, 0); const open = v.ledger.reduce((a, l) => a + l.deltaPaise, 0); return { vendor: v.name, type: v.type, billedPaise: bills.reduce((a, l) => a + l.deltaPaise, 0), paidPaise: paid, outstandingPaise: open, overduePaise: open > 0 ? bills.filter((l) => l.dueOn && l.dueOn < now).reduce((a, l) => a + l.deltaPaise, 0) : 0, nextDue: bills.filter((l) => l.dueOn && l.dueOn >= now).sort((a, b) => a.dueOn!.getTime() - b.dueOn!.getTime())[0]?.dueOn || null }; }).filter((r) => r.billedPaise > 0);
    return sendExport(res!, rows, format, { name: 'vendor-payables', title: 'Vendor payables', totals: ['billedPaise', 'paidPaise', 'outstandingPaise', 'overduePaise'] });
  }

  @Get('stock-valuation') async valuation(@Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const lots = await this.db.lot.findMany({ where: { onHandKg: { gt: 0 } }, include: { variety: true, warehouse: true } });
    const by: Record<string, any> = {};
    for (const l of lots) { const k = `${l.warehouse.code}|${l.variety.name}`; by[k] ??= { warehouse: l.warehouse.code, variety: l.variety.name, kg: 0, valuePaise: 0, lots: 0, oldestMilledOn: l.milledOn }; by[k].kg += l.onHandKg; by[k].valuePaise += Math.round(l.onHandKg * l.costPaisePerKg); by[k].lots++; if (l.milledOn < by[k].oldestMilledOn) by[k].oldestMilledOn = l.milledOn; }
    return sendExport(res!, Object.values(by), format, { name: 'stock-valuation', title: 'Stock valuation', totals: ['kg', 'valuePaise', 'lots'] });
  }

  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('cohorts') async cohorts(@Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const users = await this.db.user.findMany({ where: { role: 'CUSTOMER' }, include: { orders: { where: { status: 'DELIVERED' }, select: { deliveryDate: true, totalPaise: true } } } });
    const by: Record<string, any> = {};
    for (const u of users) { if (!u.orders.length) continue; const first = u.orders.map((o) => o.deliveryDate).sort((a, b) => a.getTime() - b.getTime())[0]; const k = first.toISOString().slice(0, 7); by[k] ??= { cohort: k, customers: 0, repeat: 0, orders: 0, revenuePaise: 0 }; by[k].customers++; if (u.orders.length > 1) by[k].repeat++; by[k].orders += u.orders.length; by[k].revenuePaise += u.orders.reduce((a, o) => a + o.totalPaise, 0); }
    const rows = Object.values(by).map((r: any) => ({ ...r, repeatPct: Math.round((r.repeat / r.customers) * 100), ordersPerCustomer: Math.round((r.orders / r.customers) * 10) / 10 }));
    return sendExport(res!, rows, format, { name: 'customer-cohorts', title: 'Customer cohorts', totals: ['customers', 'repeat', 'orders', 'revenuePaise'] });
  }
}
