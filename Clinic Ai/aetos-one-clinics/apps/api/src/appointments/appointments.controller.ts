import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post()
  create(@Req() req: TenantRequest, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(req.organizationId!, dto);
  }

  @Get('queue')
  queue(@Req() req: TenantRequest, @Query('locationId') locationId: string, @Query('date') date: string) {
    return this.appointments.findQueue(req.organizationId!, locationId, date ?? new Date().toISOString());
  }

  @Patch(':id/status')
  updateStatus(@Req() req: TenantRequest, @Param('id') id: string, @Body('status') status: string) {
    return this.appointments.updateStatus(req.organizationId!, id, status);
  }

  @Patch(':id/triage-score')
  updateTriage(@Req() req: TenantRequest, @Param('id') id: string, @Body('triageScore') score: number) {
    return this.appointments.updateTriageScore(req.organizationId!, id, score);
  }
}
