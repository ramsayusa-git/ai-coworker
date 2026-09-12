import { Injectable } from '@nestjs/common';
import { AddonProxyService } from '../addons/addon-proxy.service';

@Injectable()
export class CommandCenterService {
  constructor(private readonly addonProxy: AddonProxyService) {}

  async summary(organizationId: string) {
    return this.addonProxy.call(organizationId, 'command-center', '/summary', {});
  }
}
