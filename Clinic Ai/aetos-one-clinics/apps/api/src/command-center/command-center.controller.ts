import { Controller, Get, Req } from '@nestjs/common';
import { CommandCenterService } from './command-center.service';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('command-center')
export class CommandCenterController {
  constructor(private readonly commandCenter: CommandCenterService) {}

  @Get('summary')
  summary(@Req() req: TenantRequest) {
    return this.commandCenter.summary(req.organizationId!);
  }
}
