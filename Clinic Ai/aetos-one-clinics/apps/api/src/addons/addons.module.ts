import { Module } from '@nestjs/common';
import { AddonsController } from './addons.controller';
import { AddonRegistryService } from './addon-registry.service';
import { AddonSupervisorService } from './addon-supervisor.service';
import { AddonBusService } from './addon-bus.service';
import { AddonProxyService } from './addon-proxy.service';

@Module({
  controllers: [AddonsController],
  providers: [AddonRegistryService, AddonSupervisorService, AddonBusService, AddonProxyService],
  exports: [AddonBusService, AddonProxyService, AddonSupervisorService],
})
export class AddonsModule {}
