import { Controller, Get } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

/**
 * Pre-login bootstrap endpoint. There is no Keycloak/login flow wired up yet
 * (see TenantMiddleware), so the web app has no other way to learn which
 * organization/location to scope its requests to on first load. Excluded
 * from TenantMiddleware in tenancy.module.ts — it must be reachable with no
 * X-Org-Id header, since discovering that header's value is the whole point.
 */
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list() {
    return this.organizations.listWithLocations();
  }
}
