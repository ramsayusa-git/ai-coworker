import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AddonRegistryService } from './addon-registry.service';
import { AddonSupervisorService } from './addon-supervisor.service';

/**
 * Minimal event bus facade. In this scaffold it delivers events synchronously
 * over HTTP to any *enabled* add-on subscribed to that event type (see each
 * addon.yaml's `subscribesTo`). Swap the body of `publish` for a real
 * Redis Streams / NATS producer at Phase 1 scale without touching callers —
 * every clinical service already goes through this facade rather than
 * calling an add-on directly.
 */
@Injectable()
export class AddonBusService {
  private readonly logger = new Logger(AddonBusService.name);

  constructor(
    private readonly registry: AddonRegistryService,
    private readonly supervisor: AddonSupervisorService,
  ) {}

  async publish(organizationId: string, event: string, payload: Record<string, unknown>) {
    const subscribers = this.registry.list().filter((m) => m.subscribesTo.includes(event));
    await Promise.all(
      subscribers.map(async (manifest) => {
        const enabled = await this.supervisor.isEnabled(organizationId, manifest.slug);
        if (!enabled) return;
        const url = `http://${manifest.slug}:${manifest.port}/events/${event}`;
        try {
          await axios.post(url, { organizationId, ...payload }, { timeout: 5000 });
        } catch (err) {
          this.logger.warn(`Add-on ${manifest.slug} failed to handle ${event}: ${(err as Error).message}`);
        }
      }),
    );
  }
}
