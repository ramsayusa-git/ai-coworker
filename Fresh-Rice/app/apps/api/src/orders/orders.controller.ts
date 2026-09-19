import { Body, Controller, Get, Param, Post, Query, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { OrdersService, CreateOrderInput } from './orders.service';
import { CurrentUser, Roles } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ZonesService } from '../zones/zones.service';

@ApiTags('orders') @ApiBearerAuth() @Controller()
export class OrdersController {
  constructor(private svc: OrdersService, private db: PrismaService, private zones: ZonesService) {}

  // Addresses
  @Get('addresses') addresses(@CurrentUser() u: any) { return this.db.address.findMany({ where: { userId: u.sub }, include: { zone: true } }); }
  @Post('addresses') async addAddress(@CurrentUser() u: any, @Body() b: any) {
    const zone = await this.zones.byPincode(b.pincode);
    return this.db.address.create({ data: { userId: u.sub, label: b.label || 'Home', line1: b.line1, landmark: b.landmark, complex: b.complex, floor: Number(b.floor || 0), hasLift: b.hasLift ?? true, pincode: b.pincode, lat: b.lat, lng: b.lng, zoneId: zone?.id }, include: { zone: true } });
  }
  @Delete('addresses/:id') async delAddress(@CurrentUser() u: any, @Param('id') id: string) { await this.db.address.deleteMany({ where: { id, userId: u.sub } }); return { ok: true }; }

  // Orders
  @Post('orders') create(@CurrentUser() u: any, @Body() b: CreateOrderInput) { return this.svc.create(u.sub, b); }
  @Get('orders/mine') mine(@CurrentUser() u: any) { return this.svc.mine(u.sub); }
  @Get('orders/:id') async get(@CurrentUser() u: any, @Param('id') id: string) {
    const o = await this.svc.get(id);
    if (o.userId !== u.sub && !['ADMIN', 'OPS', 'RIDER', 'SALES', 'MARKETING'].includes(u.role)) throw new Error('Forbidden');
    return o;
  }
  @Post('orders/:id/cancel') async cancel(@CurrentUser() u: any, @Param('id') id: string) {
    const o = await this.db.order.findUniqueOrThrow({ where: { id } });
    if (o.userId !== u.sub && !['ADMIN', 'OPS'].includes(u.role)) throw new Error('Forbidden');
    return this.svc.transition(id, 'CANCELLED', u.sub);
  }
  @Post('orders/:id/rate') rate(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { score: number; comment?: string }) { return this.svc.rate(id, u.sub, b.score, b.comment); }

  // Admin
  @Roles('ADMIN', 'OPS', 'SALES') @Get('admin/orders') list(@Query('status') status?: OrderStatus, @Query('date') date?: string, @Query('zoneId') zoneId?: string) { return this.svc.list({ status, date, zoneId }); }
  @Roles('ADMIN', 'OPS') @Patch('admin/orders/:id/status') setStatus(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { status: OrderStatus }) { return this.svc.transition(id, b.status, u.sub); }
}
