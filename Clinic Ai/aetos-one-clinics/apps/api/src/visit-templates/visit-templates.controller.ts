import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { VisitTemplatesService } from './visit-templates.service';
import { CreateVisitTemplateDto } from './dto/create-visit-template.dto';
import { DraftVisitTemplateDto } from './dto/draft-visit-template.dto';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('visit-templates')
export class VisitTemplatesController {
  constructor(private readonly visitTemplates: VisitTemplatesService) {}

  @Get()
  list(@Req() req: TenantRequest) {
    return this.visitTemplates.list(req.organizationId!);
  }

  @Get(':id')
  findOne(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.visitTemplates.findOne(req.organizationId!, id);
  }

  @Post()
  create(@Req() req: TenantRequest, @Body() dto: CreateVisitTemplateDto) {
    return this.visitTemplates.create(req.organizationId!, dto);
  }

  @Post('draft')
  draft(@Req() req: TenantRequest, @Body() dto: DraftVisitTemplateDto) {
    return this.visitTemplates.draftFromDescription(req.organizationId!, dto);
  }

  @Post(':id/apply/:encounterId')
  apply(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Param('encounterId') encounterId: string,
  ) {
    return this.visitTemplates.applyToEncounter(req.organizationId!, id, encounterId);
  }
}
