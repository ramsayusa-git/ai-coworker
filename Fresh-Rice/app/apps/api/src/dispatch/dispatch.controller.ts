import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DispatchService } from './dispatch.service';
import { CurrentUser, Roles } from '../common/auth.guard';

const STAFF = ['ADMIN', 'OPS', 'SALES', 'MARKETING'];

@ApiTags('dispatch') @ApiBearerAuth() @Controller()
export class DispatchController {
  constructor(private svc: DispatchService) {}
  @Roles('ADMIN', 'OPS') @Post('admin/dispatch/batch') batch(@Body() b: { date: string; vehicleType?: any }) { return this.svc.autoBatch(b.date, b.vehicleType); }
  @Roles('ADMIN', 'OPS') @Get('admin/dispatch/routes') routes(@Query('date') date?: string) { return this.svc.routes(date); }
  @Roles('ADMIN', 'OPS') @Post('admin/dispatch/routes/:id/assign') assign(@Param('id') id: string, @Body() b: { riderId: string }) { return this.svc.assign(id, b.riderId); }
  @Roles('ADMIN', 'OPS') @Post('admin/dispatch/routes/:id/optimise') optimise(@Param('id') id: string) { return this.svc.optimiseRoute(id); }

  // --- Rider management (ADMIN/OPS edit; all staff can read) ---
  @Roles(...STAFF) @Get('admin/riders') riders() { return this.svc.riders(); }
  @Roles('ADMIN', 'OPS') @Patch('admin/riders/:id') updateRider(@Param('id') id: string, @Body() b: { name?: string; active?: boolean }) { return this.svc.updateRider(id, b); }

  // --- Live tracking. Staff see every rider (on duty or not); customers/B2B see riders currently on a route.
  //     Phone numbers are included for everyone by owner decision (customers can call the rider directly). ---
  @Roles(...STAFF) @Get('admin/dispatch/live') live() { return this.svc.liveRiders(); }
  @Get('riders/live') liveForAll(@CurrentUser() u: any) { return this.svc.liveRiders(!STAFF.includes(u.role)); }

  // Live location ping — riders, and any staff flagged as field team (isField in the JWT). Others get 403.
  @Post('rider/location') ping(@CurrentUser() u: any, @Body() b: { lat: number; lng: number }) { if (u.role !== 'RIDER' && !u.isField) throw new ForbiddenException('Location sharing is only for riders and field staff'); return this.svc.ping(u.sub, b.lat, b.lng); }
  @Roles('RIDER') @Post('rider/stops/:id/scan') scan(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { lotNo: string }) { return this.svc.scanLoad(u.sub, id, b.lotNo); }
  @Get('orders/:id/rider-location') async riderLoc(@CurrentUser() u: any, @Param('id') id: string) {
    const stop = await this.svc['db'].routeStop.findUnique({ where: { orderId: id }, include: { route: { include: { rider: { select: { id: true, name: true, phone: true } } } }, order: { select: { userId: true, address: { select: { lat: true, lng: true } } } } } });
    if (!stop?.route.riderId || (stop.order.userId !== u.sub && !STAFF.includes(u.role))) return null;
    const loc = await this.svc.lastLocation(stop.route.riderId);
    return loc ? { lat: loc.lat, lng: loc.lng, at: loc.at, seq: stop.seq, eta: stop.eta, rider: stop.route.rider, dest: stop.order.address } : null;
  }
  @Roles('RIDER') @Get('rider/manifest') manifest(@CurrentUser() u: any) { return this.svc.riderManifest(u.sub); }
  @Roles('RIDER') @Post('rider/routes/:id/start') start(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.start(id, u.sub); }
  @Roles('RIDER') @Post('rider/stops/:id/deliver') deliver(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.deliver(id, u.sub, b); }
}
