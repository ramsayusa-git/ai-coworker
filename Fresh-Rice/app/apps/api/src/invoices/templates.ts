import { Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, Public } from '../common/auth.guard';
import { JwtService } from '@nestjs/jwt';
import { InvoicesService } from './invoices.service';


@Injectable()
export class InvoiceTemplatesService {
  constructor(private db: PrismaService) {}

  /** Seed one default template on first use so invoices never render without seller details. */
  async ensureDefault() {
    const n = await this.db.invoiceTemplate.count();
    if (!n) await this.db.invoiceTemplate.create({ data: { name: 'Standard (all channels)', channel: 'ANY', isDefault: true, nextNumber: (await this.db.invoice.count()) + 1 } }); // continue the pre-template FR series
  }

  list() { return this.db.invoiceTemplate.findMany({ orderBy: [{ isDefault: 'desc' }, { channel: 'asc' }, { name: 'asc' }] }); }

  /** Template for a channel: an active channel-specific default, else the ANY default, else any active one. */
  async forChannel(channel: 'B2C' | 'B2B') {
    await this.ensureDefault();
    return (await this.db.invoiceTemplate.findFirst({ where: { active: true, channel, isDefault: true } }))
      || (await this.db.invoiceTemplate.findFirst({ where: { active: true, channel: 'ANY', isDefault: true } }))
      || (await this.db.invoiceTemplate.findFirst({ where: { active: true, channel } }))
      || (await this.db.invoiceTemplate.findFirstOrThrow({ where: { active: true } }));
  }

  /** Atomically take the next number in this template's series: <prefix>/<FY>/<000123>. */
  async nextInvoiceNo(tpl: { id: string; numberPrefix: string }) {
    const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    for (let i = 0; i < 1000; i++) { // skip numbers already used (e.g. series edited by hand)
      const t = await this.db.invoiceTemplate.update({ where: { id: tpl.id }, data: { nextNumber: { increment: 1 } } });
      const no = `${t.numberPrefix}/${y}-${String(y + 1).slice(2)}/${String(t.nextNumber - 1).padStart(6, '0')}`;
      if (!(await this.db.invoice.findUnique({ where: { invoiceNo: no } }))) return no;
    }
    throw new BadRequestException('Invoice number series exhausted — raise "next number" on the template');
  }

  validate(b: any) {
    if (b.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(b.gstin)) throw new BadRequestException('GSTIN format invalid');
    if (b.logo && b.logo.length > 200 * 1024 * 1.37) throw new BadRequestException('Logo must be under 200 KB');
    if (b.logo && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(b.logo)) throw new BadRequestException('Logo must be a PNG/JPEG/WebP/SVG image');
    if (b.numberPrefix && !/^[A-Z0-9-]{1,8}$/.test(b.numberPrefix)) throw new BadRequestException('Prefix: 1-8 uppercase letters/digits');
    if (b.accentColor && !/^#[0-9a-fA-F]{6}$/.test(b.accentColor)) throw new BadRequestException('Accent colour must be #rrggbb');
    if (b.channel && !['B2C', 'B2B', 'ANY'].includes(b.channel)) throw new BadRequestException('channel must be B2C, B2B or ANY');
  }

  async create(b: any) { this.validate(b); const t = await this.db.invoiceTemplate.create({ data: this.pick(b) }); if (b.isDefault) await this.setDefault(t.id); return this.db.invoiceTemplate.findUnique({ where: { id: t.id } }); }
  async update(id: string, b: any) { this.validate(b); const t = await this.db.invoiceTemplate.update({ where: { id }, data: this.pick(b) }); if (b.isDefault) await this.setDefault(id); return this.db.invoiceTemplate.findUnique({ where: { id: t.id } }); }
  async setDefault(id: string) { const t = await this.db.invoiceTemplate.findUniqueOrThrow({ where: { id } }); await this.db.invoiceTemplate.updateMany({ where: { channel: t.channel, NOT: { id } }, data: { isDefault: false } }); return this.db.invoiceTemplate.update({ where: { id }, data: { isDefault: true, active: true } }); }
  async remove(id: string) { const used = await this.db.invoice.count({ where: { templateId: id } }); if (used) return this.db.invoiceTemplate.update({ where: { id }, data: { active: false, isDefault: false } }); return this.db.invoiceTemplate.delete({ where: { id } }); }
  private pick(b: any) { const keys = ['name', 'channel', 'brandName', 'legalName', 'address', 'gstin', 'fssai', 'phone', 'email', 'logo', 'accentColor', 'footer', 'terms', 'bankDetails', 'signatory', 'showLot', 'numberPrefix', 'nextNumber', 'active']; const d: any = {}; for (const k of keys) if (b[k] !== undefined) d[k] = b[k] === '' && !['name', 'brandName', 'legalName', 'address', 'gstin', 'fssai', 'footer', 'numberPrefix'].includes(k) ? null : b[k]; return d; }
}

@ApiTags('invoice-templates') @ApiBearerAuth() @Roles('ADMIN') @Controller('admin/invoice-templates')
export class InvoiceTemplatesController {
  constructor(private svc: InvoiceTemplatesService, @Inject(forwardRef(() => InvoicesService)) private invoices: InvoicesService, private db: PrismaService, private jwt: JwtService) {}
  @Roles('ADMIN', 'OPS') @Get() async list() { await this.svc.ensureDefault(); return this.svc.list(); }
  @Post() create(@Body() b: any) { return this.svc.create(b); }
  @Patch(':id') update(@Param('id') id: string, @Body() b: any) { return this.svc.update(id, b); }
  @Post(':id/default') setDefault(@Param('id') id: string) { return this.svc.setDefault(id); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
  /** Preview the template on a real recent order (or a sample) — html or pdf. */
  /** Opened in an <iframe>/<a> (no Authorization header) — JWT comes as ?t= like labels.html and invoice.html. */
  @Public() @Roles() @Get(':id/preview') async preview(@Query('t') t: string, @Param('id') id: string, @Query('format') format: string, @Res() res: Response) {
    try { const u: any = await this.jwt.verifyAsync(t || '', { secret: process.env.JWT_SECRET || 'dev' }); if (!['ADMIN', 'OPS'].includes(u.role)) throw new Error(); } catch { return res.status(401).send('Login required'); }
    const tpl = await this.db.invoiceTemplate.findUniqueOrThrow({ where: { id } });
    const order = await this.db.order.findFirst({ where: { status: { in: ['DELIVERED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'] }, ...(tpl.channel === 'B2B' ? { channel: 'B2B' } : {}) }, orderBy: { createdAt: 'desc' }, include: { user: true, b2bAccount: true, address: true, items: { include: { sku: { include: { variety: true } }, lot: true } }, payment: true } });
    if (!order) return res.status(400).send('No order to preview with yet');
    const inv = { invoiceNo: `${tpl.numberPrefix}/2026-27/PREVIEW`, revision: 1, status: 'ISSUED', issuedAt: new Date(), buyerName: order.b2bAccount?.name || order.user.name || order.user.phone, buyerGstin: order.b2bAccount?.gstin, buyerAddress: `${order.address.line1}, Hyderabad ${order.address.pincode}`, sellerGstin: tpl.gstin, fssaiNo: tpl.fssai, lines: this.invoices.linesFor(order), subtotalPaise: order.subtotalPaise, gstPaise: order.gstPaise, totalPaise: order.totalPaise };
    if (format === 'pdf') { const buf = await this.invoices.pdf(inv, order, tpl); res.setHeader('Content-Type', 'application/pdf'); return res.send(buf); }
    res.type('html').send(this.invoices.html(inv, order, { tpl }));
  }
}
