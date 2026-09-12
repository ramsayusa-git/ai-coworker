import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deliberately uses the raw (non-tenant-scoped) Prisma client for the
   * `organization` read: this route is the one place the app is allowed to
   * see across organizations, because its job is to hand the caller an
   * organizationId to scope everything else with. `organizations` has no RLS
   * policy (nothing on that table to key it on), but `locations` does — its
   * policy hides every row until `app.current_org_id` is set — so locations
   * are fetched per-org via forTenant() rather than in one unscoped query.
   */
  async listWithLocations() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    const withLocations = [];
    for (const org of orgs) {
      const tenantPrisma = await this.prisma.forTenant(org.id);
      const locations = await tenantPrisma.location.findMany({
        where: { organizationId: org.id },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      withLocations.push({ ...org, locations });
    }
    return withLocations;
  }
}
