import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('encounters')
export class EncountersController {
  constructor(private readonly encounters: EncountersService) {}

  @Post()
  create(@Req() req: TenantRequest, @Body() dto: CreateEncounterDto) {
    return this.encounters.create(req.organizationId!, dto);
  }

  @Get(':id')
  findOne(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.encounters.findOne(req.organizationId!, id);
  }

  @Post(':id/scribe-draft')
  scribeDraft(@Req() req: TenantRequest, @Param('id') id: string, @Body('input') input: string) {
    return this.encounters.requestScribeDraft(req.organizationId!, id, input);
  }

  @Patch(':id/finalize')
  finalize(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.encounters.finalize(req.organizationId!, id);
  }
}
