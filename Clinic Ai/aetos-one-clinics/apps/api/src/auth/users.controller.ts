import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from './roles.decorator';
import { TenantRequest } from '../tenancy/tenant.middleware';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('OWNER', 'ADMIN')
  list(@Req() req: TenantRequest) {
    return this.users.listForOrg(req.organizationId!);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(
    @Req() req: TenantRequest,
    @Body('keycloakSub') keycloakSub: string,
    @Body('name') name: string,
    @Body('role') role: 'OWNER' | 'ADMIN' | 'DOCTOR' | 'FRONT_DESK',
  ) {
    return this.users.create(req.organizationId!, keycloakSub, name, role);
  }

  @Patch(':id/role')
  @Roles('OWNER')
  updateRole(@Req() req: TenantRequest, @Param('id') id: string, @Body('role') role: 'OWNER' | 'ADMIN' | 'DOCTOR' | 'FRONT_DESK') {
    return this.users.updateRole(req.organizationId!, id, role);
  }
}
