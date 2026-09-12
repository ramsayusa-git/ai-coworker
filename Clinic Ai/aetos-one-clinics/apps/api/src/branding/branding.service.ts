import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

interface BrandingDefaults {
  productName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  customDomain: string | null;
  subdomain: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  footerText: string | null;
  hidePoweredBy: boolean;
}

const DEFAULTS: BrandingDefaults = {
  productName: 'Aetos One Clinics',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#1F3A5F',
  accentColor: '#2F855A',
  customDomain: null,
  subdomain: null,
  supportEmail: null,
  supportPhone: null,
  footerText: null,
  hidePoweredBy: false,
};

// Lowercase letters, digits, hyphens; no leading/trailing hyphen. Matches the
// usual DNS label rules for a subdomain like "sunrise" in sunrise.aetosone.clinics.
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'app', 'admin', 'mail', 'staging']);

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async getForOrg(organizationId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const branding = await prisma.branding.findUnique({ where: { organizationId } });
    return branding ?? { organizationId, ...DEFAULTS };
  }

  /** Public, unauthenticated lookups used before login (custom domain or platform subdomain). */
  async getByCustomDomain(customDomain: string) {
    return this.publicLookup({ customDomain });
  }

  async getBySubdomain(subdomain: string) {
    return this.publicLookup({ subdomain: subdomain.toLowerCase() });
  }

  private async publicLookup(where: { customDomain: string } | { subdomain: string }) {
    // Lifts the RLS tenant check for this one read via the public_domain_lookup
    // escape hatch in prisma/rls.sql — safe because branding rows contain no PHI.
    await this.prisma.$executeRawUnsafe(`SET app.public_domain_lookup = 'true'`);
    const branding = await this.prisma.branding.findUnique({ where: where as any });
    await this.prisma.$executeRawUnsafe(`SET app.public_domain_lookup = 'false'`);
    return branding ?? null;
  }

  async upsert(organizationId: string, data: Partial<BrandingDefaults>) {
    if (data.subdomain) {
      const slug = data.subdomain.toLowerCase();
      if (!SUBDOMAIN_PATTERN.test(slug)) {
        throw new BadRequestException('Subdomain must be lowercase letters, digits, and hyphens only');
      }
      if (RESERVED_SUBDOMAINS.has(slug)) {
        throw new BadRequestException(`"${slug}" is reserved and cannot be used as a subdomain`);
      }
      data = { ...data, subdomain: slug };
    }
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.branding.upsert({
      where: { organizationId },
      update: data,
      create: { organizationId, ...DEFAULTS, ...data },
    });
  }
}
