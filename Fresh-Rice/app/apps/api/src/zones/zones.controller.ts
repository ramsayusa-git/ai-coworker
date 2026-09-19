import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZonesService } from './zones.service';
import { Public, Roles } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
@ApiTags('zones') @Controller()
export class ZonesController {
  constructor(private svc: ZonesService, private db: PrismaService) {}
  @Public() @Get('zones/check') async check(@Query('pincode') pincode: string, @Query('date') date?: string) {
    const z = await this.svc.byPincode(pincode);
    if (!z) return { serviceable: false, waitlist: true };
    const d = date ? new Date(date) : null; if (d) d.setHours(0, 0, 0, 0);
    const slots: any[] = [];
    for (const s of z.slots) {
      const booked = d ? await this.db.order.count({ where: { slotId: s.id, deliveryDate: d, status: { notIn: ['CANCELLED', 'FAILED'] } } }) : 0;
      slots.push({ ...s, booked, available: s.capacity - booked });
    }
    return { serviceable: true, zone: { id: z.id, name: z.name, warehouseId: z.warehouseId }, slots };
  }
  @Public() @Get('zones') list() { return this.svc.list(); }
  @Roles('ADMIN') @Post('admin/zones') create(@Body() b: { name: string; pincodes: string[]; warehouseId?: string }) { return this.db.zone.create({ data: { name: b.name, pincodes: b.pincodes, warehouseId: b.warehouseId } }); }
  @Roles('ADMIN') @Patch('admin/zones/:id') update(@Param('id') id: string, @Body() b: any) { return this.db.zone.update({ where: { id }, data: { name: b.name, pincodes: b.pincodes, active: b.active, warehouseId: b.warehouseId } }); }
  @Roles('ADMIN') @Post('admin/zones/:id/slots') addSlot(@Param('id') id: string, @Body() b: { label: string; startHour: number; endHour: number; capacity: number }) { return this.db.slot.create({ data: { zoneId: id, ...b } }); }
  @Roles('ADMIN') @Patch('admin/slots/:id') updSlot(@Param('id') id: string, @Body() b: any) { return this.db.slot.update({ where: { id }, data: { label: b.label, startHour: b.startHour, endHour: b.endHour, capacity: b.capacity } }); }
  @Roles('ADMIN') @Delete('admin/slots/:id') async delSlot(@Param('id') id: string) { const n = await this.db.order.count({ where: { slotId: id } }); if (n) throw new Error('Slot has orders; edit instead'); await this.db.slot.delete({ where: { id } }); return { ok: true }; }
}
