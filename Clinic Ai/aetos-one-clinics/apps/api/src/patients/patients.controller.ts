import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  create(@Req() req: TenantRequest, @Body() dto: CreatePatientDto) {
    return this.patients.create(req.organizationId!, dto);
  }

  @Get()
  findAll(@Req() req: TenantRequest, @Query('locationId') locationId?: string, @Query('q') q?: string) {
    if (q) return this.patients.findByPhoneOrAbha(req.organizationId!, q);
    return this.patients.findAll(req.organizationId!, locationId);
  }

  @Get(':id')
  findOne(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.patients.findOne(req.organizationId!, id);
  }
}
