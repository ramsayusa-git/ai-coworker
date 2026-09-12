import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { AddonRegistryService } from './addon-registry.service';
import { AddonSupervisorService } from './addon-supervisor.service';
import { resolveAddonHost } from './addon-host.util';

/**
 * Synchronous request/response calls into an add-on (as opposed to the
 * fire-and-forget events in AddonBusService) — e.g. "run the AI scribe on
 * this audio now and give me back a draft SOAP note".
 */
@Injectable()
export class AddonProxyService {
  constructor(
    private readonly registry: AddonRegistryService,
    private readonly supervisor: AddonSupervisorService,
  ) {}

  async call<T = unknown>(organizationId: string, slug: string, requestPath: string, body: unknown): Promise<T> {
    const manifest = this.registry.get(slug);
    if (!manifest) throw new ServiceUnavailableException(`Unknown add-on: ${slug}`);
    const enabled = await this.supervisor.isEnabled(organizationId, slug);
    if (!enabled) throw new ServiceUnavailableException(`Add-on "${slug}" is not enabled for this clinic`);
    const url = `http://${resolveAddonHost(slug)}:${manifest.port}${requestPath}`;
    const res = await axios.post(url, { organizationId, ...(body as object) }, { timeout: 20000 });
    return res.data as T;
  }
}
