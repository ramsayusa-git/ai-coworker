import { Body, Controller, Get, Param, Post, Query, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, CurrentUser } from '../common/auth.guard';
import { sendExport } from '../common/export';
import { startOfDay, addDays } from '../common/money';

const norm = (p: string) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '+91' + d : d.length === 12 && d.startsWith('91') ? '+' + d : null; };

/**
 * Bulk data in/out.
 *  GET  /admin/export/:dataset?format=csv|xlsx|pdf&from&to   datasets: orders, customers, leads, b2b, invoices, shifts, staff, riders
 *  POST /admin/import/:dataset  { rows: [...], commit: bool }  datasets: leads, customers, b2b, prices — validates every row; writes only when commit=true
 */
@ApiTags('data-io') @ApiBearerAuth() @Roles('ADMIN', 'OPS') @Controller('admin')
export class DataIoController {
  constructor(private db: PrismaService) {}

  @Roles('ADMIN', 'OPS', 'SALES', 'MARKETING') @Get('export/:dataset') async exp(@CurrentUser() u: any, @Param('dataset') ds: string, @Query('format') format = 'csv', @Query('from') from?: string, @Query('to') to?: string, @Res({ passthrough: true }) res?: Response) {
    const t = to ? addDays(startOfDay(new Date(to)), 1) : addDays(startOfDay(), 1); const f = from ? startOfDay(new Date(from)) : addDays(t, -30);
    const sub = `${f.toISOString().slice(0, 10)} to ${addDays(t, -1).toISOString().slice(0, 10)}`;
    switch (ds) {
      case 'orders': {
        const rows = (await this.db.order.findMany({ where: { createdAt: { gte: f, lt: t } }, include: { user: { select: { name: true, phone: true } }, address: { select: { line1: true, complex: true, pincode: true, zone: { select: { name: true } } } }, items: { include: { sku: true } }, payment: true }, orderBy: { orderNo: 'desc' } }))
          .map((o) => ({ orderNo: o.orderNo, date: o.createdAt, deliveryDate: o.deliveryDate, status: o.status, channel: o.channel, customer: o.user.name || '', phone: o.user.phone, zone: o.address.zone?.name || '', address: `${o.address.line1}${o.address.complex ? ', ' + o.address.complex : ''} ${o.address.pincode}`, items: o.items.map((i) => `${i.qty}x${i.sku.code}`).join(' '), kg: o.totalKg, subtotalPaise: o.subtotalPaise, gstPaise: o.gstPaise, discountPaise: o.discountPaise, totalPaise: o.totalPaise, payment: o.payment?.method || '', paymentStatus: o.payment?.status || '', coupon: o.couponCode || '' }));
        return sendExport(res!, rows, format, { name: 'orders', title: 'Orders', subtitle: sub, totals: ['kg', 'subtotalPaise', 'gstPaise', 'discountPaise', 'totalPaise'] });
      }
      case 'customers': {
        if (!['ADMIN', 'OPS', 'SALES'].includes(u.role)) throw new BadRequestException('Not allowed');
        const rows = (await this.db.user.findMany({ where: { role: 'CUSTOMER' }, include: { addresses: { take: 1, include: { zone: true } }, orders: { where: { status: 'DELIVERED' }, select: { totalPaise: true, deliveryDate: true } } }, orderBy: { createdAt: 'desc' } }))
          .map((c) => ({ name: c.name || '', phone: c.phone, email: c.email || '', joined: c.createdAt, zone: c.addresses[0]?.zone?.name || '', complex: c.addresses[0]?.complex || '', pincode: c.addresses[0]?.pincode || '', orders: c.orders.length, lifetimePaise: c.orders.reduce((a, o) => a + o.totalPaise, 0), lastOrder: c.orders.map((o) => o.deliveryDate).sort().pop() || null, wallet: c.walletBalance, referralCode: c.referralCode || '', householdSize: c.householdSize || '' }));
        return sendExport(res!, rows, format, { name: 'customers', title: 'Customers', totals: ['orders', 'lifetimePaise'] });
      }
      case 'leads': {
        const rows = (await this.db.lead.findMany({ include: { assignedTo: { select: { name: true } }, activities: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' } }))
          .map((l) => ({ name: l.name, phone: l.phone, company: l.company || '', source: l.source || '', status: l.status, assignedTo: l.assignedTo?.name || '', estValuePaise: l.estValuePaise || 0, nextFollowUp: l.nextFollowUpAt, lastActivity: l.activities[0] ? `${l.activities[0].type} ${l.activities[0].note || ''}`.trim() : '', notes: l.notes || '', created: l.createdAt, updated: l.updatedAt }));
        return sendExport(res!, rows, format, { name: 'leads', title: 'Sales leads', totals: ['estValuePaise'] });
      }
      case 'b2b': {
        const rows = (await this.db.b2bAccount.findMany({ include: { users: { select: { name: true, phone: true } }, orders: { where: { status: 'DELIVERED' }, select: { totalPaise: true } } } }))
          .map((b: any) => ({ name: b.name, gstin: b.gstin || '', tier: b.tier, contact: b.users[0]?.name || '', phone: b.users[0]?.phone || '', orders: b.orders.length, lifetimePaise: b.orders.reduce((a: number, o: any) => a + o.totalPaise, 0), onHold: b.onHold ?? false, created: b.createdAt }));
        return sendExport(res!, rows, format, { name: 'b2b-accounts', title: 'B2B accounts', totals: ['orders', 'lifetimePaise'] });
      }
      case 'invoices': {
        const rows = (await this.db.invoice.findMany({ where: { issuedAt: { gte: f, lt: t } }, include: { order: { select: { orderNo: true, channel: true, status: true } } }, orderBy: { issuedAt: 'asc' } }))
          .map((i) => ({ invoiceNo: i.invoiceNo, issued: i.issuedAt, orderNo: i.order.orderNo, channel: i.order.channel, buyer: i.buyerName, gstin: i.buyerGstin || '', subtotalPaise: i.subtotalPaise, gstPaise: i.gstPaise, totalPaise: i.totalPaise, orderStatus: i.order.status }));
        return sendExport(res!, rows, format, { name: 'invoices', title: 'Invoices', subtitle: sub, totals: ['subtotalPaise', 'gstPaise', 'totalPaise'] });
      }
      case 'shifts': {
        const rows = (await this.db.shift.findMany({ where: { startedAt: { gte: f, lt: t } }, orderBy: { startedAt: 'asc' } }));
        const users = await this.db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true, phone: true, role: true } });
        const out = rows.map((r) => { const usr = users.find((x) => x.id === r.userId); const hours = Math.round((((r.endedAt || new Date()).getTime() - r.startedAt.getTime()) / 36e5) * 100) / 100; return { name: usr?.name || '', phone: usr?.phone || '', role: usr?.role || '', clockIn: r.startedAt, clockOut: r.endedAt, hours, autoClosed: r.autoClosed ? 'yes' : '', startLat: r.startLat ?? '', startLng: r.startLng ?? '' }; });
        return sendExport(res!, out, format, { name: 'shifts', title: 'Duty shifts', subtitle: sub, totals: ['hours'] });
      }
      case 'staff': case 'riders': {
        const rows = (await this.db.user.findMany({ where: ds === 'riders' ? { role: 'RIDER' } : { role: { in: ['MARKETING', 'SALES', 'OPS', 'ADMIN', 'WAREHOUSE_STAFF'] }, isSuperAdmin: false }, include: { warehouse: true }, orderBy: { name: 'asc' } }))
          .map((s) => ({ name: s.name || '', phone: s.phone, email: s.email || '', role: s.role, field: s.isField ? 'yes' : '', warehouse: s.warehouse?.code || '', active: s.active ? 'yes' : 'no', since: s.createdAt }));
        return sendExport(res!, rows, format, { name: ds, title: ds === 'riders' ? 'Riders' : 'Staff' });
      }
      default: throw new BadRequestException(`Unknown dataset ${ds}`);
    }
  }

  @Post('import/:dataset') async imp(@CurrentUser() u: any, @Param('dataset') ds: string, @Body() b: { rows: Record<string, any>[]; commit?: boolean }) {
    const rows = (b.rows || []).slice(0, 5000); if (!rows.length) throw new BadRequestException('No rows');
    const results: { row: number; ok: boolean; errors: string[]; action?: string }[] = [];
    const g = (r: any, ...keys: string[]) => { for (const k of keys) { const hit = Object.keys(r).find((x) => x.trim().toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase().replace(/[\s_-]/g, '')); if (hit && String(r[hit]).trim() !== '') return String(r[hit]).trim(); } return ''; };
    let created = 0, updated = 0;
    if (ds === 'leads') {
      const reps = await this.db.user.findMany({ where: { role: { in: ['SALES', 'ADMIN', 'OPS'] } }, select: { id: true, name: true, phone: true } });
      for (const [i, r] of rows.entries()) {
        const errors: string[] = []; const name = g(r, 'name', 'lead', 'contact'); const phone = norm(g(r, 'phone', 'mobile')); const status = (g(r, 'status', 'stage') || 'NEW').toUpperCase();
        if (!name) errors.push('name missing'); if (!phone) errors.push('phone invalid (10-digit Indian mobile)'); if (!['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'].includes(status)) errors.push(`status ${status} not one of NEW/CONTACTED/QUALIFIED/PROPOSAL/WON/LOST`);
        const repName = g(r, 'assignedTo', 'owner', 'rep'); const rep = repName ? reps.find((x) => x.name?.toLowerCase() === repName.toLowerCase() || x.phone === norm(repName)) : null; if (repName && !rep) errors.push(`rep "${repName}" not found`);
        const est = g(r, 'estValue', 'value', 'estValueRupees'); if (est && isNaN(Number(est))) errors.push('estValue not a number');
        const existing = phone ? await this.db.lead.findFirst({ where: { phone } }) : null;
        results.push({ row: i + 1, ok: !errors.length, errors, action: errors.length ? undefined : existing ? 'update' : 'create' });
        if (b.commit && !errors.length) {
          const data: any = { name, phone: phone!, company: g(r, 'company', 'society', 'organisation') || undefined, source: g(r, 'source') || 'import', status: status as any, assignedToId: rep?.id, estValuePaise: est ? Math.round(Number(est) * 100) : undefined, notes: g(r, 'notes', 'remarks') || undefined };
          if (existing) { await this.db.lead.update({ where: { id: existing.id }, data }); updated++; } else { await this.db.lead.create({ data }); created++; }
        }
      }
    } else if (ds === 'customers') {
      for (const [i, r] of rows.entries()) {
        const errors: string[] = []; const phone = norm(g(r, 'phone', 'mobile')); const name = g(r, 'name'); const email = g(r, 'email'); const pincode = g(r, 'pincode', 'pin');
        if (!phone) errors.push('phone invalid'); if (email && !/^[^@]+@[^@]+\.[^@]+$/.test(email)) errors.push('email invalid'); if (pincode && !/^\d{6}$/.test(pincode)) errors.push('pincode must be 6 digits');
        const existing = phone ? await this.db.user.findUnique({ where: { phone } }) : null; if (existing && existing.role !== 'CUSTOMER') errors.push(`phone belongs to a ${existing.role} account`);
        results.push({ row: i + 1, ok: !errors.length, errors, action: errors.length ? undefined : existing ? 'update' : 'create' });
        if (b.commit && !errors.length) {
          const user = existing ? await this.db.user.update({ where: { id: existing.id }, data: { name: name || undefined, email: email || undefined } }) : await this.db.user.create({ data: { phone: phone!, name: name || null, email: email || null, referralCode: 'FR' + phone!.slice(-4) + Math.random().toString(36).slice(2, 5).toUpperCase() } });
          existing ? updated++ : created++;
          const line1 = g(r, 'address', 'line1'); if (line1 && pincode && !(await this.db.address.findFirst({ where: { userId: user.id, line1 } }))) { const zone = await this.db.zone.findFirst({ where: { pincodes: { has: pincode } } }); await this.db.address.create({ data: { userId: user.id, line1, complex: g(r, 'complex', 'apartment') || null, pincode, zoneId: zone?.id } }); }
        }
      }
    } else if (ds === 'b2b') {
      for (const [i, r] of rows.entries()) {
        const errors: string[] = []; const name = g(r, 'name', 'company', 'business'); const phone = norm(g(r, 'phone', 'mobile', 'contactPhone')); const gstin = g(r, 'gstin').toUpperCase(); const tier = Number(g(r, 'tier') || 1);
        if (!name) errors.push('name missing'); if (!phone) errors.push('contact phone invalid'); if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) errors.push('GSTIN format invalid'); if (![1, 2, 3].includes(tier)) errors.push('tier must be 1, 2 or 3');
        const existing = await this.db.b2bAccount.findFirst({ where: { OR: [{ name }, ...(gstin ? [{ gstin }] : [])] } });
        results.push({ row: i + 1, ok: !errors.length, errors, action: errors.length ? undefined : existing ? 'update' : 'create' });
        if (b.commit && !errors.length) {
          const acct = existing ? await this.db.b2bAccount.update({ where: { id: existing.id }, data: { gstin: gstin || undefined, tier } }) : await this.db.b2bAccount.create({ data: { name, gstin: gstin || null, tier } as any });
          await this.db.user.upsert({ where: { phone: phone! }, update: { role: 'B2B_USER', b2bAccountId: acct.id, name: g(r, 'contact', 'contactName') || undefined }, create: { phone: phone!, role: 'B2B_USER', b2bAccountId: acct.id, name: g(r, 'contact', 'contactName') || null, referralCode: 'B2' + phone!.slice(-4) + Math.random().toString(36).slice(2, 4).toUpperCase() } });
          existing ? updated++ : created++;
        }
      }
    } else if (ds === 'prices') {
      const skus = await this.db.sku.findMany({ include: { variety: true } }); const zones = await this.db.zone.findMany();
      for (const [i, r] of rows.entries()) {
        const errors: string[] = []; const code = g(r, 'sku', 'skuCode', 'code').toUpperCase(); const sku = skus.find((s) => s.code === code); const scope = (g(r, 'scope') || 'BASE').toUpperCase(); const price = Number(g(r, 'price', 'priceRupees', 'rupees'));
        if (!sku) errors.push(`SKU ${code || '(blank)'} not found — known: ${skus.map((s) => s.code).join(', ')}`); if (!['BASE', 'ZONE', 'B2B_TIER'].includes(scope)) errors.push('scope must be BASE, ZONE or B2B_TIER'); if (!price || price <= 0) errors.push('price must be > 0');
        const zoneName = g(r, 'zone'); const zone = zoneName ? zones.find((z) => z.name.toLowerCase() === zoneName.toLowerCase()) : null; if (scope === 'ZONE' && !zone) errors.push(`zone "${zoneName}" not found`);
        const tier = Number(g(r, 'tier') || 0); if (scope === 'B2B_TIER' && ![1, 2, 3].includes(tier)) errors.push('tier must be 1-3 for B2B_TIER');
        results.push({ row: i + 1, ok: !errors.length, errors, action: errors.length ? undefined : 'create' });
        if (b.commit && !errors.length) { await this.db.priceList.create({ data: { skuId: sku!.id, scope: scope as any, zoneId: zone?.id, b2bTier: scope === 'B2B_TIER' ? tier : null, pricePaise: Math.round(price * 100) } }); created++; }
      }
    } else throw new BadRequestException(`Unknown dataset ${ds} — use leads, customers, b2b or prices`);
    if (b.commit) await this.db.event.create({ data: { actor: u.sub, type: 'import', payload: { dataset: ds, rows: rows.length, created, updated } } });
    return { dataset: ds, total: rows.length, valid: results.filter((r) => r.ok).length, invalid: results.filter((r) => !r.ok).length, committed: !!b.commit, created, updated, results };
  }
}
