import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AddonManifest, AddonManifestSchema } from '@aetos/shared-types';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

/**
 * Discovers add-ons the same way Home Assistant Supervisor discovers add-ons:
 * scan a directory for `<slug>/addon.yaml`, validate each manifest, and hold the
 * result in memory as "the store". The web Add-ons page lists this registry;
 * AddonSupervisorService tracks per-organization enabled/disabled + config on
 * top of it.
 */
@Injectable()
export class AddonRegistryService implements OnModuleInit {
  private readonly logger = new Logger(AddonRegistryService.name);
  private manifests = new Map<string, AddonManifest>();

  onModuleInit() {
    this.reload();
  }

  reload() {
    const root = path.resolve(process.env.ADDON_REGISTRY_PATH ?? '../../addons');
    if (!fs.existsSync(root)) {
      this.logger.warn(`Add-on registry path not found: ${root}`);
      return;
    }
    for (const slug of fs.readdirSync(root)) {
      const manifestPath = path.join(root, slug, 'addon.yaml');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const raw = YAML.parse(fs.readFileSync(manifestPath, 'utf8'));
        const manifest = AddonManifestSchema.parse(raw);
        this.manifests.set(manifest.slug, manifest);
        this.logger.log(`Discovered add-on: ${manifest.slug}@${manifest.version}`);
      } catch (err) {
        this.logger.error(`Invalid addon.yaml at ${manifestPath}: ${(err as Error).message}`);
      }
    }
  }

  list(): AddonManifest[] {
    return [...this.manifests.values()];
  }

  get(slug: string): AddonManifest | undefined {
    return this.manifests.get(slug);
  }
}
