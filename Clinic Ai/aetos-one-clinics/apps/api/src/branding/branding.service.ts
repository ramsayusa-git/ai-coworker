import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { promises as dns } from 'dns';
import { PrismaService } from '../common/prisma.service';

interface BrandingDefaults {
  productName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  customDomain: string | null;
  customDomainStatus: 'unset' | 'pending' | 'verified' | 'failed';
  customDomainActive: boolean;
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
  customDomainStatus: 'unset',
  customDomainActive: false,
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

// The CNAME target every custom domain points at. In a real deployment this is
// the platform's edge/load-balancer hostname; kept as one constant so it only
// has to change in one place.
const EDGE_HOST = 'edge.aetosone.clinics';

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async getForOrg(organizationId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const branding = await prisma.branding.findUnique({ where: { organizationId } });
    return branding ?? { organizationId, ...DEFAULTS };
  }

  /**
   * Public, unauthenticated lookups used before login (custom domain or platform
   * subdomain). A custom domain only resolves once it's BOTH DNS-verified and
   * explicitly activated — verifying alone must not silently go live, same
   * reasoning as an SSL cert being issued vs. actually being switched on.
   * The free `<slug>.aetosone.clinics` subdomain has no such gate: it's live
   * the moment it's saved, since there's no external DNS to get wrong.
   */
  async getByCustomDomain(customDomain: string) {
    const branding = await this.publicLookup({ customDomain });
    if (!branding || !branding.customDomainActive || branding.customDomainStatus !== 'verified') return null;
    return branding;
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
    const existing = await prisma.branding.findUnique({ where: { organizationId } });
    const domainChanged = 'customDomain' in data && (data.customDomain ?? null) !== (existing?.customDomain ?? null);

    const patch: Record<string, unknown> = { ...data };
    if (domainChanged) {
      // Any change to the domain — set or cleared — invalidates whatever was
      // verified/active before, and needs a fresh token if a domain is present.
      patch.customDomainStatus = data.customDomain ? 'pending' : 'unset';
      patch.customDomainActive = false;
      patch.domainVerificationToken = data.customDomain ? randomBytes(12).toString('hex') : null;
      patch.domainVerifiedAt = null;
    }

    return prisma.branding.upsert({
      where: { organizationId },
      update: patch,
      create: { organizationId, ...DEFAULTS, ...patch },
    });
  }

  /** The exact DNS records the org needs to add at their registrar, once a domain is saved. */
  async getDomainInstructions(organizationId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const branding = await prisma.branding.findUnique({ where: { organizationId } });
    if (!branding?.customDomain) return { records: [] };
    return {
      records: [
        { type: 'TXT', host: `_aetosclinics-verify.${branding.customDomain}`, value: branding.domainVerificationToken },
        { type: 'CNAME', host: branding.customDomain.split('.')[0], value: EDGE_HOST },
      ],
    };
  }

  /**
   * Real DNS lookups (Node's dns/promises) — no third-party API, no manual
   * approval step. Fails cleanly (not verified) rather than throwing when a
   * record is simply missing or not propagated yet.
   */
  async verifyDomain(organizationId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const branding = await prisma.branding.findUnique({ where: { organizationId } });
    if (!branding?.customDomain || !branding.domainVerificationToken) {
      throw new BadRequestException('Save a custom domain first');
    }

    let ownershipOk = false;
    let error: string | undefined;
    try {
      const txtRecords = await dns.resolveTxt(`_aetosclinics-verify.${branding.customDomain}`);
      ownershipOk = txtRecords.some((rr) => rr.join('').trim() === branding.domainVerificationToken);
    } catch (err) {
      error = (err as Error).message;
    }

    let cnameOk = false;
    try {
      const cnameRecords = await dns.resolveCname(branding.customDomain);
      cnameOk = cnameRecords.some((host) => host.toLowerCase().replace(/\.$/, '') === EDGE_HOST);
    } catch (err) {
      error = error ? `${error}; ${(err as Error).message}` : (err as Error).message;
    }

    const verified = ownershipOk && cnameOk;
    await prisma.branding.update({
      where: { organizationId },
      data: {
        customDomainStatus: verified ? 'verified' : 'failed',
        domainVerifiedAt: verified ? new Date() : null,
      },
    });

    return { status: verified ? 'verified' : 'failed', ownershipOk, cnameOk, expectedCname: EDGE_HOST, error };
  }

  /** Verifying and going live are separate steps on purpose — see getByCustomDomain(). */
  async setDomainActive(organizationId: string, active: boolean) {
    const prisma = await this.prisma.forTenant(organizationId);
    const branding = await prisma.branding.findUnique({ where: { organizationId } });
    if (active && branding?.customDomainStatus !== 'verified') {
      throw new BadRequestException('Verify the domain before activating it');
    }
    return prisma.branding.update({ where: { organizationId }, data: { customDomainActive: active } });
  }
}
