import { Controller, Get, Query, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@Req() req: TenantRequest, @Query('days') days?: string) {
    return this.analytics.overview(req.organizationId!, days ? parseInt(days, 10) : undefined);
  }
}
