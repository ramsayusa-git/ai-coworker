import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/auth.guard';

@ApiTags('warehouses') @ApiBearerAuth() @Roles('ADMIN', 'OPS') @Controller('admin/warehouses')
export class WarehousesController {
  constructor(private db: PrismaService) {}
  @Get() async list() {
    const whs = await this.db.warehouse.findMany({ include: { zones: true, lots: { where: { onHandKg: { gt: 0 } }, include: { variety: true } } }, orderBy: { code: 'asc' } });
    return whs.map((w) => ({ ...w, onHandKg: w.lots.reduce((a, l) => a + l.onHandKg, 0), stockValuePaise: Math.round(w.lots.reduce((a, l) => a + l.onHandKg * l.costPaisePerKg, 0)), lotCount: w.lots.length, lots: undefined }));
  }
  @Post() create(@Body() b: { code: string; name: string; address?: string; pincode?: string }) { return this.db.warehouse.create({ data: b }); }
  @Patch(':id') update(@Param('id') id: string, @Body() b: any) { return this.db.warehouse.update({ where: { id }, data: { name: b.name, address: b.address, pincode: b.pincode, active: b.active, lat: b.lat === undefined ? undefined : (b.lat === null ? null : Number(b.lat)), lng: b.lng === undefined ? undefined : (b.lng === null ? null : Number(b.lng)), geofenceM: b.geofenceM === undefined ? undefined : Math.max(50, Number(b.geofenceM) || 300) } }); }
  @Patch(':id/zones') async setZones(@Param('id') id: string, @Body() b: { zoneIds: string[] }) {
    await this.db.zone.updateMany({ where: { id: { in: b.zoneIds } }, data: { warehouseId: id } });
    return this.db.warehouse.findUnique({ where: { id }, include: { zones: true } });
  }
}
