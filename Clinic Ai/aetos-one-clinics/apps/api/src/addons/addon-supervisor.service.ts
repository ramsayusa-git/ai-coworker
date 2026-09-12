import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../common/prisma.service';
import { AddonRegistryService } from './addon-registry.service';
import { resolveAddonHost } from './addon-host.util';

/**
 * Per-organization add-on state: enable/disable, store config (API keys, provider
 * choice), and poll health — the same job Home Assistant Supervisor does for
 * add-ons, scoped per tenant here because different clinics enable different
 * add-ons (a Front Desk plan clinic has none enabled; a Full Suite clinic has
 * ai-scribe + follow-up + med-safety enabled).
 */
@Injectable()
export class AddonSupervisorService {
  private readonly logger = new Logger(AddonSupervisorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AddonRegistryService,
  ) {}

  async listForOrg(organizationId: string) {
    const prisma = await this.prisma.forTenant(organizationId);
    const installed = await prisma.addonInstallation.findMany({ where: { organizationId } });
    const installedBySlug = new Map(installed.map((i: (typeof installed)[number]) => [i.slug, i]));
    return this.registry.list().map((manifest) => ({
      manifest,
      state: installedBySlug.get(manifest.slug) ?? {
        slug: manifest.slug,
        enabled: false,
        configJson: {},
        lastHealthOk: null,
        lastHealthAt: null,
      },
    }));
  }

  async setEnabled(organizationId: string, slug: string, enabled: boolean) {
    const manifest = this.registry.get(slug);
    if (!manifest) throw new Error(`Unknown add-on: ${slug}`);
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.addonInstallation.upsert({
      where: { organizationId_slug: { organizationId, slug } },
      update: { enabled },
      create: { organizationId, slug, enabled, configJson: {} },
    });
  }

  async setConfig(organizationId: string, slug: string, config: Record<string, unknown>) {
    const manifest = this.registry.get(slug);
    if (!manifest) throw new Error(`Unknown add-on: ${slug}`);
    for (const field of manifest.configSchema) {
      if (field.required && !(field.key in config)) {
        throw new Error(`Add-on ${slug} requires config field "${field.key}"`);
      }
    }
    const prisma = await this.prisma.forTenant(organizationId);
    return prisma.addonInstallation.upsert({
      where: { organizationId_slug: { organizationId, slug } },
      update: { configJson: config as any },
      create: { organizationId, slug, enabled: false, configJson: config as any },
    });
  }

  async isEnabled(organizationId: string, slug: string): Promise<boolean> {
    const prisma = await this.prisma.forTenant(organizationId);
    const row = await prisma.addonInstallation.findUnique({
      where: { organizationId_slug: { organizationId, slug } },
    });
    return row?.enabled ?? false;
  }

  async checkHealth(organizationId: string, slug: string) {
    const manifest = this.registry.get(slug);
    if (!manifest) throw new Error(`Unknown add-on: ${slug}`);
    const url = `http://${resolveAddonHost(slug)}:${manifest.port}${manifest.healthPath}`;
    const prisma = await this.prisma.forTenant(organizationId);
    try {
      const res = await axios.get(url, { timeout: 3000 });
      const ok = res.status === 200;
      await prisma.addonInstallation.updateMany({
        where: { organizationId, slug },
        data: { lastHealthOk: ok, lastHealthAt: new Date() },
      });
      return { ok, message: undefined };
    } catch (err) {
      await prisma.addonInstallation.updateMany({
        where: { organizationId, slug },
        data: { lastHealthOk: false, lastHealthAt: new Date() },
      });
      const message = (err as Error).message;
      this.logger.warn(`Health check failed for ${slug}: ${message}`);
      return { ok: false, message };
    }
  }
}
