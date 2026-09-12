import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AddonSupervisorService } from './addon-supervisor.service';
import { TenantRequest } from '../tenancy/tenant.middleware';
import { Roles } from '../auth/roles.decorator';

/**
 * Powers the web "Add-ons" store page — list (manifest + per-org state),
 * enable/disable, configure, and health check. Modeled directly on the
 * Home Assistant Supervisor add-on store API shape.
 */
@Controller('addons')
export class AddonsController {
  constructor(private readonly supervisor: AddonSupervisorService) {}

  @Get()
  list(@Req() req: TenantRequest) {
    return this.supervisor.listForOrg(req.organizationId!);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':slug/enabled')
  setEnabled(@Req() req: TenantRequest, @Param('slug') slug: string, @Body('enabled') enabled: boolean) {
    return this.supervisor.setEnabled(req.organizationId!, slug, enabled);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':slug/config')
  setConfig(@Req() req: TenantRequest, @Param('slug') slug: string, @Body() config: Record<string, unknown>) {
    return this.supervisor.setConfig(req.organizationId!, slug, config);
  }

  @Post(':slug/health-check')
  healthCheck(@Req() req: TenantRequest, @Param('slug') slug: string) {
    return this.supervisor.checkHealth(req.organizationId!, slug);
  }
}
