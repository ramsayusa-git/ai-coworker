import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/auth.guard';

@ApiTags('vendors') @ApiBearerAuth() @Roles('ADMIN', 'OPS') @Controller('admin')
export class VendorsController {
  constructor(private db: PrismaService) {}

  @Get('vendors') async list() {
    const vendors = await this.db.vendor.findMany({ include: { ledger: true, _count: { select: { lots: true, pos: true } } }, orderBy: { name: 'asc' } });
    return vendors.map((v) => ({ ...v, payablePaise: v.ledger.reduce((a, l) => a + l.deltaPaise, 0), overduePaise: v.ledger.filter((l) => l.reason === 'bill' && l.dueOn && l.dueOn < new Date()).reduce((a, l) => a + l.deltaPaise, 0), ledger: undefined }));
  }
  @Get('vendors/:id') get(@Param('id') id: string) {
    return this.db.vendor.findUniqueOrThrow({ where: { id }, include: { ledger: { orderBy: { at: 'desc' } }, pos: { orderBy: { createdAt: 'desc' }, include: { lines: { include: { variety: true } }, warehouse: true } }, lots: { orderBy: { receivedAt: 'desc' }, take: 20, include: { variety: true, warehouse: true } } } });
  }
  @Post('vendors') create(@Body() b: any) { return this.db.vendor.create({ data: { name: b.name, type: b.type || 'MILL', district: b.district, gstin: b.gstin, contact: b.contact, phone: b.phone, email: b.email, address: b.address, termsDays: b.termsDays ?? 7, rating: b.rating, notes: b.notes } }); }
  @Patch('vendors/:id') update(@Param('id') id: string, @Body() b: any) { return this.db.vendor.update({ where: { id }, data: { name: b.name, type: b.type, district: b.district, gstin: b.gstin, contact: b.contact, phone: b.phone, email: b.email, address: b.address, termsDays: b.termsDays, rating: b.rating, active: b.active, notes: b.notes } }); }
  @Post('vendors/:id/payments') pay(@Param('id') id: string, @Body() b: { amountRupees: number; ref: string }) {
    return this.db.vendorLedger.create({ data: { vendorId: id, deltaPaise: -Math.round(b.amountRupees * 100), reason: 'payment', ref: b.ref } });
  }

  // Purchase orders
  @Get('purchase-orders') pos() { return this.db.purchaseOrder.findMany({ include: { vendor: true, warehouse: true, lines: { include: { variety: true } } }, orderBy: { createdAt: 'desc' } }); }
  @Post('purchase-orders') async createPo(@Body() b: { vendorId: string; warehouseId: string; expectedOn?: string; notes?: string; lines: { varietyId: string; kg: number; rateRupeesPerKg: number }[] }) {
    const total = b.lines.reduce((a, l) => a + Math.round(l.rateRupeesPerKg * 100) * l.kg, 0);
    return this.db.purchaseOrder.create({ data: { vendorId: b.vendorId, warehouseId: b.warehouseId, expectedOn: b.expectedOn ? new Date(b.expectedOn) : null, notes: b.notes, totalPaise: Math.round(total), status: 'SENT', lines: { create: b.lines.map((l) => ({ varietyId: l.varietyId, kg: l.kg, ratePaisePerKg: Math.round(l.rateRupeesPerKg * 100) })) } }, include: { lines: true } });
  }
  @Patch('purchase-orders/:id') updatePo(@Param('id') id: string, @Body() b: { status: any }) { return this.db.purchaseOrder.update({ where: { id }, data: { status: b.status } }); }

  // Vendor portal login provisioning
  @Post('vendors/:id/portal-user') createPortalUser(@Param('id') id: string, @Body() b: { phone: string; name: string }) {
    const phone = '+91' + b.phone.replace(/\D/g, '').slice(-10);
    return this.db.user.upsert({
      where: { phone },
      update: { role: 'VENDOR_USER', name: b.name, vendorId: id, active: true },
      create: { phone, name: b.name, role: 'VENDOR_USER', vendorId: id, referralCode: 'VN' + phone.slice(-4) + Math.random().toString(36).slice(2, 4).toUpperCase() },
    });
  }
  @Get('vendors/:id/portal-users') portalUsers(@Param('id') id: string) { return this.db.user.findMany({ where: { vendorId: id, role: 'VENDOR_USER' } }); }
}
