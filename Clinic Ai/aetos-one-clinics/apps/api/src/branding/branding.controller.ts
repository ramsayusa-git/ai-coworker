import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { BrandingService } from './branding.service';
import { TenantRequest } from '../tenancy/tenant.middleware';
import { Roles } from '../auth/roles.decorator';

@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  get(@Req() req: TenantRequest) {
    return this.branding.getForOrg(req.organizationId!);
  }

  @Get('by-domain/:domain')
  getByDomain(@Param('domain') domain: string) {
    return this.branding.getByCustomDomain(domain);
  }

  /** Resolves branding for the free "<slug>.aetosone.clinics"-style subdomain, before login. */
  @Get('by-subdomain/:subdomain')
  getBySubdomain(@Param('subdomain') subdomain: string) {
    return this.branding.getBySubdomain(subdomain);
  }

  @Put()
  @Roles('OWNER', 'ADMIN')
  upsert(@Req() req: TenantRequest, @Body() body: Record<string, unknown>) {
    return this.branding.upsert(req.organizationId!, body as any);
  }
}
