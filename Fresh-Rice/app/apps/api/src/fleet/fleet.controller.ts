import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles, CurrentUser } from '../common/auth.guard';
import { sendExport } from '../common/export';
import { FleetService } from './fleet.service';

const OPS = ['ADMIN', 'OPS'];
@Controller()
export class FleetController {
  constructor(private svc: FleetService) {}

  @Roles(...OPS) @Get('admin/fleet/dashboard') dashboard(@Query('month') month?: string) { return this.svc.dashboard(month); }
  @Roles(...OPS) @Get('admin/fleet/alerts') alerts() { return this.svc.alerts(); }
  @Roles(...OPS) @Get('admin/fleet/costs') costs(@Query('month') month?: string) { return this.svc.costs(month || new Date().toISOString().slice(0, 7)); }

  @Roles(...OPS) @Get('admin/fleet/vendors') vendors() { return this.svc.vendors(); }
  @Roles(...OPS) @Post('admin/fleet/vendors') createVendor(@Body() b: any) { return this.svc.saveVendor(null, b); }
  @Roles(...OPS) @Patch('admin/fleet/vendors/:id') updateVendor(@Param('id') id: string, @Body() b: any) { return this.svc.saveVendor(id, b); }
  @Roles(...OPS) @Get('admin/fleet/vendors/:id/ledger') ledger(@Param('id') id: string) { return this.svc.vendorLedger(id); }
  @Roles(...OPS) @Post('admin/fleet/vendors/:id/ledger') addLedger(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.addLedger(id, u, b); }
  @Roles(...OPS) @Post('admin/fleet/vendors/:id/bill-hire') billHire(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { month?: string }) { return this.svc.billHire(id, u, b?.month || new Date().toISOString().slice(0, 7)); }

  @Roles(...OPS) @Get('admin/fleet/vehicles') vehicles(@Query('status') status?: string, @Query('vendorId') vendorId?: string) { return this.svc.vehicles({ status, vendorId }); }
  @Roles(...OPS) @Post('admin/fleet/vehicles') createVehicle(@Body() b: any) { return this.svc.saveVehicle(null, b); }
  @Roles(...OPS) @Get('admin/fleet/vehicles/:id') vehicle(@Param('id') id: string) { return this.svc.vehicle(id); }
  @Roles(...OPS) @Patch('admin/fleet/vehicles/:id') updateVehicle(@Param('id') id: string, @Body() b: any) { return this.svc.saveVehicle(id, b); }
  @Roles(...OPS) @Post('admin/fleet/vehicles/:id/logs') addLog(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.addLog(id, u, b); }
  @Roles('ADMIN') @Delete('admin/fleet/logs/:id') delLog(@Param('id') id: string) { return this.svc.removeLog(id); }
  @Roles(...OPS) @Get('admin/fleet/logs') logs(@Query('month') month?: string, @Query('type') type?: string, @Query('vehicleId') vehicleId?: string) { return this.svc.logs({ month, type, vehicleId }); }
  @Roles(...OPS) @Get('admin/fleet/export') async export(@Query('dataset') dataset: string, @Query('month') month: string, @Query('format') format: string, @Res({ passthrough: true }) res: Response) {
    const m = month || new Date().toISOString().slice(0, 7);
    if (dataset === 'costs') return sendExport(res, await this.svc.costs(m), format, { name: `fleet-costs-${m}`, title: `Fleet cost per vehicle ${m}`, totals: ['hirePaise', 'fuelPaise', 'maintenancePaise', 'otherPaise', 'totalPaise', 'drops', 'km'] });
    const rows = (await this.svc.logs({ month: m })).map((l) => ({ date: l.date, regNo: l.vehicle.regNo, type: l.type, amountPaise: l.amountPaise, litres: l.litres, odometerKm: l.odometerKm, vendorName: l.vendorName, description: l.description }));
    return sendExport(res, rows, format, { name: `fleet-logs-${m}`, title: `Vehicle expenses ${m}`, totals: ['amountPaise', 'litres'] });
  }

  // rider
  @Roles('RIDER') @Get('rider/vehicle') myVehicle(@CurrentUser() u: any) { return this.svc.myVehicle(u.sub); }
  @Roles('RIDER') @Post('rider/vehicle/check') check(@CurrentUser() u: any, @Body() b: any) { return this.svc.tripCheck(u, b); }
  @Roles('RIDER') @Post('rider/vehicle/end-trip') endTrip(@CurrentUser() u: any, @Body() b: { odometerEnd: number }) { return this.svc.endTrip(u, b); }
  @Roles('RIDER') @Post('rider/vehicle/:id/logs') riderLog(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.svc.addLog(id, u, b); }
}
