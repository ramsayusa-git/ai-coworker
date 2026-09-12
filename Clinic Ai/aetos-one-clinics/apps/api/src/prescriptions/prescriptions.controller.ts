import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Post()
  create(@Req() req: TenantRequest, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptions.create(req.organizationId!, dto);
  }

  @Get()
  findForEncounter(@Req() req: TenantRequest, @Query('encounterId') encounterId: string) {
    return this.prescriptions.findForEncounter(req.organizationId!, encounterId);
  }

  @Patch(':id/activate')
  activate(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.prescriptions.activate(req.organizationId!, id);
  }
}
